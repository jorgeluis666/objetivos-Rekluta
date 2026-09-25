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
    spend: { label: 'Inversion', money: true, sub: 'TikTok Ads en S/. (eje izquierdo) y Meta Ads en US$ (eje derecho)' },
    clicks: { label: 'Clics salientes', sub: 'Clics salientes de todas las campanas de cada plataforma' },
    messageClicks: { label: 'Clics de Mensajes', sub: 'Clics salientes de las campanas de Mensajes' },
    exposure: { label: 'Exposicion', sub: 'Visualizaciones de video en TikTok y alcance de Reconocimiento en Meta' },
  };

  const state = { ready: false, metric: 'spend', chart: null, projection: null, data: null };

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

  function sumProjected(projection, key) {
    return projection.platforms.reduce((total, item) => total + (item.byKey[key]?.projected || 0), 0);
  }
  function sumReference(projection, key) {
    const values = projection.platforms.map(item => item.byKey[key]?.reference).filter(isNum);
    return values.length ? values.reduce((total, value) => total + value, 0) : null;
  }

  function renderKpis(projection) {
    const host = document.getElementById('projection-kpis');
    if (!host) return;
    const prev = projection.previousName ? `vs ${projection.previousName}` : '';
    const cards = PLATFORM_ORDER.filter(platform => projection.byPlatform[platform]).map(platform => {
      const spend = projection.byPlatform[platform].byKey.spend;
      const change = pctChange(spend.projected, spend.reference);
      return [`Inversion proyectada ${label(platform)}`, fmtMoney(spend.projected, platform), `${fmtMoney(spend.pace, platform)} por dia${isNum(change) ? ` | ${change >= 0 ? '+' : ''}${change.toFixed(0)}% ${prev}` : ''}`];
    });
    [['clicks', 'Clics salientes proyectados'], ['messageClicks', 'Clics de Mensajes proyectados']].forEach(([key, name]) => {
      const total = sumProjected(projection, key);
      const change = pctChange(total, sumReference(projection, key));
      const split = projection.platforms.map(item => `${label(item.platform).replace(' Ads', '')} ${fmtCompact(item.byKey[key]?.projected, false)}`).join(' | ');
      cards.push([name, fmtCount(total), `${split}${isNum(change) ? ` | ${change >= 0 ? '+' : ''}${change.toFixed(0)}% ${prev}` : ''}`]);
    });
    cards.push([
      'Avance del mes',
      `${projection.lastDay} de ${projection.daysInMonth} dias`,
      projection.closed ? 'Mes cerrado' : `Quedan ${projection.daysLeft} dias | datos al ${longDate(projection.cutoff)}`,
    ]);
    host.innerHTML = cards.map(([name, value, hint]) => `<div class="kpi-pill"><span>${esc(name)}</span><strong>${value}</strong><small>${esc(hint)}</small></div>`).join('');
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
    document.getElementById('projection-chart-sub').textContent = projection.closed
      ? `${projection.monthLabel} cerrado. ${config.sub}.`
      : `Real hasta el dia ${projection.lastDay} y proyeccion hasta el ${projection.daysInMonth}. ${config.sub}.`;
    document.querySelectorAll('#projection-metrics .series-toggle').forEach(item => {
      const active = item.dataset.series === state.metric;
      item.classList.toggle('active', active);
      item.querySelector('input').checked = active;
    });
    const legend = document.getElementById('projection-legend');
    if (legend) {
      legend.innerHTML = [
        ...projection.platforms.map(item => `<span><i class="legend-line ${item.platform}"></i><b>${esc(label(item.platform))}</b></span>`),
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
    const datasets = projection.platforms.flatMap(item => {
      const { platform } = item;
      const data = series(projection, item, state.metric);
      const color = PLATFORM_COLORS[platform];
      const yAxisID = config.money && platform === 'meta' ? 'y1' : 'y';
      const base = { platform, borderColor: color, backgroundColor: color, pointRadius: 0, pointHoverRadius: 5, tension: 0, yAxisID };
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
      y: { ...axis, grid: { color: 'rgba(148,163,184,.20)' }, ticks: { ...axis.ticks, callback: tick('tiktok') } },
    };
    if (config.money) {
      scales.y.ticks.color = PLATFORM_COLORS.tiktok;
      scales.y1 = { ...axis, position: 'right', grid: { drawOnChartArea: false }, ticks: { ...axis.ticks, color: PLATFORM_COLORS.meta, callback: tick('meta') } };
    }

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
