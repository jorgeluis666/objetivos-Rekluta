#!/usr/bin/env python3
"""Genera data/rk-ads-2026.json a partir de las exportaciones de Meta Ads y TikTok Ads.

Fuentes (carpetas de Google Drive, sincronizadas en G:):
  - Meta Files - Rekluta      -> un .xlsx por mes (Raw Data Report, USD, por dia/edad/sexo/anuncio)
  - Tik Tok Files - Rekluta   -> un .xlsx por mes (PEN, por dia/edad/sexo/anuncio)
  - Reportes Rekluta          -> Reporte_Rekluta_<Mes>_2026.pdf (reporte mensual entregado al cliente)

Reglas:
  - El Excel es la fuente principal. Cuando un mes no tiene Excel con datos (TikTok enero y febrero
    se pautaron en la cuenta anterior, septiembre aun no se exporta) se usa el reporte PDF.
  - Cada plataforma queda en su moneda de facturacion (TikTok S/., Meta US$), igual que el reporte.
  - Para los meses con Excel se cruza el total contra el resumen del reporte y se guarda la diferencia.

Uso:
  python scripts/build-ads-data.py [--root "G:/Mi unidad/.../Rekluta"]
Requiere: pandas, openpyxl, pypdf.
"""
import argparse
import glob
import json
import os
import re
import sys
import unicodedata
import warnings
from datetime import date

import pandas as pd
import pypdf

warnings.filterwarnings('ignore')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DRIVE = 'G:/Mi unidad/Agencia Lima Retail/01_Clientes y Ventas/02_Clientes de la agencia/Rekluta'
OUT = os.path.join(ROOT, 'data', 'rk-ads-2026.json')
CATALOG = os.path.join(ROOT, 'data', 'rk-drive-reports.json')
YEAR = 2026
MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
COUNTRIES = ['Perú', 'Chile', 'Ecuador']
TOP_ADS = 5


def norm(text):
    return unicodedata.normalize('NFD', str(text or '')).encode('ascii', 'ignore').decode().strip().lower()


def num(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    return 0.0 if pd.isna(number) else number


def r2(value):
    return round(float(value), 2)


def country_of(name):
    for country in COUNTRIES:
        if norm(country) in norm(name):
            return country
    return 'Multipaís'


def month_file(folder, month):
    matches = [path for path in glob.glob(os.path.join(folder, '*.xlsx')) if norm(os.path.basename(path)).startswith(norm(month))]
    return matches[0] if matches else None


def top(frame, sort_key, columns, url_column=None):
    grouped = frame.groupby('ad').agg(**columns)
    if url_column:
        grouped['url'] = frame.groupby('ad')[url_column].first()
    grouped = grouped[grouped['spend'] > 0].sort_values(sort_key, ascending=False).head(TOP_ADS)
    ads = []
    for name, row in grouped.iterrows():
        ad = {'name': str(name).strip()}
        for key in columns:
            ad[key] = r2(row[key]) if key == 'spend' else int(round(row[key]))
        if url_column and isinstance(row.get('url'), str) and row['url'].startswith('https://'):
            ad['url'] = row['url']
        ads.append(ad)
    return ads


# ── Meta Ads (Excel) ─────────────────────────────────────────────────────────
def meta_from_excel(path):
    frame = pd.read_excel(path)
    frame = frame.rename(columns={
        'Nombre de la campaña': 'campaign', 'Nombre del anuncio': 'ad', 'Objetivo': 'objective',
        'Importe gastado (USD)': 'spend', 'Impresiones': 'impressions', 'Alcance': 'reach',
        'Clics en el enlace': 'clicks', 'Interacciones': 'interactions', 'Resultados': 'results',
        'Tipo de resultado': 'resultType', 'Enlace de vista previa': 'preview', 'Día': 'day',
    })
    frame = frame[frame['campaign'].notna()]
    for column in ['spend', 'impressions', 'reach', 'clicks', 'interactions', 'results']:
        frame[column] = pd.to_numeric(frame[column], errors='coerce').fillna(0)
    campaigns = []
    for name, rows in frame.groupby('campaign'):
        spend = rows['spend'].sum()
        if spend <= 0:
            continue
        objective = str(rows['objective'].dropna().iloc[0]) if rows['objective'].notna().any() else ''
        is_messages = 'mensaje' in norm(name)
        # El reporte toma el alcance de "Resultados" en Reconocimiento (resultado = alcance).
        reach = rows['results'].sum() if not is_messages and (rows['resultType'] == 'Alcance').any() else rows['reach'].sum()
        impressions = rows['impressions'].sum()
        clicks = rows['clicks'].sum()
        campaigns.append({
            'name': str(name).strip(),
            'objective': objective,
            'group': 'Mensajes' if is_messages else 'Reconocimiento',
            'country': country_of(name),
            'spend': r2(spend),
            'impressions': int(impressions),
            'reach': int(reach),
            'clicks': int(clicks),
            'interactions': int(rows['interactions'].sum()),
            'cpm': r2(spend / impressions * 1000) if impressions else None,
            'cpc': round(spend / clicks, 4) if clicks else None,
            'topAds': top(rows, 'clicks', {'clicks': ('clicks', 'sum'), 'reach': ('reach', 'sum'), 'spend': ('spend', 'sum')}, 'preview'),
        })
    days = pd.to_datetime(frame['day'], errors='coerce').dropna()
    return campaigns, (days.min().date().isoformat(), days.max().date().isoformat()) if len(days) else (None, None)


# ── TikTok Ads (Excel) ───────────────────────────────────────────────────────
TIKTOK_GROUPS = {'visualizacion del video': 'Reconocimiento', 'interaccion con la comunidad': 'Seguidores', 'trafico': 'Mensajes'}


def tiktok_from_excel(path):
    frame = pd.read_excel(path)
    frame = frame.rename(columns={
        'Nombre de la campaña': 'campaign', 'Nombre del anuncio': 'ad', 'Objetivo publicitario': 'objective',
        'Gasto': 'spend', 'Impresiones': 'impressions', 'Alcance': 'reach', 'Clics (destino)': 'clicks',
        'Visualizaciones de vídeo': 'views', 'Seguidores de pago': 'followers', 'Visitas al perfil pagadas': 'profileVisits',
        'Por día': 'day', 'Moneda': 'currency',
    })
    frame['campaign'] = frame['campaign'].astype(str).str.strip()
    # La exportacion agrega una fila "Total: N resultados" (y solo esa fila si el mes esta vacio).
    frame = frame[~frame['campaign'].str.startswith('Total')]
    if frame.empty:
        return [], (None, None)
    currencies = set(frame['currency'].dropna().unique())
    if currencies - {'PEN'}:
        raise ValueError(f'{path}: moneda inesperada {currencies}')
    for column in ['spend', 'impressions', 'reach', 'clicks', 'views', 'followers', 'profileVisits']:
        frame[column] = pd.to_numeric(frame[column], errors='coerce').fillna(0)
    campaigns = []
    for name, rows in frame.groupby('campaign'):
        spend = rows['spend'].sum()
        if spend <= 0:
            continue
        objective = str(rows['objective'].iloc[0])
        group = TIKTOK_GROUPS.get(norm(objective), objective)
        impressions = rows['impressions'].sum()
        clicks = rows['clicks'].sum()
        sort_key = 'clicks' if group == 'Mensajes' else 'views'
        campaigns.append({
            'name': name,
            'objective': objective,
            'group': group,
            'country': country_of(name),
            'spend': r2(spend),
            'impressions': int(impressions),
            'views': int(rows['views'].sum()),
            'reach': int(rows['reach'].sum()),
            'clicks': int(clicks),
            'followers': int(rows['followers'].sum()),
            'profileVisits': int(rows['profileVisits'].sum()),
            'cpm': r2(spend / impressions * 1000) if impressions else None,
            'cpc': round(spend / clicks, 4) if clicks else None,
            'topAds': top(rows, sort_key, {'views': ('views', 'sum'), 'clicks': ('clicks', 'sum'), 'spend': ('spend', 'sum')}),
        })
    days = pd.to_datetime(frame['day'], errors='coerce').dropna()
    return campaigns, (days.min().date().isoformat(), days.max().date().isoformat()) if len(days) else (None, None)


# ── Reportes PDF ─────────────────────────────────────────────────────────────
def parse_number(text):
    text = text.replace('S/.', '').replace('$', '').replace(',', '').strip()
    try:
        return float(text)
    except ValueError:
        return None


def labelled(text, label):
    """Valor impreso en la linea anterior a la etiqueta (asi maqueta el reporte cada KPI)."""
    match = re.search(r'^([^\n]+)\n' + re.escape(label) + r'\s*$', text, re.M)
    return parse_number(match.group(1)) if match else None


def parse_ads(text, columns):
    block = text.split('Mejores Anuncios', 1)[1] if 'Mejores Anuncios' in text else ''
    block = block.split('Análisis', 1)[0]
    ads = []
    count = len(columns)
    pattern = re.compile(r'^(.*?)\s+' + r'\s+'.join([r'(\$?S?/?\.?[\d,]+(?:\.\d+)?)'] * count) + r'(?:\s+Ver anuncio)?\s*$')
    for line in block.splitlines()[2:]:
        match = pattern.match(line.strip())
        if not match:
            continue
        ad = {'name': match.group(1).strip(), 'truncated': True}
        for index, key in enumerate(columns):
            value = parse_number(match.group(index + 2))
            ad[key] = r2(value) if key == 'spend' else int(value or 0)
        ads.append(ad)
    return ads


def report_columns(text):
    header = re.search(r'Mejores Anuncios(?: Enlace)?\n(Anuncio[^\n]*)', text)
    names = {'Visual.': 'views', 'Clics': 'clicks', 'Gasto': 'spend', 'Alcance': 'reach'}
    return [names[token] for token in (header.group(1).split()[1:] if header else []) if token in names]


def parse_report(path):
    reader = pypdf.PdfReader(path)
    pages = [page.extract_text() or '' for page in reader.pages]
    summary = pages[1]
    period = re.search(r'(\d+ - \d+ \w+ \d{4})', summary)
    tiktok_block, meta_block = summary.split('M Meta Ads', 1)
    report = {
        'period': period.group(1) if period else None,
        'tiktokAccount': 'Cuenta anterior' if 'Cuenta anterior' in tiktok_block else 'Cuenta actual',
        'tiktok': {'spend': labelled(tiktok_block, 'Inversión'), 'views': labelled(tiktok_block, 'Visualizaciones'),
                   'followers': labelled(tiktok_block, 'Seguidores'), 'clicks': labelled(tiktok_block, 'Clics destino'),
                   'messageClicks': labelled(tiktok_block, 'Clics mensajes')},
        'meta': {'spend': labelled(meta_block, 'Inversión'), 'reach': labelled(meta_block, 'Alcance'),
                 'clicks': labelled(meta_block, 'Clics'), 'messageClicks': labelled(meta_block, 'Clics mensajes'),
                 'interactions': labelled(meta_block, 'Interacciones')},
        'campaigns': {'tiktok': [], 'meta': []},
    }
    for text in pages[2:]:
        head = re.match(r'Rekluta \| (TikTok|Meta) — ([^|\n]+?)(?: \| ([^\n]+))?\n', text)
        if not head:
            continue
        platform = head.group(1).lower()
        kind, scope = head.group(2).strip(), (head.group(3) or '').strip()
        spend = labelled(text, 'Inversión')
        if not spend:
            continue
        if platform == 'tiktok' and kind.startswith('Seguidores'):
            report['campaigns']['tiktok'].append({
                'name': 'Campaña de seguimiento', 'objective': 'Interacción con la comunidad', 'group': 'Seguidores',
                'country': 'Multipaís', 'spend': r2(spend), 'views': int(labelled(text, 'Visualizaciones') or 0),
                'followers': int(labelled(text, 'Seguidores total') or 0), 'topAds': [],
                'followersByCountry': [{'country': c, 'followers': int(parse_number(f) or 0)}
                                       for c, f in re.findall(r'^(Perú|Chile|Ecuador) ([\d,]+) S/\.', text, re.M)],
            })
            continue
        group = 'Mensajes' if kind.startswith('Mensajes') else 'Reconocimiento'
        country = scope if scope in COUNTRIES else 'Multipaís'
        campaign = {'name': f'{kind} {scope}'.strip(), 'objective': kind, 'group': group, 'country': country,
                    'spend': r2(spend), 'topAds': parse_ads(text, report_columns(text))}
        if platform == 'tiktok':
            campaign.update({'views': int(labelled(text, 'Visualizaciones') or 0), 'impressions': int(labelled(text, 'Impresiones') or 0),
                             'clicks': int(labelled(text, 'Clics destino') or 0), 'profileVisits': int(labelled(text, 'Visitas perfil') or 0),
                             'cpm': labelled(text, 'CPM')})
        else:
            campaign.update({'reach': int(labelled(text, 'Alcance') or 0), 'impressions': int(labelled(text, 'Impresiones') or 0),
                             'clicks': int(labelled(text, 'Clics (mensajes)') or labelled(text, 'Clics') or 0),
                             'interactions': int(labelled(text, 'Interacciones') or 0), 'cpm': labelled(text, 'CPM')})
        if campaign.get('impressions') == 0:
            campaign.pop('impressions')
        report['campaigns'][platform].append(campaign)
    resolve_followers_page(report)
    return report


def resolve_followers_page(report):
    """La pagina "Seguidores por Pais" a veces es una campana propia (enero y febrero, cuenta anterior)
    y a veces solo consolida los seguidores de las campanas de Reconocimiento. Si el total del resumen
    ya cuadra sin ella, se reparte por pais en esas campanas en vez de sumarla como gasto."""
    campaigns = report['campaigns']['tiktok']
    page = next((c for c in campaigns if c['group'] == 'Seguidores'), None)
    total = report['tiktok']['spend']
    if not page or total is None:
        return
    others = sum(c['spend'] for c in campaigns if c is not page)
    if abs(others - total) >= 0.05:
        return
    campaigns.remove(page)
    followers = {item['country']: item['followers'] for item in page['followersByCountry']}
    for campaign in campaigns:
        if campaign['group'] == 'Reconocimiento' and campaign['country'] in followers:
            campaign['followers'] = followers[campaign['country']]


def latest_report(folder, month):
    candidates = [path for path in glob.glob(os.path.join(folder, f'Reporte_Rekluta_{month}_{YEAR}*.pdf'))]
    if not candidates:
        return None, None
    # Si hay varias versiones (cortes parciales), gana la del periodo mas largo.
    parsed = [(path, parse_report(path)) for path in candidates]
    parsed.sort(key=lambda item: int(re.match(r'\d+ - (\d+)', item[1]['period'] or '0 - 0').group(1)))
    return parsed[-1]


# ── Consolidado ──────────────────────────────────────────────────────────────
def totals(campaigns, keys):
    return {key: (r2 if key == 'spend' else int)(sum(num(c.get(key)) for c in campaigns)) for key in keys}


def report_ids():
    try:
        with open(CATALOG, encoding='utf-8') as handle:
            files = json.load(handle).get('files', [])
    except FileNotFoundError:
        return {}
    return {f['title']: f['id'] for f in files}


def check(name, ours, theirs):
    if theirs is None:
        return None
    diff = round(num(ours) - num(theirs), 2)
    return {'metric': name, 'data': ours, 'report': theirs, 'diff': diff, 'ok': abs(diff) < 0.05}


def build(drive):
    meta_dir = os.path.join(drive, 'Meta Files - Rekluta')
    tiktok_dir = os.path.join(drive, 'Tik Tok Files - Rekluta')
    reports_dir = os.path.join(drive, 'Reportes Rekluta')
    ids = report_ids()
    months, cutoff = [], None
    for index, month in enumerate(MONTHS):
        report_path, report = latest_report(reports_dir, month)
        entry = {'name': month, 'status': 'sin-datos', 'period': None, 'report': None, 'platforms': {}, 'checks': []}
        if report:
            title = os.path.basename(report_path)
            entry['report'] = {'title': title, 'period': report['period'], 'id': ids.get(title)}
            entry['period'] = report['period']
        for platform, folder, reader in (('tiktok', tiktok_dir, tiktok_from_excel), ('meta', meta_dir, meta_from_excel)):
            path = month_file(folder, month)
            campaigns, days = reader(path) if path else ([], (None, None))
            source = 'excel'
            if not campaigns and report and report['campaigns'][platform]:
                campaigns, source = report['campaigns'][platform], 'reporte'
            if not campaigns:
                continue
            summary = report[platform] if report else {}
            if platform == 'tiktok':
                kpis = totals(campaigns, ['spend', 'impressions', 'views', 'clicks', 'followers', 'profileVisits'])
                kpis['messageClicks'] = int(sum(c.get('clicks', 0) for c in campaigns if c['group'] == 'Mensajes'))
                if source == 'reporte':
                    # El resumen del reporte suma tambien lo que no aparece campana por campana.
                    kpis.update({key: summary[key] for key in ('views', 'followers', 'clicks', 'messageClicks') if summary.get(key) is not None})
                    kpis['spend'] = summary.get('spend') or kpis['spend']
            else:
                kpis = totals(campaigns, ['spend', 'impressions', 'reach', 'clicks', 'interactions'])
                kpis['messageClicks'] = int(sum(c.get('clicks', 0) for c in campaigns if c['group'] == 'Mensajes'))
                if source == 'reporte':
                    kpis.update({key: summary[key] for key in ('clicks', 'interactions') if summary.get(key) is not None})
                # El alcance de Meta es el resultado (columna Resultados) de las campanas de Reconocimiento;
                # el de la campana de Mensajes no cuenta.
                kpis['reach'] = int(sum(c.get('reach', 0) for c in campaigns if c['group'] == 'Reconocimiento'))
            if any('impressions' not in c for c in campaigns):
                kpis['impressions'] = None  # el reporte no trae impresiones de todas las campanas
            by_group = {}
            for campaign in campaigns:
                by_group[campaign['group']] = r2(by_group.get(campaign['group'], 0) + campaign['spend'])
            entry['platforms'][platform] = {
                'source': source,
                'account': report['tiktokAccount'] if platform == 'tiktok' and report else None,
                'firstDay': days[0], 'lastDay': days[1],
                'kpis': kpis,
                'spendByGroup': by_group,
                'campaigns': sorted(campaigns, key=lambda c: (c['group'] != 'Mensajes', -c['spend'])),
            }
            if source == 'reporte':
                # Sin Excel, al menos se valida que las campanas del reporte sumen su propio resumen.
                result = check('spend', r2(sum(c['spend'] for c in campaigns)), summary.get('spend'))
                if result:
                    entry['checks'].append({'platform': platform, **result, 'scope': 'campanas vs resumen del reporte'})
            if source == 'excel' and report:
                for metric in (['spend', 'views', 'followers', 'clicks', 'messageClicks'] if platform == 'tiktok'
                               else ['spend', 'clicks', 'messageClicks', 'interactions']):
                    result = check(metric, kpis.get(metric), summary.get(metric))
                    if result:
                        entry['checks'].append({'platform': platform, **result})
        if entry['platforms']:
            last_day = re.match(r'\d+ - (\d+)', entry['period'] or '')
            days_in_month = (date(YEAR + (index == 11), index % 12 + 2, 1) - date(YEAR, index + 1, 1)).days
            closed = not last_day or int(last_day.group(1)) >= days_in_month
            entry['status'] = 'cerrado' if closed else 'parcial'
            end = int(last_day.group(1)) if last_day else days_in_month
            cutoff = date(YEAR, index + 1, end).isoformat()
        months.append(entry)
    return {
        'account': 'Rekluta',
        'year': YEAR,
        'cutoff': cutoff,
        'generatedAt': date.today().isoformat(),
        'source': 'Exportaciones de Meta Ads y TikTok Ads + reportes mensuales (Google Drive)',
        'platforms': {
            'tiktok': {'label': 'TikTok Ads', 'currency': 'PEN', 'symbol': 'S/.'},
            'meta': {'label': 'Meta Ads', 'currency': 'USD', 'symbol': 'US$'},
        },
        'months': months,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--root', default=os.environ.get('RK_DRIVE_ROOT', DEFAULT_DRIVE), help='Carpeta Rekluta en Google Drive')
    args = parser.parse_args()
    if not os.path.isdir(args.root):
        sys.exit(f'No existe la carpeta {args.root}')
    data = build(args.root)
    with open(OUT, 'w', encoding='utf-8', newline='\n') as handle:
        json.dump(data, handle, ensure_ascii=False, indent=1)
        handle.write('\n')
    for month in data['months']:
        if not month['platforms']:
            continue
        parts = [f"{key} {p['kpis']['spend']:>9,.2f} ({p['source']})" for key, p in month['platforms'].items()]
        bad = [f"{c['platform']}.{c['metric']} {c['diff']:+}" for c in month['checks'] if not c['ok']]
        print(f"{month['name']:<11} {month['status']:<8} {' | '.join(parts)}  {'descuadres: ' + ', '.join(bad) if bad else 'cuadra con el reporte'}")
    print(f'[ads] escrito {os.path.relpath(OUT, ROOT)} (corte {data["cutoff"]})')


if __name__ == '__main__':
    main()
