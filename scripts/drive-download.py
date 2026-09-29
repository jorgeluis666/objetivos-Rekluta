#!/usr/bin/env python3
"""Descarga de Google Drive las carpetas que alimentan scripts/build-ads-data.py.

Deja en --out la misma estructura que la carpeta Rekluta sincronizada en G::
  <out>/Meta Files - Rekluta/*.xlsx
  <out>/Tik Tok Files - Rekluta/*.xlsx
  <out>/Reportes Rekluta/*.pdf

Autenticacion: cuenta de servicio de Google (JSON en la variable GDRIVE_SERVICE_ACCOUNT). Las tres
carpetas deben estar compartidas con el correo de esa cuenta como lector.

Uso (lo corre .github/workflows/sync-ads-data.yml):
  python scripts/drive-download.py --out drive-data
Requiere: google-api-python-client, google-auth.
"""
import argparse
import io
import json
import os
import sys

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

# Carpeta local -> ID de la carpeta en Drive (se pueden cambiar por variable de entorno).
FOLDERS = {
    'Meta Files - Rekluta': os.environ.get('RK_META_FOLDER_ID', '1IKTFtTRaUjPomB_KgeVzer7D5iWPEl3p'),
    'Tik Tok Files - Rekluta': os.environ.get('RK_TIKTOK_FOLDER_ID', '1QDnLk7OfZdRc_7I62_8SUq1kacmshgIX'),
    'Reportes Rekluta': os.environ.get('RK_REPORTS_FOLDER_ID', '1wmPgJICrSiPyy8X_SA6UD5VSq8N8tIBJ'),
}
XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
# Solo lo que lee build-ads-data.py. Si alguien sube el Excel como Hoja de calculo de Google, se exporta a .xlsx.
WANTED = {XLSX: '.xlsx', 'application/pdf': '.pdf', 'application/vnd.google-apps.spreadsheet': '.xlsx'}


def drive_service():
    raw = os.environ.get('GDRIVE_SERVICE_ACCOUNT', '').strip()
    if not raw:
        sys.exit('Falta GDRIVE_SERVICE_ACCOUNT (JSON de la cuenta de servicio).')
    credentials = service_account.Credentials.from_service_account_info(
        json.loads(raw), scopes=['https://www.googleapis.com/auth/drive.readonly'])
    return build('drive', 'v3', credentials=credentials, cache_discovery=False)


def list_files(service, folder_id):
    files, token = [], None
    while True:
        response = service.files().list(
            q=f"'{folder_id}' in parents and trashed = false",
            fields='nextPageToken, files(id, name, mimeType)',
            pageSize=200, pageToken=token,
            supportsAllDrives=True, includeItemsFromAllDrives=True,
        ).execute()
        files.extend(response.get('files', []))
        token = response.get('nextPageToken')
        if not token:
            return files


def download(service, item, target):
    if item['mimeType'] == 'application/vnd.google-apps.spreadsheet':
        request = service.files().export_media(fileId=item['id'], mimeType=XLSX)
    else:
        request = service.files().get_media(fileId=item['id'], supportsAllDrives=True)
    with io.FileIO(target, 'wb') as handle:
        downloader = MediaIoBaseDownload(handle, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()


def safe_name(name, extension):
    # Los nombres vienen de Drive: sin separadores de ruta ni nombres ocultos.
    base = os.path.basename(name.replace('\\', '/')).lstrip('.').strip() or 'archivo'
    return base if base.lower().endswith(extension) else base + extension


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--out', required=True, help='Carpeta destino')
    args = parser.parse_args()
    service = drive_service()
    for local, folder_id in FOLDERS.items():
        target_dir = os.path.join(args.out, local)
        os.makedirs(target_dir, exist_ok=True)
        items = [item for item in list_files(service, folder_id) if item['mimeType'] in WANTED]
        if not items:
            sys.exit(f'La carpeta "{local}" ({folder_id}) esta vacia o no esta compartida con la cuenta de servicio.')
        for item in items:
            download(service, item, os.path.join(target_dir, safe_name(item['name'], WANTED[item['mimeType']])))
        print(f'[drive] {local}: {len(items)} archivos')


if __name__ == '__main__':
    main()
