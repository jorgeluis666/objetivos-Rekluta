# Rekluta | Gasto publicitario 2026

Dashboard de Agencia Lima Retail para controlar la inversion publicitaria de Rekluta


Version actual: `v1.14.0`. El tablero reutiliza el codigo base de otro tablero de la agencia; de ahi
viene la numeracion de version.

## Versionado

El proyecto usa la nomenclatura `vMAJOR.MINOR.PATCH`:

- `MAJOR`: cambios incompatibles o una nueva etapa del tablero.
- `MINOR`: nuevos modulos, indicadores o funciones compatibles.
- `PATCH`: correcciones visuales, de datos o funcionamiento.

## Modulo activo

- Gasto publicitario de las dos cuentas administradas: TikTok Ads (S/.) y Meta Ads (US$).
  - Cada plataforma se muestra en su moneda de facturacion, sin conversion, igual que el reporte mensual.
  - Indicadores: TikTok = visualizaciones, seguidores de pago y clics salientes; Meta = clics salientes y
    alcance tomado de la columna Resultados de las campanas de Reconocimiento.
  - KPIs acumulados del ano, grafico lineal mensual (inversion, clics salientes y exposicion) y detalle por mes.
  - Por mes: tarjeta por plataforma, distribucion Reconocimiento / Seguidores / Mensajes, campanas con su
    resultado principal y los mejores anuncios (con vista previa en Meta).
  - Cruce con el reporte mensual: cada total calculado desde las exportaciones se compara con el resumen del PDF.
- Proyecciones: cierre de mes estimado de TikTok Ads y Meta Ads (ver abajo).
- Historico de Campanas: campanas de los meses cerrados.
- Archivo de Reportes: catalogo de los documentos guardados en la carpeta de Google Drive.
- Bitacora: checklist editable de cambios, comentarios y decisiones con fecha (ver abajo).

## Datos

La fuente normalizada del dashboard es `data/rk-ads-2026.json`, generada con `scripts/build-ads-data.py`
a partir de la carpeta de Rekluta en Google Drive:

| Carpeta | Contenido | Uso |
| --- | --- | --- |
| `Tik Tok Files - Rekluta` | Un `.xlsx` por mes (PEN, por dia / edad / sexo / anuncio) | Fuente principal de TikTok |
| `Meta Files - Rekluta` | Un `.xlsx` por mes (Raw Data Report, USD) | Fuente principal de Meta |
| `Reportes Rekluta` | `Reporte_Rekluta_<Mes>_2026.pdf` | Control de cuadre y respaldo |

- Si un mes no tiene Excel con datos, se toma del reporte PDF. Hoy pasa con TikTok enero y febrero
  (se pautaron en la cuenta anterior; la exportacion de la cuenta actual viene vacia) y con septiembre
  (aun sin exportar; se usa el corte mas reciente del reporte, 1 - 20 de septiembre).
- Cuando hay varias versiones del reporte de un mes, gana la de periodo mas largo.
- La pagina "Seguidores por Pais" del reporte a veces es una campana propia (enero y febrero) y a veces
  solo consolida los seguidores de Reconocimiento; el script la distingue comparando contra el total.

Para actualizar basta con subir los Excel y el reporte a sus carpetas de Drive: la sincronizacion
(abajo) hace el resto. Para correrlo a mano:

```
pip install pandas openpyxl pypdf
python scripts/build-ads-data.py            # usa G:/Mi unidad/.../Rekluta
python scripts/build-ads-data.py --root "<carpeta Rekluta>"
```

El script imprime por mes la inversion de cada plataforma, su fuente y si cuadra con el reporte.

## Sincronizacion con Drive

`.github/workflows/sync-ads-data.yml` descarga las carpetas de Drive (`scripts/drive-download.py`),
regenera `data/rk-ads-2026.json` y lo publica en `main`; GitHub Pages lo sirve en uno o dos minutos.
Corre de tres formas:

- **Automatica:** todos los dias a las 7:00 a. m. (hora de Lima).
- **Boton "Sincronizar con Drive"** en Gasto publicitario: lanza el workflow y el tablero se
  actualiza solo cuando llega el nuevo JSON (2 a 4 minutos).
- **A mano:** GitHub > Actions > "Sincronizar datos de Meta y TikTok desde Drive" > Run workflow.

| Carpeta | ID de Drive |
| --- | --- |
| Meta Files - Rekluta | `1IKTFtTRaUjPomB_KgeVzer7D5iWPEl3p` |
| Tik Tok Files - Rekluta | `1QDnLk7OfZdRc_7I62_8SUq1kacmshgIX` |
| Reportes Rekluta | `1wmPgJICrSiPyy8X_SA6UD5VSq8N8tIBJ` |

Configuracion (una sola vez):

1. **Cuenta de servicio de Google.** Google Cloud Console > crear proyecto > habilitar "Google Drive
   API" > Cuentas de servicio > crear > Claves > agregar clave JSON.
2. **Compartir las tres carpetas** de la tabla con el correo de la cuenta de servicio
   (`...@....iam.gserviceaccount.com`) como **Lector**. Las comparte el propietario de las carpetas.
3. **Secret en GitHub:** Settings > Secrets and variables > Actions > `GDRIVE_SERVICE_ACCOUNT` con el
   contenido completo del JSON.
4. **Probar:** Actions > Run workflow. Si falla en "Descargar carpetas de Drive", revisar el paso 2.
5. **Boton del tablero** (opcional; sin esto el boton queda deshabilitado y la corrida diaria sigue):
   publicar `scripts/sync-trigger.gs` como Web App siguiendo las instrucciones de su cabecera (usa un
   token fine-grained de GitHub con permiso solo "Actions: Read and write" en este repositorio) y pegar
   la URL `.../exec` en `SYNC_TRIGGER_URL` de `js/objectives.js`.

El token de GitHub vive solo en el Apps Script: el tablero es publico y no debe llevar credenciales.

## Proyecciones

El modulo Proyecciones lee los datos del modulo Gasto publicitario a traves de
`window.RKObjectives.snapshot()` y proyecta el cierre del mes en curso por plataforma, cada una en su
moneda de facturacion (TikTok Ads en S/., Meta Ads en US$), sin tipo de cambio.

- El mes proyectado es el de la fecha de corte (`cutoff`); si no tiene datos, se usa el ultimo mes con datos.
- Ritmo diario = acumulado real / dias con pauta (si la plataforma arranco despues del dia 1, cuenta
  desde `firstDay`). Proyeccion = actual + ritmo x dias restantes del mes.
- Indicadores: inversion (total y por tipo de campana), clics salientes, clics de Mensajes, visualizaciones
  y seguidores de pago (TikTok), alcance e interacciones (Meta). El alcance son usuarios unicos: su
  proyeccion es referencial.
- Los costos unitarios (por clic, por clic de Mensajes, por seguidor) se mantienen al cierre con un ritmo
  constante; se comparan con el mes anterior.
- Cada proyeccion se compara con el cierre del mes anterior con datos.
- Cada carga de datos emite el evento `rk:data-updated` y el modulo se recalcula solo.

## Bitacora

Checklist mensual de cambios, comentarios y decisiones, agrupado por mes segun la fecha de cada item.
La fuente publicada es `data/rk-bitacora-2026.json` (el build la incrusta en `dist/index.html`):

```json
{ "id": "b16", "date": "2026-09-22", "type": "decision", "platform": "meta", "done": false, "text": "..." }
```

- `type`: `cambio`, `comentario` o `decision`. `platform`: `general`, `tiktok` o `meta`. `done`: casilla marcada.
- En el tablero se agregan, editan, marcan y eliminan items. Las ediciones quedan como borrador en ese
  navegador (`localStorage`, clave `rk-bitacora-draft`) y nadie mas las ve hasta publicarlas.
- Para publicar: boton **Exportar**, reemplazar `data/rk-bitacora-2026.json` con el archivo descargado y hacer push.
  "Descartar borrador" vuelve a la version publicada.
- Si se publica una version nueva del archivo, los borradores hechos sobre la anterior se descartan (se comparan por `updatedAt`).
- Los items iniciales (enero a septiembre) se armaron a partir de los cambios que muestran las exportaciones:
  pausas y reactivaciones, cambios de cuenta y variaciones de presupuesto.

## Configuracion

Donde vive cada valor de marca y acceso, por si hay que cambiarlo:

| Que | Donde |
| --- | --- |
| Catalogo de reportes de Drive | `data/rk-drive-reports.json` (`files`) |
| Contrasena de acceso | `index.html`, al final (`AuthLogin.init`) |
| Logo | `assets/logo-rekluta.png` |
| Favicon | `assets/favicon.png` |
| Fondo del login | `login-bg.jpg` en la raiz |

## Desarrollo

```
npm install
npm run dev      # live-server en el puerto 3000
npm run build    # genera dist/index.html con todo embebido
```

## Despliegue

GitHub Pages desde el repositorio `jorgeluis666/objetivos-Rekluta`
(https://jorgeluis666.github.io/objetivos-Rekluta/). El archivo `.nojekyll` evita que Pages procese el
sitio con Jekyll.

## Google Sheets (retirado)

El tablero ya no lee ni escribe en Google Sheets: los datos salen de las exportaciones de las plataformas.
El script de sincronizacion que usaba (`scripts/google-sheets-sync.gs`) se elimino del repositorio.
