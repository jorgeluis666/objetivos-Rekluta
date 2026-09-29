#!/usr/bin/env python3
"""Descarga de Google Drive las carpetas que alimentan scripts/build-ads-data.py.

Deja en --out la misma estructura que la carpeta Rekluta sincronizada en G::
  <out>/Meta Files - Rekluta/*.xlsx
  <out>/Tik Tok Files - Rekluta/*.xlsx
  <out>/Reportes Rekluta/*.pdf

Sin credenciales: las tres carpetas deben estar compartidas como "Cualquier persona con el enlace
puede ver". Usa gdown, que lee la vista publica de la carpeta (hasta 50 archivos por carpeta).

Uso (lo corre .github/workflows/sync-ads-data.yml):
  python scripts/drive-download.py --out drive-data
Requiere: gdown.
"""
import argparse
import json
import os
import sys

import gdown

# Carpeta local -> ID de la carpeta en Drive (se pueden cambiar por variable de entorno).
FOLDERS = {
    'Meta Files - Rekluta': os.environ.get('RK_META_FOLDER_ID', '1IKTFtTRaUjPomB_KgeVzer7D5iWPEl3p'),
    'Tik Tok Files - Rekluta': os.environ.get('RK_TIKTOK_FOLDER_ID', '1QDnLk7OfZdRc_7I62_8SUq1kacmshgIX'),
    'Reportes Rekluta': os.environ.get('RK_REPORTS_FOLDER_ID', '1wmPgJICrSiPyy8X_SA6UD5VSq8N8tIBJ'),
}
# Solo lo que lee build-ads-data.py (se ignoran presentaciones de Google, imagenes, etc.).
EXTENSIONS = ('.xlsx', '.pdf')


def safe_name(path):
    # Los nombres vienen de Drive: sin separadores de ruta ni nombres ocultos.
    return os.path.basename(str(path).replace('\\', '/')).lstrip('.').strip()


def download_folder(folder_id, target_dir):
    """Descarga los .xlsx/.pdf y devuelve el listado completo (lo usa update-reports-catalog.py)."""
    try:
        listing = gdown.download_folder(id=folder_id, output=target_dir, quiet=True, use_cookies=False, skip_download=True)
    except Exception as error:  # gdown lanza errores genericos cuando la carpeta no es publica
        sys.exit(f'No se pudo leer la carpeta {folder_id}: {error}\n'
                 'Revisa que este compartida como "Cualquier persona con el enlace puede ver".')
    entries = []
    for item in listing or []:
        if len(os.path.normpath(str(item.path)).split(os.sep)) > 1:
            continue  # subcarpetas (p. ej. anos anteriores archivados): no entran
        name = safe_name(item.path)
        entry = {'id': item.id, 'name': name, 'file': None}
        if name.lower().endswith(EXTENSIONS):
            target = os.path.join(target_dir, name)
            if not gdown.download(id=item.id, output=target, quiet=True, use_cookies=False):
                sys.exit(f'No se pudo descargar {name} ({item.id}).')
            entry['file'] = name
        entries.append(entry)
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
        if not any(entry['file'] for entry in entries):
            sys.exit(f'La carpeta "{local}" ({folder_id}) no tiene archivos .xlsx ni .pdf.')
        manifest[local] = {'folderId': folder_id, 'files': entries}
        print(f'[drive] {local}: {sum(1 for entry in entries if entry["file"])} archivos descargados de {len(entries)}')
    with open(os.path.join(args.out, 'manifest.json'), 'w', encoding='utf-8') as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
