(function () {
  // Bitacora mensual: junta los cambios que se detectan en los datos de Gasto publicitario con los
  // comentarios y decisiones que registra el equipo en data/rk-bitacora-2026.json.
  const DATA_URL = 'data/rk-bitacora-2026.json';
  const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const PLATFORM_ORDER = ['tiktok', 'meta'];
  const TYPES = [
    { id: 'cambio', label: 'Cambios', empty: 'Sin cambios registrados.' },
    { id: 'comentario', label: 'Comentarios', empty: 'Sin comentarios registrados.' },
    { id: 'decision', label: 'Decisiones', empty: 'Sin decisiones registradas.' },
  ];
  const GROUP_CLASS = { Reconocimiento: 'branding', Mensajes: 'messages', Seguidores: 'followers' };
  const METRIC_LABELS = { spend: 'inversión', views: 'visualizaciones', followers: 'seguidores de pago', clicks: 'clics salientes', messageClicks: 'clics de Mensajes', reach: 'alcance' };
  // Variacion minima (en %) para que un cambio de inversion entre a la bitacora.
  const SPEND_THRESHOLD = 10;

  const state = { ready: false, ads: null, log: null, type: 'all', platform: 'all' };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const isNum = value => value != null && value !== '' && Number.isFinite(Number(value));
  const symbol = platform => state.ads?.platforms?.[platform]?.symbol || '';
  const label = platform => state.ads?.platforms?.[platform]?.label || (platform === 'general' ? 'General' : platform);
  const fmtCount = value => (isNum(value) ? Math.round(Number(value)).toLocaleString('es-PE') : '-');
  const fmtMoney = (value, platform) => (isNum(value) ? `${symbol(platform)} ${Number(value).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-');
  const fmtPct = value => `${value > 0 ? '+' : ''}${Math.round(value)}%`;
  const pctChange = (value, base) => (Number(base) > 0 ? (Number(value) / Number(base) - 1) * 100 : null);
  const hasData = month => month && Object.keys(month.platforms || {}).length > 0;
  const lower = name => String(name || '').toLowerCase();

  function parseDate(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
  }
  const longDate = date => (date ? `${date.getDate()} de ${MONTHS[date.getMonth()].toLowerCase()}` : '');

  function entry(type, platform, title, detail) {
    return { type, platform, title, detail, origin: 'datos' };
  }

  // Cambios de un mes frente al mes anterior con datos de la misma plataforma.
  function detectPlatform(month, prevMonth, platform) {
    const current = month.platforms[platform];
    if (!current) return [];
    const prev = prevMonth?.platforms?.[platform];
    const out = [];
    const spend = Number(current.kpis?.spend || 0);
    const groups = current.spendByGroup || {};

    if (!prev) {
      const names = Object.keys(groups).join(', ');
      out.push(entry('cambio', platform, 'Punto de partida del año',
        `${(current.campaigns || []).length} campañas activas (${names}) con una inversión de ${fmtMoney(spend, platform)}.`));
    } else {
      if (current.account && prev.account && current.account !== prev.account) {
        out.push(entry('cambio', platform, 'Cambio de cuenta publicitaria',
          `La pauta pasa de la ${lower(prev.account)} a la ${lower(current.account)}.`));
      }
      const prevGroups = prev.spendByGroup || {};
      Object.keys(groups).filter(group => !(group in prevGroups)).forEach(group => {
        out.push(entry('cambio', platform, `Se activa ${group}`,
          `Vuelve a pautarse ${group} con ${fmtMoney(groups[group], platform)} en el mes.`));
      });
      Object.keys(prevGroups).filter(group => !(group in groups)).forEach(group => {
        out.push(entry('cambio', platform, `Se pausa ${group}`,
          `En ${prevMonth.name.toLowerCase()} se invirtieron ${fmtMoney(prevGroups[group], platform)}; este mes no tiene pauta.`));
      });
      // En un mes parcial la inversion todavia no es comparable con un mes cerrado.
      if (month.status === 'cerrado') {
        const change = pctChange(spend, prev.kpis?.spend);
        if (change != null && Math.abs(change) >= SPEND_THRESHOLD) {
          out.push(entry('cambio', platform, `Inversión ${fmtPct(change)} vs ${prevMonth.name.toLowerCase()}`,
            `${fmtMoney(prev.kpis.spend, platform)} a ${fmtMoney(spend, platform)}.`));
        }
        Object.keys(groups).filter(group => group in prevGroups).forEach(group => {
          const groupChange = pctChange(groups[group], prevGroups[group]);
          if (groupChange != null && Math.abs(groupChange) >= SPEND_THRESHOLD) {
            out.push(entry('cambio', platform, `${group} ${fmtPct(groupChange)}`,
              `Presupuesto de ${group}: ${fmtMoney(prevGroups[group], platform)} a ${fmtMoney(groups[group], platform)}.`));
          }
        });
      }
      const count = (current.campaigns || []).length;
      const prevCount = (prev.campaigns || []).length;
      if (count !== prevCount) {
        out.push(entry('cambio', platform, `Campañas activas: ${prevCount} a ${count}`,
          (current.campaigns || []).map(campaign => campaign.name).join(' / ')));
      }
    }

    const first = parseDate(current.firstDay);
    if (first && first.getDate() > 1) {
      out.push(entry('cambio', platform, `La pauta inicia el ${longDate(first)}`,
        `Sin inversión del 1 al ${first.getDate() - 1} de ${month.name.toLowerCase()}.`));
    }
    if (current.source === 'reporte') {
      out.push(entry('comentario', platform, 'Datos tomados del reporte PDF',
        current.account === 'Cuenta anterior'
          ? 'Se pautó en la cuenta anterior y la exportación de la cuenta actual viene vacía.'
          : 'Aún no hay exportación del mes; se usa el corte más reciente del reporte.'));
    }
    (month.checks || []).filter(check => check.platform === platform && check.ok === false).forEach(check => {
      out.push(entry('comentario', platform, `Diferencia con el reporte en ${METRIC_LABELS[check.metric] || check.metric}`,
        `Exportación ${check.metric === 'spend' ? fmtMoney(check.data, platform) : fmtCount(check.data)} vs reporte ${check.metric === 'spend' ? fmtMoney(check.report, platform) : fmtCount(check.report)}.`));
    });
    return out;
  }

  function buildMonths() {
    const adsMonths = state.ads?.months || [];
    const manual = Array.isArray(state.log?.entries) ? state.log.entries : [];
    const lastByPlatform = {};
    return MONTHS.map(name => {
      const month = adsMonths.find(item => item.name === name) || { name, platforms: {} };
      const auto = [];
      if (hasData(month)) {
        PLATFORM_ORDER.forEach(platform => {
          if (!month.platforms[platform]) return;
          auto.push(...detectPlatform(month, lastByPlatform[platform], platform));
          lastByPlatform[platform] = month;
        });
        if (month.status === 'parcial') {
          auto.unshift(entry('comentario', 'general', 'Mes en curso', `Datos parciales: ${month.period}. Las variaciones se calculan al cierre.`));
        }
      }
      const own = manual
        .filter(item => item && item.month === name && TYPES.some(type => type.id === item.type))
        .map(item => ({ ...item, platform: PLATFORM_ORDER.includes(item.platform) ? item.platform : 'general', origin: 'equipo' }))
        .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
      return { month, entries: [...own, ...auto] };
    }).filter(item => item.entries.length);
  }

  function matches(item) {
    return (state.platform === 'all' || item.platform === state.platform || item.platform === 'general')
      && (state.type === 'all' || item.type === state.type);
  }

  function platformPill(platform) {
    return `<span class="platform-pill ${esc(platform)}">${esc(label(platform))}</span>`;
  }

  function renderEntry(item) {
    const date = parseDate(item.date);
    const origin = item.origin === 'datos'
      ? '<span class="log-origin auto">Detectado en los datos</span>'
      : `<span class="log-origin">${esc([item.author, date ? longDate(date) : ''].filter(Boolean).join(' | ') || 'Equipo')}</span>`;
    return `<li class="log-entry">
      <div class="log-entry-head">${platformPill(item.platform)}${origin}</div>
      <div class="log-entry-title">${esc(item.title)}</div>
      ${item.detail ? `<div class="log-entry-detail">${esc(item.detail)}</div>` : ''}
    </li>`;
  }

  function monthSummary(month) {
    if (!hasData(month)) return '';
    return PLATFORM_ORDER.filter(platform => month.platforms[platform]).map(platform => {
      const data = month.platforms[platform];
      const groups = Object.keys(data.spendByGroup || {})
        .map(group => `<span class="group-pill ${GROUP_CLASS[group] || ''}">${esc(group)}</span>`).join('');
      return `<div class="log-summary-item">${platformPill(platform)}<strong>${fmtMoney(data.kpis?.spend, platform)}</strong><span class="log-summary-groups">${groups}</span></div>`;
    }).join('');
  }

  function renderMonth({ month, entries }) {
    const visible = entries.filter(matches);
    const types = state.type === 'all' ? TYPES : TYPES.filter(type => type.id === state.type);
    const status = month.status === 'cerrado'
      ? '<span class="status-pill green">Cerrado</span>'
      : month.status === 'parcial' ? '<span class="status-pill amber">En curso</span>' : '<span class="status-pill muted">Sin datos</span>';
    const columns = types.map(type => {
      const list = visible.filter(item => item.type === type.id);
      return `<div class="log-column">
        <div class="log-column-head"><span class="log-type ${type.id}">${type.label}</span><span class="log-count">${list.length}</span></div>
        ${list.length ? `<ul class="log-list">${list.map(renderEntry).join('')}</ul>` : `<div class="log-empty">${type.empty}</div>`}
      </div>`;
    }).join('');
    return `<article class="panel log-month" id="log-${esc(month.name.toLowerCase())}">
      <div class="log-month-head">
        <div>
          <div class="log-month-title">${esc(month.name)} ${esc(state.ads?.year || '')} ${status}</div>
          <div class="panel-sub">${esc(month.period || 'Sin datos de pauta')}</div>
        </div>
        <div class="log-summary">${monthSummary(month)}</div>
      </div>
      <div class="log-columns cols-${types.length}">${columns}</div>
    </article>`;
  }

  function renderKpis(months) {
    const kpis = document.getElementById('log-kpis');
    if (!kpis) return;
    const all = months.flatMap(item => item.entries).filter(matches);
    const count = type => all.filter(item => item.type === type).length;
    const own = all.filter(item => item.origin === 'equipo').length;
    const updated = parseDate(state.log?.updatedAt);
    kpis.innerHTML = [
      ['Meses', fmtCount(months.length), 'Con registros en la bitácora'],
      ['Cambios', fmtCount(count('cambio')), 'De campañas, presupuesto y cuentas'],
      ['Comentarios', fmtCount(count('comentario')), 'Observaciones del mes'],
      ['Decisiones', fmtCount(count('decision')), 'Acuerdos tomados'],
      ['Registros del equipo', fmtCount(own), updated ? `Actualizado al ${longDate(updated)}` : 'Sin registros manuales'],
    ].map(([name, value, meta]) => `<div class="kpi-pill"><span>${name}</span><strong>${value}</strong><small>${meta}</small></div>`).join('');
  }

  function render() {
    const list = document.getElementById('log-months');
    if (!list) return;
    if (!state.ads) state.ads = window.RKObjectives?.snapshot?.() || null;
    const months = buildMonths().reverse();
    renderKpis(months);
    const sub = document.getElementById('log-sub');
    if (sub) sub.textContent = months.length ? `${months.length} meses, del más reciente al más antiguo.` : '';
    list.innerHTML = months.length
      ? months.map(renderMonth).join('')
      : '<div class="empty-state"><strong>La bitácora aún no tiene registros</strong>Se completa con los datos de Gasto publicitario y con data/rk-bitacora-2026.json.</div>';
  }

  async function loadLog() {
    if (window.RK_BITACORA) return window.RK_BITACORA;
    try {
      const response = await fetch(DATA_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      // Sin el archivo la bitacora sigue mostrando los cambios detectados en los datos.
      console.warn('[bitacora] no se pudo leer', DATA_URL, error);
      return { entries: [] };
    }
  }

  function wireEvents() {
    document.getElementById('log-type-filter')?.addEventListener('change', event => {
      const input = event.target.closest('input[type="radio"]');
      if (!input) return;
      state.type = input.value;
      document.querySelectorAll('#log-type-filter .series-toggle').forEach(item => item.classList.toggle('active', item.dataset.series === state.type));
      render();
    });
    document.getElementById('log-platform')?.addEventListener('change', event => {
      state.platform = event.target.value;
      render();
    });
    window.addEventListener('rk:data-updated', () => {
      state.ads = window.RKObjectives?.snapshot?.() || state.ads;
      if (state.log) render();
    });
  }

  async function init() {
    if (state.ready) { render(); return; }
    state.ready = true;
    wireEvents();
    state.log = await loadLog();
    render();
  }

  window.RKBitacora = { init, render };
})();
