#!/usr/bin/env python3
"""Descarga de Google Drive las carpetas que alimentan scripts/build-ads-data.py.

Deja en --out la misma estructura que la carpeta Rekluta sincronizada en G:, mas un manifest.json:
  <out>/Meta Files - Rekluta/*.xlsx
  <out>/Tik Tok Files - Rekluta/*.xlsx
  <out>/Reportes Rekluta/*.pdf

Sin credenciales: las tres carpetas deben estar compartidas como "Cualquier persona con el enlace
puede ver". Se lee la vista publica de cada carpeta (embeddedfolderview):
  - Hojas de calculo de Google -> se exportan a .xlsx;
  - archivos .xlsx y .pdf -> se descargan tal cual;
  - subcarpetas y otros documentos de Google -> se listan en el manifest, pero no se descargan.
Cada descarga se reintenta; si un archivo sigue sin bajar, se sigue con el resto y el manifest lo marca
con "error" (el tablero lo muestra como aviso). Una carpeta que no se puede leer detiene todo.

Uso (lo corre .github/workflows/sync-ads-data.yml):
  python scripts/drive-download.py --out drive-data
Requiere: requests.
"""
import argparse
import html
import json
import os
import re
import sys
import time

import requests

# Carpeta local -> ID de la carpeta en Drive (se pueden cambiar por variable de entorno).
FOLDERS = {
    'Meta Files - Rekluta': os.environ.get('RK_META_FOLDER_ID', '1IKTFtTRaUjPomB_KgeVzer7D5iWPEl3p'),
    'Tik Tok Files - Rekluta': os.environ.get('RK_TIKTOK_FOLDER_ID', '1QDnLk7OfZdRc_7I62_8SUq1kacmshgIX'),
    'Reportes Rekluta': os.environ.get('RK_REPORTS_FOLDER_ID', '1wmPgJICrSiPyy8X_SA6UD5VSq8N8tIBJ'),
}
LISTING_URL = 'https://drive.google.com/embeddedfolderview?id={id}'
SHEET_EXPORT_URL = 'https://docs.google.com/spreadsheets/d/{id}/export?format=xlsx'
FILE_URL = 'https://drive.usercontent.google.com/download?id={id}&export=download&confirm=t'
ENTRY_RE = re.compile(
    r'<div class="flip-entry" id="entry-([A-Za-z0-9_-]+)".*?<a href="([^"]+)".*?'
    r'/type/([^"]+)".*?<div class="flip-entry-title">([^<]*)</div>', re.S)
SHEET_MIME = 'application/vnd.google-apps.spreadsheet'
EXTENSIONS = ('.xlsx', '.pdf')
# Segundos de espera antes de cada reintento de una descarga (3 intentos en total).
RETRY_WAITS = [5, 15]
SESSION = requests.Session()
SESSION.headers['User-Agent'] = 'Mozilla/5.0 (rekluta-sync)'


def safe_name(name):
    # Los nombres vienen de Drive: sin separadores de ruta ni nombres ocultos.
    return os.path.basename(html.unescape(name).replace('\\', '/')).lstrip('.').strip() or 'archivo'


def list_folder(folder_id):
    response = SESSION.get(LISTING_URL.format(id=folder_id), timeout=60)
    entries = [{'id': match[0], 'href': match[1], 'mimeType': match[2], 'name': safe_name(match[3])}
               for match in ENTRY_RE.findall(response.text)]
    if response.status_code != 200 or ('flip-entry' not in response.text and 'flip-empty' not in response.text):
        sys.exit(f'No se pudo leer la carpeta {folder_id} (HTTP {response.status_code}).\n'
                 'Revisa que este compartida como "Cualquier persona con el enlace puede ver".')
    return entries


def fetch(url, target):
    """Descarga el archivo; devuelve None si salio bien o el motivo del fallo."""
    try:
        response = SESSION.get(url, timeout=120)
    except requests.RequestException as error:
        return f'error de red: {type(error).__name__}'
    content_type = response.headers.get('content-type', '')
    # Si el archivo no es publico, Google devuelve una pagina de inicio de sesion en HTML.
    if response.status_code != 200 or content_type.startswith('text/html'):
        return f'HTTP {response.status_code}' + (', Drive devolvio una pagina en vez del archivo' if response.status_code == 200 else '')
    with open(target, 'wb') as handle:
        handle.write(response.content)
    return None


def fetch_with_retries(url, target):
    for attempt, wait in enumerate(RETRY_WAITS + [None], start=1):
        error = fetch(url, target)
        if not error or wait is None:
            return error
        print(f'[drive] intento {attempt} fallido ({error}); se reintenta en {wait} s', file=sys.stderr)
        time.sleep(wait)


def download_folder(folder_id, target_dir):
    """Descarga lo que usa build-ads-data.py y devuelve el listado completo (para el catalogo).

    Un archivo que no baja tras los reintentos no detiene la sincronizacion: queda en el manifest con
    "error" (y sin "file") y build-ads-data.py lo pasa a los avisos del tablero."""
    entries = []
    for entry in list_folder(folder_id):
        item = {'id': entry['id'], 'name': entry['name'], 'mimeType': entry['mimeType'], 'file': None}
        if entry['mimeType'] == SHEET_MIME:
            item['file'] = entry['name'] + '.xlsx'
            url = SHEET_EXPORT_URL.format(id=entry['id'])
        elif entry['name'].lower().endswith(EXTENSIONS):
            item['file'] = entry['name']
            url = FILE_URL.format(id=entry['id'])
        error = item['file'] and fetch_with_retries(url, os.path.join(target_dir, item['file']))
        if error:
            print(f'[drive] no se pudo descargar "{entry["name"]}" ({entry["id"]}): {error}', file=sys.stderr)
            item.update(file=None, error=error)
        entries.append(item)
    return entries


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--out', required=True, help='Carpeta destino')
    args = parser.parse_args()
    manifest = {}
    for local, folder_id in FOLDERS.items():
        target_dir = os.path.join(args.out, local)
        os.makedirs(target_dir, exist_ok=True)
        entries = download_folder(folder_id, target_dir)
        downloaded = [entry['file'] for entry in entries if entry['file']]
        failed = [entry['name'] for entry in entries if entry.get('error')]
        # Sin ningun archivo de la carpeta se publicaria un tablero vacio: eso si detiene la sincronizacion.
        if not downloaded and failed:
            sys.exit(f'No se pudo descargar ningun archivo de la carpeta "{local}" ({folder_id}).')
        if not downloaded:
            sys.exit(f'La carpeta "{local}" ({folder_id}) no tiene hojas de calculo, .xlsx ni .pdf.')
        manifest[local] = {'folderId': folder_id, 'files': entries}
        print(f'[drive] {local}: {len(downloaded)} descargados de {len(entries)} -> {", ".join(downloaded)}'
              + (f' | fallidos: {", ".join(failed)}' if failed else ''))
    with open(os.path.join(args.out, 'manifest.json'), 'w', encoding='utf-8') as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
