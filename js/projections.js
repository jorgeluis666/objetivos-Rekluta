(function () {
  // Proyecta al cierre del mes en curso los indicadores del modulo Gasto publicitario, por plataforma
  // y en su moneda de facturacion (TikTok Ads en S/., Meta Ads en US$), sin tipo de cambio.
  const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const SHORT_MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const PLATFORM_ORDER = ['tiktok', 'meta'];
  const PLATFORM_COLORS = { tiktok: '#db2777', meta: '#2563eb' };
  // Indicadores acumulables de cada plataforma. El alcance de Meta es de usuarios unicos: su proyeccion es referencial.
  const METRICS = {
    tiktok: [
      { key: 'spend', label: 'Inversion', money: true },
      { key: 'views', label: 'Visualizaciones' },
      { key: 'clicks', label: 'Clics salientes' },
      { key: 'messageClicks', label: 'Clics de Mensajes' },
      { key: 'followers', label: 'Seguidores de pago' },
    ],
    meta: [
      { key: 'spend', label: 'Inversion', money: true },
      { key: 'reach', label: 'Alcance', note: 'Usuarios unicos: referencial' },
      { key: 'clicks', label: 'Clics salientes' },
      { key: 'messageClicks', label: 'Clics de Mensajes' },
      { key: 'interactions', label: 'Interacciones' },
    ],
  };
  const CHART_METRICS = {
    spend: { label: 'Inversion', money: true, sub: platform => `Inversion en ${platform === 'tiktok' ? 'soles' : 'dolares'}` },
    clicks: { label: 'Clics salientes', sub: () => 'Clics salientes de todas las campanas' },
    messageClicks: { label: 'Clics de Mensajes', sub: () => 'Clics salientes de las campanas de Mensajes' },
    exposure: { label: 'Exposicion', sub: platform => (platform === 'tiktok' ? 'Visualizaciones de video' : 'Alcance de las campanas de Reconocimiento') },
  };
  // Filas de indicadores de la parte superior: una por plataforma, Meta primero.
  const KPI_ROWS = [
    { platform: 'meta', keys: ['spend', 'reach', 'clicks', 'messageClicks'] },
    { platform: 'tiktok', keys: ['spend', 'views', 'followers', 'clicks', 'messageClicks'] },
  ];
  const KPI_TITLES = {
    spend: 'Inversion proyectada',
    reach: 'Alcance proyectado',
    views: 'Visualizaciones proyectadas',
    followers: 'Seguidores de pago proyectados',
    clicks: 'Clics salientes proyectados',
    messageClicks: 'Clics de Mensajes proyectados',
  };
  const PLATFORM_KEY = 'rk-projection-platform-v1';

  const state = { ready: false, metric: 'spend', platform: readPlatform(), chart: null, projection: null, data: null };

  function readPlatform() {
    try { return localStorage.getItem(PLATFORM_KEY) === 'tiktok' ? 'tiktok' : 'meta'; } catch { return 'meta'; }
  }
  function savePlatform() {
    try { localStorage.setItem(PLATFORM_KEY, state.platform); } catch {}
  }

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const isNum = value => value != null && value !== '' && Number.isFinite(Number(value));
  const symbol = platform => state.data?.platforms?.[platform]?.symbol || '';
  const label = platform => state.data?.platforms?.[platform]?.label || platform;
  const fmtCount = value => isNum(value) ? Math.round(Number(value)).toLocaleString('es-PE') : '-';
  function fmtMoney(value, platform, digits = 2) {
    if (!isNum(value)) return '-';
    return `${symbol(platform)} ${Number(value).toLocaleString('es-PE', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  }
  // Los costos por clic de Meta son de centavos: tres decimales para no perderlos.
  const fmtCost = (value, platform) => fmtMoney(value, platform, isNum(value) && Number(value) < 0.1 ? 3 : 2);
  const fmtValue = (value, metric, platform) => (metric.money ? fmtMoney(value, platform) : fmtCount(value));
  function fmtCompact(value, money, platform) {
    if (!isNum(value)) return '';
    const prefix = money ? `${symbol(platform)} ` : '';
    if (Math.abs(value) >= 1e6) return `${prefix}${(value / 1e6).toFixed(2)}M`;
    if (Math.abs(value) >= 1e3) return `${prefix}${(value / 1e3).toFixed(1)}k`;
    return `${prefix}${Math.round(value)}`;
  }
  const pctChange = (value, base) => (isNum(value) && Number(base) > 0 ? (value / base - 1) * 100 : null);
  const ratio = (value, count) => (isNum(value) && Number(count) > 0 ? Number(value) / Number(count) : null);

  function parseDate(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
  }
  const longDate = date => (date ? `${date.getDate()} de ${MONTHS[date.getMonth()].toLowerCase()}` : '-');
  const hasData = month => month && Object.keys(month.platforms || {}).length > 0;
  const exposure = (platform, kpis) => (platform === 'tiktok' ? kpis?.views : kpis?.reach);

  // El mes proyectado es el de la fecha de corte; si no tiene datos, el ultimo mes con datos.
  function pickMonth(months, cutoff) {
    const withData = months.filter(hasData);
    if (!withData.length) return null;
    const current = cutoff ? withData.find(month => MONTHS.indexOf(month.name) === cutoff.getMonth()) : null;
    return current || withData[withData.length - 1];
  }

  // Dias transcurridos de cada plataforma: si la pauta arranco despues del dia 1 (ej. Meta en agosto),
  // el ritmo se calcula solo sobre los dias con pauta.
  function elapsedDays(platformData, year, monthIndex, lastDay) {
    const first = parseDate(platformData.firstDay);
    const startDay = first && first.getFullYear() === year && first.getMonth() === monthIndex ? first.getDate() : 1;
    return Math.max(1, lastDay - startDay + 1);
  }

  function buildProjection(data) {
    const cutoff = parseDate(data.cutoff);
    const month = pickMonth(data.months || [], cutoff);
    if (!month) return null;
    const monthIndex = MONTHS.indexOf(month.name);
    const year = data.year || cutoff?.getFullYear() || new Date().getFullYear();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const closed = month.status !== 'parcial' || !cutoff || cutoff.getMonth() !== monthIndex || cutoff.getDate() >= daysInMonth;
    const lastDay = closed ? daysInMonth : cutoff.getDate();
    const previous = [...data.months.slice(0, data.months.indexOf(month))].reverse().find(hasData) || null;

    const platforms = PLATFORM_ORDER.filter(platform => month.platforms[platform]).map(platform => {
      const current = month.platforms[platform];
      const before = previous?.platforms?.[platform] || null;
      const days = elapsedDays(current, year, monthIndex, lastDay);
      const remaining = daysInMonth - lastDay;
      const metrics = METRICS[platform].map(metric => {
        const actual = Number(current.kpis[metric.key]) || 0;
        const pace = actual / days;
        const projected = closed ? actual : actual + pace * remaining;
        const reference = before ? Number(before.kpis[metric.key]) || null : null;
        return { ...metric, actual, pace, projected, reference, change: pctChange(projected, reference) };
      });
      const byKey = Object.fromEntries(metrics.map(metric => [metric.key, metric]));
      const projectedGroups = Object.fromEntries(Object.entries(current.spendByGroup || {}).map(([group, value]) => [group, closed ? value : value + (value / days) * remaining]));
      // Con un ritmo constante los costos unitarios no cambian al cierre; se comparan con el mes anterior.
      const costs = [
        { label: 'Costo por clic saliente', value: ratio(current.kpis.spend, current.kpis.clicks), reference: before ? ratio(before.kpis.spend, before.kpis.clicks) : null },
        { label: 'Costo por clic de Mensajes', value: ratio(current.spendByGroup?.Mensajes, current.kpis.messageClicks), reference: before ? ratio(before.spendByGroup?.Mensajes, before.kpis.messageClicks) : null },
      ];
      if (platform === 'tiktok') {
        costs.push({ label: 'Costo por seguidor', value: ratio(current.kpis.spend, current.kpis.followers), reference: before ? ratio(before.kpis.spend, before.kpis.followers) : null });
      }
      costs.forEach(cost => { cost.change = pctChange(cost.value, cost.reference); });
      return { platform, days, startOffset: lastDay - days, metrics, byKey, projectedGroups, costs, exposure: platform === 'tiktok' ? byKey.views : byKey.reach };
    });

    return {
      month,
      monthIndex,
      monthLabel: `${month.name} ${year}`,
      shortMonth: SHORT_MONTHS[monthIndex],
      previousName: previous?.name || null,
      year,
      daysInMonth,
      lastDay,
      daysLeft: daysInMonth - lastDay,
      closed,
      cutoff,
      platforms,
      byPlatform: Object.fromEntries(platforms.map(item => [item.platform, item])),
    };
  }

  function changePill(change, { inverse = false, neutral = false } = {}) {
    if (!isNum(change)) return '<span class="no-data">Sin referencia</span>';
    const rounded = Math.round(change);
    if (rounded === 0) return '<span class="projection-gap flat">Igual al mes anterior</span>';
    // En costos, subir es negativo; en volumen, subir es positivo. La inversion no se califica.
    const good = inverse ? rounded < 0 : rounded > 0;
    const tone = neutral ? 'flat' : good ? 'ok' : 'over';
    return `<span class="projection-gap ${tone}">${rounded > 0 ? '+' : ''}${rounded}%</span>`;
  }

  function renderKpis(projection) {
    const host = document.getElementById('projection-kpis');
    if (!host) return;
    const prev = projection.previousName ? `vs ${projection.previousName}` : '';
    const progress = projection.closed ? 'Mes cerrado' : `Dia ${projection.lastDay} de ${projection.daysInMonth} | quedan ${projection.daysLeft} dias`;
    host.innerHTML = KPI_ROWS.filter(row => projection.byPlatform[row.platform]).map(row => {
      const item = projection.byPlatform[row.platform];
      const cards = row.keys.map(key => item.byKey[key]).filter(Boolean).map(metric => {
        const pace = metric.money ? fmtMoney(metric.pace, row.platform) : fmtCount(metric.pace);
        const change = isNum(metric.change) ? ` | ${metric.change >= 0 ? '+' : ''}${metric.change.toFixed(0)}% ${prev}` : '';
        return `<div class="kpi-pill"><span>${esc(KPI_TITLES[metric.key] || metric.label)}</span><strong>${fmtValue(metric.projected, metric, row.platform)}</strong><small>${esc(`${pace} por dia${change}`)}</small></div>`;
      }).join('');
      return `<div class="projection-kpi-row"><div class="projection-kpi-head"><span class="platform-pill ${row.platform}">${esc(label(row.platform))}</span><small>${esc(state.data.platforms[row.platform].currency)} | ${esc(progress)}</small></div><div class="kpi-strip cols-${row.keys.length}">${cards}</div></div>`;
    }).join('');
  }

  function renderTable(projection) {
    const body = document.getElementById('projection-body');
    if (!body) return;
    const prevHead = document.getElementById('projection-prev-head');
    if (prevHead) prevHead.textContent = projection.previousName ? `Cierre ${projection.previousName}` : 'Mes anterior';
    const actualHead = document.getElementById('projection-actual-head');
    if (actualHead) actualHead.textContent = `Actual al ${projection.lastDay}-${projection.shortMonth}`;
    const closeHead = document.getElementById('projection-close-head');
    if (closeHead) closeHead.textContent = `Proyeccion al ${projection.daysInMonth}-${projection.shortMonth}`;

    body.innerHTML = projection.platforms.map(item => {
      const { platform } = item;
      const pace = item.startOffset > 0 ? ` | pauta desde el dia ${item.startOffset + 1}` : '';
      const groupRow = `<tr class="projection-platform-row"><td colspan="6"><span class="platform-pill ${platform}">${esc(label(platform))}</span><small>${esc(state.data.platforms[platform].currency)} | ritmo sobre ${item.days} dias${pace}</small></td></tr>`;
      const metricRows = item.metrics.map(metric => `
        <tr>
          <td class="campaign-name">${esc(metric.label)}${metric.note ? `<small class="projection-note-inline">${esc(metric.note)}</small>` : ''}</td>
          <td class="num">${fmtValue(metric.actual, metric, platform)}</td>
          <td class="num">${metric.money ? fmtMoney(metric.pace, platform) : fmtCount(metric.pace)}</td>
          <td class="num projection-value">${fmtValue(metric.projected, metric, platform)}</td>
          <td class="num">${isNum(metric.reference) ? fmtValue(metric.reference, metric, platform) : '<span class="no-data">-</span>'}</td>
          <td>${changePill(metric.change, { neutral: metric.money })}</td>
        </tr>`).join('');
      const groups = Object.entries(item.projectedGroups).sort((a, b) => b[1] - a[1]);
      const groupRows = groups.length > 1 ? groups.map(([group, value]) => {
        const actual = projection.month.platforms[platform].spendByGroup[group];
        const reference = projection.previousName ? state.data.months.find(month => month.name === projection.previousName)?.platforms?.[platform]?.spendByGroup?.[group] : null;
        return `
        <tr class="projection-sub-row">
          <td class="campaign-name">Inversion ${esc(group)}</td>
          <td class="num">${fmtMoney(actual, platform)}</td>
          <td class="num">${fmtMoney(actual / item.days, platform)}</td>
          <td class="num projection-value">${fmtMoney(value, platform)}</td>
          <td class="num">${isNum(reference) ? fmtMoney(reference, platform) : '<span class="no-data">-</span>'}</td>
          <td>${changePill(pctChange(value, reference), { neutral: true })}</td>
        </tr>`;
      }).join('') : '';
      const costRows = item.costs.map(cost => `
        <tr class="projection-cost-row">
          <td class="campaign-name">${esc(cost.label)}</td>
          <td class="num">${fmtCost(cost.value, platform)}</td>
          <td class="num"><span class="no-data">-</span></td>
          <td class="num projection-value">${fmtCost(cost.value, platform)}</td>
          <td class="num">${isNum(cost.reference) ? fmtCost(cost.reference, platform) : '<span class="no-data">-</span>'}</td>
          <td>${changePill(cost.change, { inverse: true })}</td>
        </tr>`).join('');
      return groupRow + metricRows + groupRows + costRows;
    }).join('');
  }

  // Serie acumulada diaria: real hasta el corte y ritmo constante hasta fin de mes.
  function series(projection, item, metricKey) {
    const metric = metricKey === 'exposure' ? item.exposure : item.byKey[metricKey];
    if (!metric) return { real: [], forecast: [], reference: null };
    const valueAt = day => (day <= item.startOffset ? 0 : metric.pace * (day - item.startOffset));
    const days = Array.from({ length: projection.daysInMonth }, (_, index) => index + 1);
    return {
      real: days.map(day => (day <= projection.lastDay ? valueAt(day) : null)),
      forecast: days.map(day => (!projection.closed && day >= projection.lastDay ? valueAt(day) : null)),
      reference: metric.reference,
    };
  }

  const cutoffMarker = {
    id: 'cutoffMarker',
    afterDatasetsDraw(chart, args, options) {
      const index = options?.index;
      if (index == null || index < 0) return;
      const x = chart.scales.x.getPixelForValue(index);
      const { top, bottom, left, right } = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#7890b5';
      ctx.font = '700 9px Inter, sans-serif';
      ctx.textAlign = x > (left + right) / 2 ? 'right' : 'left';
      ctx.fillText(options.label || '', x + (ctx.textAlign === 'right' ? -6 : 6), top + 10);
      ctx.restore();
    },
  };

  function renderChart(projection) {
    const config = CHART_METRICS[state.metric] || CHART_METRICS.spend;
    // El grafico muestra una sola plataforma; si la elegida no tiene pauta en el mes, se usa la otra.
    if (!projection.byPlatform[state.platform]) state.platform = projection.platforms[0].platform;
    const shown = projection.platforms.filter(item => item.platform === state.platform);
    const sub = config.sub(state.platform);
    document.getElementById('projection-chart-sub').textContent = projection.closed
      ? `${label(state.platform)} | ${projection.monthLabel} cerrado. ${sub}.`
      : `${label(state.platform)} | real hasta el dia ${projection.lastDay} y proyeccion hasta el ${projection.daysInMonth}. ${sub}.`;
    const exposureLabel = document.getElementById('projection-exposure-label');
    if (exposureLabel) exposureLabel.textContent = state.platform === 'tiktok' ? 'Visualizaciones' : 'Alcance';
    [['#projection-metrics', state.metric], ['#projection-platforms', state.platform]].forEach(([group, value]) => {
      document.querySelectorAll(`${group} .series-toggle`).forEach(item => {
        const active = item.dataset.series === value;
        item.classList.toggle('active', active);
        item.querySelector('input').checked = active;
        item.querySelector('input').disabled = group === '#projection-platforms' && !projection.byPlatform[item.dataset.series];
      });
    });
    const legend = document.getElementById('projection-legend');
    if (legend) {
      legend.innerHTML = [
        ...shown.map(item => `<span><i class="legend-line ${item.platform}"></i><b>${esc(label(item.platform))}</b></span>`),
        '<span><i class="legend-line dashed"></i><b>Proyeccion al cierre</b></span>',
        projection.previousName ? `<span><i class="legend-line dotted"></i><b>Cierre de ${esc(projection.previousName)}</b></span>` : '',
      ].join('');
    }

    const canvas = document.getElementById('chart-projection');
    if (!canvas) return;
    if (typeof Chart === 'undefined') {
      canvas.parentElement.innerHTML = '<div class="empty-state"><strong>Grafico no disponible sin conexion.</strong><span>La tabla de proyeccion sigue visible debajo.</span></div>';
      return;
    }
    const labels = Array.from({ length: projection.daysInMonth }, (_, index) => `${index + 1} ${projection.shortMonth}`);
    const datasets = shown.flatMap(item => {
      const { platform } = item;
      const data = series(projection, item, state.metric);
      const color = PLATFORM_COLORS[platform];
      const base = { platform, borderColor: color, backgroundColor: color, pointRadius: 0, pointHoverRadius: 5, tension: 0 };
      const list = [
        { ...base, label: `${label(platform)} real`, data: data.real, borderWidth: 2.5 },
        { ...base, label: `${label(platform)} proyeccion`, data: data.forecast, borderWidth: 2, borderDash: [6, 5] },
      ];
      if (isNum(data.reference)) {
        list.push({ ...base, label: `${label(platform)} cierre ${projection.previousName}`, data: labels.map(() => data.reference), borderWidth: 1.2, borderDash: [2, 4], pointHoverRadius: 0, borderColor: `${color}88` });
      }
      return list;
    });
    const tick = platform => value => fmtCompact(value, config.money, platform);
    const axis = { beginAtZero: true, grace: '8%', border: { display: false }, ticks: { color: '#7890b5', font: { size: 10 } } };
    const scales = {
      x: { grid: { display: false }, border: { color: '#cbd5e1' }, ticks: { color: '#7890b5', font: { size: 10 }, maxTicksLimit: 10, autoSkip: true } },
      y: { ...axis, grid: { color: 'rgba(148,163,184,.20)' }, ticks: { ...axis.ticks, callback: tick(state.platform) } },
    };

    if (state.chart) state.chart.destroy();
    state.chart = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 18, right: 8, left: 4 } },
        plugins: {
          legend: { display: false },
          cutoffMarker: { index: projection.closed ? -1 : projection.lastDay - 1, label: `Datos al ${projection.lastDay}-${projection.shortMonth}` },
          tooltip: {
            filter: item => item.raw != null,
            callbacks: {
              label: context => ` ${context.dataset.label}: ${config.money ? fmtMoney(context.raw, context.dataset.platform) : fmtCount(context.raw)}`,
            },
          },
        },
        scales,
      },
      plugins: [cutoffMarker],
    });
  }

  function renderHeader(projection) {
    const desc = document.getElementById('projection-desc');
    if (desc) {
      desc.textContent = projection.closed
        ? `${projection.monthLabel} esta cerrado: se muestran sus totales reales frente a ${projection.previousName || 'el mes anterior'}.`
        : `Cierre estimado de ${projection.monthLabel} con los datos reales del modulo Gasto publicitario al ${longDate(projection.cutoff)} (${projection.lastDay} de ${projection.daysInMonth} dias). Cada plataforma se proyecta en su moneda de facturacion manteniendo su ritmo diario promedio.`;
    }
    const title = document.getElementById('projection-title');
    if (title) title.textContent = `Linea de tiempo | ${projection.monthLabel}`;
    const tableSub = document.getElementById('projection-table-sub');
    if (tableSub) {
      tableSub.textContent = `Ritmo diario = acumulado real / dias con pauta. Proyeccion = actual + ritmo x ${projection.daysLeft} dias restantes. La ultima columna compara la proyeccion con el cierre de ${projection.previousName || 'el mes anterior'}.`;
    }
    const note = document.getElementById('projection-note');
    if (note) {
      const source = projection.platforms.map(item => `${label(item.platform)}: ${projection.month.platforms[item.platform].source === 'excel' ? 'exportacion Excel' : 'reporte PDF'}`).join(' | ');
      note.textContent = `Sin detalle diario, la linea real se traza con el ritmo promedio del periodo. Fuente del mes: ${source}.`;
    }
  }

  function renderEmpty(message) {
    const body = document.getElementById('projection-body');
    if (body) body.innerHTML = `<tr><td class="table-empty" colspan="6">${esc(message)}</td></tr>`;
    const sub = document.getElementById('projection-chart-sub');
    if (sub) sub.textContent = message;
  }

  function render() {
    // El modulo puede abrirse antes de que Gasto publicitario termine de cargar; rk:data-updated lo reintenta.
    const data = window.RKObjectives?.snapshot?.();
    if (!data) {
      renderEmpty('Esperando los datos del modulo Gasto publicitario...');
      return;
    }
    state.data = data;
    const projection = buildProjection(data);
    state.projection = projection;
    if (!projection || !projection.platforms.length) {
      renderEmpty('Sin datos para proyectar.');
      return;
    }
    renderHeader(projection);
    renderKpis(projection);
    renderChart(projection);
    renderTable(projection);
  }

  function wireEvents() {
    document.getElementById('projection-metrics')?.addEventListener('change', event => {
      const input = event.target.closest('input[type="radio"]');
      if (!input) return;
      state.metric = input.value;
      if (state.projection) renderChart(state.projection);
    });
    document.getElementById('projection-platforms')?.addEventListener('change', event => {
      const input = event.target.closest('input[type="radio"]');
      if (!input) return;
      state.platform = input.value;
      savePlatform();
      if (state.projection) renderChart(state.projection);
    });
    window.addEventListener('rk:data-updated', () => {
      if (state.ready) render();
    });
  }

  function init() {
    if (!state.ready) {
      wireEvents();
      state.ready = true;
    }
    render();
  }

  window.RKProjections = { init, render };
})();
