#!/usr/bin/env python3
"""Actualiza data/rk-drive-reports.json (modulo Archivo de Reportes) con la carpeta Reportes de Drive.

Lee el manifest.json que deja scripts/drive-download.py:
  - agrega los archivos nuevos de la carpeta (peso tomado del archivo descargado);
  - quita los que ya no estan en la carpeta;
  - conserva los datos ya catalogados de los que siguen (fechas y peso originales).

La vista publica de Drive no expone fechas: un archivo nuevo toma como fecha la de la sincronizacion.

Uso: python scripts/update-reports-catalog.py --root <carpeta de drive-download.py>
"""
import argparse
import json
import os
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOG = os.path.join(ROOT, 'data', 'rk-drive-reports.json')
FOLDER = 'Reportes Rekluta'
MIME_BY_EXTENSION = {
    '.pdf': 'application/pdf',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--root', required=True)
    args = parser.parse_args()
    with open(os.path.join(args.root, 'manifest.json'), encoding='utf-8') as handle:
        folder = json.load(handle)[FOLDER]
    with open(CATALOG, encoding='utf-8') as handle:
        catalog = json.load(handle)
    known = {item['id']: item for item in catalog.get('files', [])}
    now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    files, added = [], []
    for entry in folder['files']:
        if entry['id'] in known:
            files.append(known[entry['id']])
            continue
        mime = MIME_BY_EXTENSION.get(os.path.splitext(entry['name'])[1].lower())
        if not mime:
            continue  # documento nativo de Google sin tipo conocido: se cataloga a mano
        path = os.path.join(args.root, FOLDER, entry['file']) if entry.get('file') else None
        files.append({
            'id': entry['id'],
            'title': entry['name'],
            'mimeType': mime,
            'sizeBytes': os.path.getsize(path) if path and os.path.exists(path) else 0,
            'modifiedTime': now,
            'createdTime': now,
        })
        added.append(entry['name'])
    listed = {entry['id'] for entry in folder['files']}
    # El listado publico de gdown omite los documentos nativos de Google (Presentaciones, Documentos):
    # esos no se pueden detectar como borrados, asi que se conservan tal como estan catalogados.
    native = [item for item_id, item in known.items() if item_id not in listed and item.get('mimeType', '').startswith('application/vnd.google-apps')]
    files = native + files
    removed = [item['title'] for item_id, item in known.items() if item_id not in listed and item not in native]
    catalog['files'] = files
    if added or removed:
        catalog['syncedAt'] = now[:10]
    with open(CATALOG, 'w', encoding='utf-8', newline='\n') as handle:
        json.dump(catalog, handle, ensure_ascii=False, indent=2)
        handle.write('\n')
    print(f'[reportes] {len(files)} documentos | nuevos: {added or "-"} | retirados: {removed or "-"}')


if __name__ == '__main__':
    main()
