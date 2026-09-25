(function () {
  const VIEW_KEY = 'rk-active-view';
  const VIEW_META = {
    'view-obj': {
      title: 'Gasto publicitario 2026',
      caption: 'Agencia Lima Retail',
      status: 'Datos al 20 de septiembre',
      source: 'Fuente: Meta Ads + TikTok Ads / exportaciones y reportes mensuales',
      footer: 'Cruzado con el reporte mensual de Agencia Lima Retail',
    },
    'view-messages': {
      title: 'Proyecciones',
      caption: 'Cierre de mes de TikTok Ads y Meta Ads',
      status: 'Proyección sobre datos al 20 de septiembre',
      source: 'Fuente: Gasto publicitario / Rekluta',
      footer: 'Proyección lineal según el ritmo diario de cada plataforma',
    },
    'view-history': {
      title: 'Histórico de Campañas',
      caption: 'Campañas de meses cerrados',
      status: 'Cierre al 31 de agosto',
      source: 'Fuente: Meta Ads + TikTok Ads / Histórico consolidado',
      footer: 'Solo meses cerrados',
    },
    'view-reports': {
      title: 'Archivo de Reportes',
      caption: 'Documentos en Google Drive',
      status: 'Catalogo al 18 de septiembre',
      source: 'Fuente: Carpeta compartida Reportes Rekluta / Google Drive',
      footer: 'Vista previa y descarga directa desde Drive',
    },
    'view-log': {
      title: 'Bitácora',
      caption: 'Checklist de cambios, comentarios y decisiones',
      status: 'Editable',
      source: 'Fuente: registro de Agencia Lima Retail',
      footer: 'Las ediciones quedan como borrador hasta exportar y publicar el archivo',
    },
  };

  function storedView() {
    try {
      const value = window.localStorage.getItem(VIEW_KEY);
      return VIEW_META[value] ? value : 'view-obj';
    } catch {
      return 'view-obj';
    }
  }

  function saveView(viewId) {
    try {
      window.localStorage.setItem(VIEW_KEY, viewId);
    } catch {
      // La navegación sigue funcionando aunque localStorage no esté disponible.
    }
  }

  function showView(viewId) {
    const meta = VIEW_META[viewId] || VIEW_META['view-obj'];
    document.querySelectorAll('.view').forEach(view => {
      view.classList.toggle('visible', view.id === viewId);
    });
    document.querySelectorAll('[data-view-target]').forEach(button => {
      const active = button.dataset.viewTarget === viewId;
      button.classList.toggle('active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });

    document.getElementById('topbar-title').textContent = meta.title;
    document.getElementById('topbar-caption').textContent = meta.caption;
    document.getElementById('topbar-status').textContent = meta.status;
    document.getElementById('footer-source').textContent = meta.source;
    document.getElementById('footer-status').textContent = meta.footer;
    saveView(viewId);

    if (viewId === 'view-messages') {
      window.RKProjections?.init();
      window.setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
    }
    if (viewId === 'view-obj') window.setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
    if (viewId === 'view-history') window.RKObjectives?.renderHistory?.();
    if (viewId === 'view-reports') window.ReportsArchive?.init();
    if (viewId === 'view-log') window.RKBitacora?.init();
  }

  function initNavigation() {
    document.querySelectorAll('[data-view-target]').forEach(button => {
      button.addEventListener('click', () => showView(button.dataset.viewTarget));
    });
    showView(storedView());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavigation);
  } else {
    initNavigation();
  }
})();
