# Rekluta | Gasto publicitario 2026

Dashboard de Agencia Lima Retail para controlar la inversion publicitaria de Rekluta


Version actual: `v1.10.0`. El tablero reutiliza el codigo base de otro tablero de la agencia; de ahi
viene la numeracion de version.

## Versionado

El proyecto usa la nomenclatura `vMAJOR.MINOR.PATCH`:

- `MAJOR`: cambios incompatibles o una nueva etapa del tablero.
- `MINOR`: nuevos modulos, indicadores o funciones compatibles.
- `PATCH`: correcciones visuales, de datos o funcionamiento.

## Modulo activo

- Gasto publicitario de las dos cuentas administradas: TikTok Ads (S/.) y Meta Ads (US$).
  - Cada plataforma se muestra en su moneda de facturacion, sin conversion, igual que el reporte mensual.
  - KPIs acumulados del ano, grafico mensual (inversion, clics a mensajes y exposicion) y detalle por mes.
  - Por mes: tarjeta por plataforma, distribucion Reconocimiento / Seguidores / Mensajes, campanas con su
    resultado principal y los mejores anuncios (con vista previa en Meta).
  - Cruce con el reporte mensual: cada total calculado desde las exportaciones se compara con el resumen del PDF.
- Proyecciones: cierre de mes estimado y calculadora de inversion por CPL (ver nota abajo).
- Historico de Campanas: campanas de los meses cerrados.
- Archivo de Reportes: catalogo de los documentos guardados en la carpeta de Google Drive.

Los modulos Comparativo YoY, Distribucion, Productos Web y Usuarios y Claves se muestran
deshabilitados hasta su futura implementacion.

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

Para actualizar al cerrar un mes: subir los dos Excel y el reporte a sus carpetas y correr

```
pip install pandas openpyxl pypdf
python scripts/build-ads-data.py            # usa G:/Mi unidad/.../Rekluta
python scripts/build-ads-data.py --root "<carpeta Rekluta>"
```

El script imprime por mes la inversion de cada plataforma, su fuente y si cuadra con el reporte.

## Proyecciones

El modulo Proyecciones lee los datos del modulo Gasto publicitario a traves de
`window.RKObjectives.snapshot()` y proyecta el cierre del mes en curso.

- El mes proyectado es el que corresponde a la fecha de corte (`cutoff`); si no tiene gasto, se usa
  el ultimo mes con datos.
- Ritmo diario = acumulado real / dias con datos; la proyeccion mantiene ese ritmo hasta el ultimo
  dia del mes.
- La linea de tiempo marca el dia de la ultima actualizacion y compara contra el presupuesto
  (inversion) o el objetivo de reservas.
- Cada carga de datos emite el evento `rk:data-updated` y el modulo se recalcula
  solo.

Nota: el modulo proyecta un unico monto en soles. Como el gasto de Rekluta esta en dos monedas, por ahora
`snapshot()` se entrega sin gasto consolidado y Proyecciones muestra "Sin datos para proyectar" hasta adaptarlo
por plataforma (o definir un tipo de cambio).

## Configuracion pendiente

Estos valores estan vacios a proposito y hay que cargarlos antes de publicar:

| Que | Donde |
| --- | --- |
| Catalogo de reportes de Drive | `data/rk-drive-reports.json` (`files`); la carpeta ya esta enlazada |
| Acceso y deploy | Secrets de GitHub Actions (ver "Publicacion en el hosting de Lima Retail") |
| Logo | `assets/logo-rekluta.png` |
| Favicon | `assets/favicon.png` |

## Desarrollo

```
npm install
npm run dev      # live-server en el puerto 3000
npm run build    # genera dist/index.html con todo embebido
```

El resultado se genera en `dist/`: `index.html` (CSS, JS y datos incrustados), `assets/` y `.htaccess`.
Nada mas: `data/`, `scripts/` y el resto del repo nunca se publican.

## Google Sheets (retirado)

El tablero ya no lee ni escribe en Google Sheets: los datos salen de las exportaciones de las plataformas.
`scripts/google-sheets-sync.gs` quedo sin uso.

## Publicacion en el hosting de Lima Retail

El acceso lo controla Apache con HTTP Basic Auth (una cuenta por cliente). No hay contraseña en el HTML.
`dist/.htaccess` se genera desde `deploy/.htaccess` con la ruta del archivo de claves y una CSP con el hash de cada script.

Configuracion unica en cPanel:

1. **Dominios** > activar **Forzar redireccion HTTPS** para el dominio o subdominio del cliente.
2. **Privacidad de directorios** > carpeta del cliente > activar proteccion y crear el usuario del cliente
   con una contraseña larga y aleatoria. cPanel crea el archivo de claves en
   `/home/<usuario_cpanel>/.htpasswds/<ruta_de_la_carpeta>/passwd`.
3. En GitHub > Settings > Secrets and variables > Actions, crear:
   - `HTPASSWD_PATH`: la ruta absoluta del paso 2.
   - `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`: una cuenta FTP limitada a la carpeta del cliente.
   - `FTP_SERVER_DIR`: carpeta destino relativa a esa cuenta, terminada en `/` (por ejemplo `./`).
4. Desactivar GitHub Pages (Settings > Pages) y dejar el repositorio en privado: los datos del cliente no deben quedar publicos.

Cada push a `main` ejecuta `.github/workflows/deploy-hosting.yml`, que compila y sube `dist/` por FTPS.
Si falta `HTPASSWD_PATH` el build falla; si la ruta es incorrecta Apache responde 500 en vez de mostrar el tablero sin clave.
