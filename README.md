# Rekluta | Gasto publicitario 2026

Dashboard de Agencia Lima Retail para controlar la inversion publicitaria de Rekluta


Version actual: `v1.15.0`. El tablero reutiliza el codigo base de otro tablero de la agencia; de ahi
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

Todo corre en GitHub, sin credenciales de Google. `.github/workflows/sync-ads-data.yml`:

1. descarga las tres carpetas de Drive (`scripts/drive-download.py`): las Hojas de calculo de Google
   se exportan a `.xlsx` y los `.xlsx`/`.pdf` se bajan tal cual;
2. regenera `data/rk-ads-2026.json` (`scripts/build-ads-data.py`);
3. actualiza el catalogo de Archivo de Reportes, `data/rk-drive-reports.json`
   (`scripts/update-reports-catalog.py`): suma los PDF nuevos de la carpeta Reportes y retira los borrados;
4. publica en `main`; GitHub Pages lo sirve en uno o dos minutos.

Corre de dos formas:

- **Automatica:** todos los dias a las 7:00 a. m. (hora de Lima).
- **A pedido:** boton "Sincronizar con Drive" en Gasto publicitario. Abre el workflow en GitHub para
  pulsar "Run workflow" (requiere sesion en GitHub con acceso al repositorio) y el tablero se
  actualiza solo cuando llega el nuevo JSON (2 a 4 minutos). Es lo mismo que GitHub > Actions >
  "Sincronizar datos de Meta y TikTok desde Drive" > Run workflow.

| Carpeta | ID de Drive |
| --- | --- |
| Meta Files - Rekluta | `1IKTFtTRaUjPomB_KgeVzer7D5iWPEl3p` |
| Tik Tok Files - Rekluta | `1QDnLk7OfZdRc_7I62_8SUq1kacmshgIX` |
| Reportes Rekluta | `1wmPgJICrSiPyy8X_SA6UD5VSq8N8tIBJ` |

Configuracion (una sola vez): el propietario de las tres carpetas las comparte en Drive como
**"Cualquier persona con el enlace" > Lector** (Compartir > Acceso general). Luego se prueba con
Actions > Run workflow. Si falla en "Descargar carpetas de Drive", alguna carpeta sigue restringida.

Notas:

- Cualquiera con el enlace de una carpeta puede ver sus archivos; los datos del tablero ya son publicos
  en GitHub Pages.
- El mes de cada Excel se reconoce por el nombre ("Rekluta - Agosto 2026", "Agosto") o por el rango de
  fechas de la exportacion ("..._20260101-20260131"). Las subcarpetas se ignoran: sirven para archivar
  anos anteriores.
- Si el Excel del mes en curso va mas adelante que el ultimo reporte PDF, manda el Excel y el cruce con
  el reporte se omite hasta que llegue el reporte del mes completo.
- La vista publica de Drive no da fechas: un reporte nuevo aparece en Archivo de Reportes con la fecha
  de la sincronizacion.

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

GitHub Pages publica la raiz de la rama `main` del repositorio `jorgeluis666/objetivos-Rekluta` en
**https://rekluta.limaretail.com/**. Cada push a `main` (incluidos los de la sincronizacion diaria con
Drive) se publica solo en unos minutos; no hay que tocar el DNS ni el hosting. El archivo `.nojekyll`
evita que Pages procese el sitio con Jekyll.

### Dominio propio

- `CNAME` (en la raiz) contiene `rekluta.limaretail.com`: le dice a GitHub Pages que sirva este repo en
  ese dominio. No borrarlo ni moverlo; sin el, el sitio vuelve a `jorgeluis666.github.io/objetivos-Rekluta/`.
- DNS en Banahosting (cPanel → Zone Editor → `limaretail.com`): registro **CNAME** `rekluta` →
  `jorgeluis666.github.io` (sin ruta: GitHub elige el repo por el archivo `CNAME`).
- HTTPS: Settings → Pages → *Custom domain* `rekluta.limaretail.com` con **Enforce HTTPS** marcado.
- La URL anterior (https://jorgeluis666.github.io/objetivos-Rekluta/) redirige con 301 al dominio nuevo.
- Todas las rutas del sitio son relativas (`css/…`, `js/…`, `data/…`), asi que funcionan en la raiz
  del dominio sin base path.

## Google Sheets (retirado)

El tablero ya no lee ni escribe en Google Sheets: los datos salen de las exportaciones de las plataformas.
El script de sincronizacion que usaba (`scripts/google-sheets-sync.gs`) se elimino del repositorio.
