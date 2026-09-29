/**
 * Puente entre el boton "Sincronizar con Drive" del tablero y GitHub Actions.
 *
 * El tablero es publico (GitHub Pages), asi que no puede llevar el token de GitHub. Este Web App lo
 * guarda en las propiedades del script y solo hace una cosa: lanzar el workflow
 * .github/workflows/sync-ads-data.yml en main. No lee ni devuelve datos.
 *
 * Configuracion (una sola vez):
 *  1. script.google.com > Nuevo proyecto > pegar este archivo.
 *  2. Configuracion del proyecto > Propiedades del script > agregar GITHUB_TOKEN con un token
 *     fine-grained limitado al repositorio jorgeluis666/objetivos-Rekluta y permiso
 *     "Actions: Read and write" (nada mas).
 *  3. Implementar > Nueva implementacion > Aplicacion web > Ejecutar como: yo > Acceso: cualquier usuario.
 *  4. Copiar la URL .../exec en SYNC_TRIGGER_URL de js/objectives.js y publicar el tablero.
 */
const REPO = 'jorgeluis666/objetivos-Rekluta';
const WORKFLOW = 'sync-ads-data.yml';
const COOLDOWN_SECONDS = 180; // evita que clics repetidos encolen varias corridas

function doGet(e) {
  if (!e || !e.parameter || e.parameter.action !== 'sync') return reply({ ok: false, error: 'Accion no valida' });
  const cache = CacheService.getScriptCache();
  if (cache.get('sync-running')) return reply({ ok: true, queued: false, message: 'Ya hay una sincronizacion en curso' });
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) return reply({ ok: false, error: 'Falta GITHUB_TOKEN en las propiedades del script' });
  const response = UrlFetchApp.fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    payload: JSON.stringify({ ref: 'main' }),
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() !== 204) {
    return reply({ ok: false, error: `GitHub respondio ${response.getResponseCode()}` });
  }
  cache.put('sync-running', '1', COOLDOWN_SECONDS);
  return reply({ ok: true, queued: true });
}

function reply(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
