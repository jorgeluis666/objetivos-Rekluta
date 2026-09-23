# Rekluta | Gasto publicitario 2026

Dashboard de Agencia Lima Retail para controlar la inversion publicitaria de Rekluta


Version actual: `v1.9.2`. El tablero reutiliza el codigo base de otro tablero de la agencia; de ahi
viene la numeracion de version.

## Versionado

El proyecto usa la nomenclatura `vMAJOR.MINOR.PATCH`:

- `MAJOR`: cambios incompatibles o una nueva etapa del tablero.
- `MINOR`: nuevos modulos, indicadores o funciones compatibles.
- `PATCH`: correcciones visuales, de datos o funcionamiento.

## Modulo activo

- Gasto mensual total.
- Distribucion entre Branding y Ventas.
- Campanas por mes.
- Estado, objetivo, presupuesto, gasto, importe diario y URL de anuncios.
- Proyecciones: cierre de mes estimado con los datos reales y calculadora de inversion por CPL.
- Historico de Campanas finalizadas.
- Archivo de Reportes: catalogo de los documentos guardados en la carpeta de Google Drive.

Los modulos Comparativo YoY, Distribucion, Productos Web y Usuarios y Claves se muestran
deshabilitados hasta su futura implementacion.

## Datos

La fuente normalizada del dashboard esta en `data/rk-ads-2026.json`. Arranca vacia: los doce meses
de 2026 existen con gasto cero y sin campanas, a la espera de la primera carga real.

El tablero se alimenta de un Google Sheet publicado como CSV. A medida que se cierra cada mes, el
mes queda archivado en su propio `data/rk-<mes>-sheet-2026.json` y se engancha agregando su ruta al
arreglo `CLOSED_MONTH_URLS` en `js/objectives.js`.

Para que la lectura del CSV funcione, el spreadsheet debe estar compartido como "cualquier persona
con el enlace / lector". Si se restringe, el boton Actualizar deja de funcionar y hay que refrescar
el JSON a mano.

## Proyecciones

El modulo Proyecciones lee los datos del modulo Gasto publicitario a traves de
`window.RKObjectives.snapshot()` y proyecta el cierre del mes en curso.

- El mes proyectado es el que corresponde a la fecha de corte (`cutoff`); si no tiene gasto, se usa
  el ultimo mes con datos.
- Ritmo diario = acumulado real / dias con datos; la proyeccion mantiene ese ritmo hasta el ultimo
  dia del mes.
- La linea de tiempo marca el dia de la ultima actualizacion y compara contra el presupuesto
  (inversion) o el objetivo de reservas.
- Cada sincronizacion con Google Sheets emite el evento `rk:data-updated` y el modulo se recalcula
  solo.

## Configuracion pendiente

Estos valores estan vacios a proposito y hay que cargarlos antes de publicar:

| Que | Donde |
| --- | --- |
| ID del Google Sheet | `js/objectives.js` (`SHEET_ID`) y `scripts/google-sheets-sync.gs` (`SPREADSHEET_ID`) |
| Catalogo de reportes de Drive | `data/rk-drive-reports.json` (`files`); la carpeta ya esta enlazada |
| Endpoint de escritura a Sheets (opcional) | `js/objectives.js` (`SHEET_SYNC_ENDPOINT`, URL `https://script.google.com/macros/s/.../exec`) |
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

## Sincronizacion de escritura con Google Sheets

Para que los cambios en `Objetivo Reservas` se escriban de vuelta en el Sheet:

1. Crear un proyecto de Apps Script vinculado al Google Sheet y copiar `scripts/google-sheets-sync.gs`
   (con `SPREADSHEET_ID` cargado).
2. Publicarlo como Web App con ejecucion como propietario.
   El script solo escribe en las pestañas mensuales del spreadsheet fijado en `SPREADSHEET_ID` y solo acepta enteros entre 0 y 100000.
3. Pegar la URL `https://script.google.com/macros/s/.../exec` en `SHEET_SYNC_ENDPOINT` (`js/objectives.js`) y volver a publicar.
   No se acepta desde `?sheetSyncEndpoint=` ni desde localStorage: un enlace manipulado podia desviar los datos a un tercero.

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
