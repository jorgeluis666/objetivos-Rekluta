(function () {
  // Datos generados por scripts/build-ads-data.py desde las exportaciones de Meta Ads y TikTok Ads
  // y los reportes mensuales de Drive. En el build llegan incrustados como window.RK_ADS_DATA.
  const DATA_URL = 'data/rk-ads-2026.json';
  const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const SHORT_MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const PLATFORM_ORDER = ['tiktok', 'meta'];
  const PLATFORM_COLORS = { tiktok: '#db2777', meta: '#2563eb' };
  const GROUP_CLASS = { Reconocimiento: 'branding', Mensajes: 'messages', Seguidores: 'followers' };
  const CHART_METRICS = {
    spend: { label: 'Inversion', money: true, sub: 'TikTok Ads en S/. (eje izquierdo) y Meta Ads en US$ (eje derecho)' },
    messageClicks: { label: 'Clics a mensajes', money: false, sub: 'Clics de las campanas de Mensajes / Trafico de cada plataforma' },
    exposure: { label: 'Exposicion', money: false, sub: 'Visualizaciones de video en TikTok y alcance en Meta' },
  };
  const CHART_COLLAPSED_KEY = 'rk-chart-collapsed-v1';
  const CHART_METRIC_KEY = 'rk-ads-chart-metric-v1';
  const state = { data: null, month: null, chart: null, platform: 'all', metric: readPref(CHART_METRIC_KEY, 'spend'), chartCollapsed: readPref(CHART_COLLAPSED_KEY, 'false') === 'true', open: new Set() };

  function readPref(key, fallback) {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  }
  function savePref(key, value) {
    try { localStorage.setItem(key, String(value)); } catch {}
  }

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  // Solo enlaces https de Facebook (vista previa de anuncios); descarta cualquier otro esquema.
  const safeUrl = value => /^https:\/\/(www\.)?facebook\.com\//i.test(String(value || '')) ? esc(value) : '';
  const isNum = value => value != null && value !== '' && Number.isFinite(Number(value));
  const fmtCount = value => isNum(value) ? Number(value).toLocaleString('es-PE', { maximumFractionDigits: 0 }) : '-';
  const fmtPct = value => isNum(value) ? `${Number(value).toLocaleString('es-PE', { maximumFractionDigits: 1 })}%` : '-';
  function symbol(platform) { return state.data?.platforms?.[platform]?.symbol || ''; }
  function fmtMoney(value, platform, digits = 2) {
    if (!isNum(value)) return '-';
    return `${symbol(platform)} ${Number(value).toLocaleString('es-PE', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  }
  function fmtCost(value, platform) {
    // Los costos por clic de Meta son de centavos: se muestran con tres decimales para no perderlos.
    return fmtMoney(value, platform, isNum(value) && Number(value) < 0.1 ? 3 : 2);
  }
  function fmtCompact(value, money, platform) {
    if (value == null) return '';
    const prefix = money ? `${symbol(platform)} ` : '';
    if (Math.abs(value) >= 1e6) return `${prefix}${(value / 1e6).toFixed(2)}M`;
    if (Math.abs(value) >= 1e3) return `${prefix}${(value / 1e3).toFixed(1)}k`;
    return `${prefix}${money ? Number(value).toFixed(0) : Math.round(value)}`;
  }
  function label(platform) { return state.data?.platforms?.[platform]?.label || platform; }
  function monthData(name) { return state.data.months.find(month => month.name === name); }
  function hasData(month) { return month && Object.keys(month.platforms || {}).length > 0; }
  function longDate(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return match ? `${Number(match[3])} de ${MONTHS[Number(match[2]) - 1].toLowerCase()}` : '-';
  }
  function exposure(platform, kpis) { return platform === 'tiktok' ? kpis.views : kpis.reach; }
  function metricValue(month, platform, metric) {
    const data = month?.platforms?.[platform];
    if (!data) return null;
    if (metric === 'exposure') return exposure(platform, data.kpis) ?? null;
    return data.kpis[metric] ?? null;
  }
  function platformPill(platform) {
    return `<span class="platform-pill ${platform}">${esc(label(platform))}</span>`;
  }
  function groupPill(group) {
    return `<span class="group-pill ${GROUP_CLASS[group] || ''}">${esc(group)}</span>`;
  }

  // Resultado principal de cada campana, con el mismo criterio del reporte mensual.
  function mainResult(platform, campaign) {
    if (campaign.group === 'Mensajes') return { value: campaign.clicks, label: 'clics' };
    if (campaign.group === 'Seguidores') return { value: campaign.followers, label: 'seguidores' };
    if (platform === 'tiktok') return { value: campaign.views, label: 'visualizaciones' };
    return { value: campaign.reach, label: 'alcance' };
  }

  // ── KPIs acumulados del año ────────────────────────────────────────────────
  function yearTotals() {
    const totals = { tiktok: { spend: 0, views: 0, followers: 0, messageClicks: 0 }, meta: { spend: 0, reach: 0, messageClicks: 0, clicks: 0 }, months: 0 };
    state.data.months.forEach(month => {
      if (!hasData(month)) return;
      totals.months += 1;
      PLATFORM_ORDER.forEach(platform => {
        const kpis = month.platforms[platform]?.kpis;
        if (!kpis) return;
        Object.keys(totals[platform]).forEach(key => { totals[platform][key] += Number(kpis[key] || 0); });
      });
    });
    return totals;
  }
  function renderKpis() {
    const host = document.getElementById('kpi-strip');
    const totals = yearTotals();
    const messageClicks = totals.tiktok.messageClicks + totals.meta.messageClicks;
    const cutoff = longDate(state.data.cutoff);
    const cards = [
      ['Inversion TikTok Ads', fmtMoney(totals.tiktok.spend, 'tiktok'), `Acumulado al ${cutoff}`],
      ['Inversion Meta Ads', fmtMoney(totals.meta.spend, 'meta'), `Acumulado al ${cutoff}`],
      ['Visualizaciones TikTok', fmtCompact(totals.tiktok.views, false), `${fmtCount(totals.tiktok.followers)} seguidores ganados`],
      ['Alcance Meta', fmtCompact(totals.meta.reach, false), `${fmtCount(totals.meta.clicks)} clics en el enlace`],
      ['Clics a mensajes', fmtCount(messageClicks), `TikTok ${fmtCompact(totals.tiktok.messageClicks, false)} | Meta ${fmtCompact(totals.meta.messageClicks, false)}`],
    ];
    host.innerHTML = cards.map(([name, value, meta]) => `<div class="kpi-pill"><span>${name}</span><strong>${value}</strong><small>${meta}</small></div>`).join('');
  }

  // ── Grafico mensual ────────────────────────────────────────────────────────
  function applyChartCollapsed() {
    const panel = document.getElementById('chart-panel');
    const button = document.getElementById('chart-toggle-btn');
    panel.classList.toggle('is-collapsed', state.chartCollapsed);
    button.textContent = state.chartCollapsed ? '+' : '-';
    button.setAttribute('aria-expanded', String(!state.chartCollapsed));
    button.setAttribute('title', state.chartCollapsed ? 'Expandir grafico' : 'Minimizar grafico');
  }
  function renderChart() {
    const metric = CHART_METRICS[state.metric] ? state.metric : 'spend';
    const config = CHART_METRICS[metric];
    document.getElementById('chart-title').textContent = `Evolucion mensual | ${config.label} | 2026`;
    document.getElementById('chart-sub').textContent = config.sub;
    document.querySelectorAll('#chart-series-toggles .series-toggle').forEach(item => {
      const active = item.dataset.series === metric;
      item.classList.toggle('active', active);
      item.querySelector('input').checked = active;
    });
    const seriesName = platform => metric === 'exposure' ? (platform === 'tiktok' ? 'TikTok Ads (visualizaciones)' : 'Meta Ads (alcance)') : label(platform);
    document.getElementById('chart-legend').innerHTML = PLATFORM_ORDER.map(platform => `<span><i class="legend-line ${platform}"></i><b>${esc(seriesName(platform))}</b></span>`).join(' ');
    if (state.chartCollapsed) return;
    const canvas = document.getElementById('chart-monthly');
    if (!canvas) return;
    if (typeof Chart === 'undefined') { canvas.parentElement.innerHTML = '<div class="empty-state"><strong>Grafico no disponible sin conexion.</strong><span>Los totales mensuales siguen visibles debajo.</span></div>'; return; }
    const lastIndex = state.data.months.reduce((last, month, index) => hasData(month) ? index : last, 0);
    const labels = SHORT_MONTHS.slice(0, lastIndex + 1).map((name, index) => state.data.months[index]?.status === 'parcial' ? `${name}*` : name);
    const datasets = PLATFORM_ORDER.map(platform => ({
      label: seriesName(platform),
      platform,
      data: state.data.months.slice(0, lastIndex + 1).map(month => metricValue(month, platform, metric)),
      backgroundColor: PLATFORM_COLORS[platform],
      borderRadius: 5,
      maxBarThickness: 34,
      yAxisID: config.money && platform === 'meta' ? 'y1' : 'y',
    }));
    const tick = platform => value => fmtCompact(value, config.money, platform);
    const axis = { beginAtZero: true, border: { display: false }, ticks: { color: '#7890b5', font: { size: 10 } } };
    const scales = {
      x: { grid: { display: false }, border: { color: '#cbd5e1' }, ticks: { color: '#7890b5', font: { size: 10 } } },
      y: { ...axis, grid: { color: 'rgba(148,163,184,.20)' }, ticks: { ...axis.ticks, callback: tick('tiktok') } },
    };
    if (config.money) scales.y1 = { ...axis, position: 'right', grid: { drawOnChartArea: false }, ticks: { ...axis.ticks, color: PLATFORM_COLORS.meta, callback: tick('meta') } };
    if (config.money) scales.y.ticks.color = PLATFORM_COLORS.tiktok;
    if (state.chart) state.chart.destroy();
    state.chart = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 22, right: 8, left: 4 } },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            title: items => { const month = state.data.months[items[0].dataIndex]; return `${month.name}${month.status === 'parcial' ? ` (parcial, ${month.period})` : ''}`; },
            label: context => ` ${context.dataset.label}: ${config.money ? fmtMoney(context.raw, context.dataset.platform) : fmtCount(context.raw)}`,
          } },
        },
        scales,
        onClick: (event, elements) => { if (elements[0]) selectMonth(state.data.months[elements[0].index].name); },
      },
      plugins: [{ id: 'valueLabels', afterDatasetsDraw(chart) {
        const ctx = chart.ctx;
        ctx.save();
        ctx.font = '600 9px Inter, sans-serif';
        ctx.textAlign = 'center';
        chart.data.datasets.forEach((dataset, index) => {
          ctx.fillStyle = dataset.backgroundColor;
          chart.getDatasetMeta(index).data.forEach((bar, point) => {
            const value = dataset.data[point];
            if (value) ctx.fillText(fmtCompact(value, config.money, dataset.platform), bar.x, bar.y - 6);
          });
        });
        ctx.restore();
      } }],
    });
  }

  // ── Mes seleccionado ───────────────────────────────────────────────────────
  function renderTabs() {
    const host = document.getElementById('month-tabs');
    host.innerHTML = MONTHS.map(name => {
      const month = monthData(name);
      const available = hasData(month);
      const partial = month?.status === 'parcial';
      return `<button type="button" class="month-tab ${name === state.month ? 'active' : ''}" data-month="${name}" ${available ? '' : 'disabled'} ${partial ? `title="Parcial: ${esc(month.period)}"` : ''}>${name}${partial ? '<span class="current-dot"></span>' : ''}</button>`;
    }).join('');
  }
  function selectMonth(name) {
    if (!hasData(monthData(name))) return;
    state.month = name;
    state.open.clear();
    document.querySelectorAll('#month-tabs .month-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.month === name));
    renderMonth();
  }
  function reportLink(month) {
    const id = month.report?.id;
    if (!id || !/^[A-Za-z0-9_-]{10,}$/.test(id)) return '';
    return `<a class="refresh-sheet-btn ads-report-link" href="https://drive.google.com/file/d/${esc(id)}/view" target="_blank" rel="noopener">Ver reporte PDF</a>`;
  }
  function renderMonthBar(month) {
    const checks = month.checks || [];
    const failed = checks.filter(check => !check.ok);
    const sources = PLATFORM_ORDER.filter(platform => month.platforms[platform]).map(platform => `${label(platform)}: ${month.platforms[platform].source === 'excel' ? 'exportacion Excel' : 'reporte PDF'}`);
    const status = month.status === 'parcial'
      ? `<span class="status-pill muted">Parcial | ${esc(month.period)}</span>`
      : `<span class="status-pill green">Mes cerrado | ${esc(month.period || month.name)}</span>`;
    const reconcile = !checks.length ? '<span class="status-pill muted">Sin reporte para cruzar</span>'
      : failed.length ? `<span class="status-pill red">${failed.length} diferencia${failed.length === 1 ? '' : 's'} con el reporte</span>`
      : `<span class="status-pill green">Cuadra con el reporte (${checks.length} controles)</span>`;
    document.getElementById('ads-month-bar').innerHTML = `
      <div class="ads-month-info"><strong>${esc(month.name)} 2026</strong>${status}${reconcile}<small>Fuente: ${esc(sources.join(' | '))}</small></div>
      ${reportLink(month)}`;
  }
  function platformCard(month, platform) {
    const data = month.platforms[platform];
    if (!data) {
      return `<div class="panel ads-platform-card ${platform} empty"><div class="ads-platform-head">${platformPill(platform)}</div><div class="empty-state"><strong>Sin pauta en ${esc(label(platform))}</strong><span>No hay inversion registrada en ${esc(month.name.toLowerCase())}.</span></div></div>`;
    }
    const k = data.kpis;
    const cost = (value, count) => isNum(value) && Number(count) > 0 ? Number(value) / Number(count) : null;
    const metrics = platform === 'tiktok' ? [
      ['Visualizaciones', fmtCount(k.views), k.impressions ? `CPM ${fmtMoney(k.spend / k.impressions * 1000, platform)}` : 'Total del reporte mensual'],
      ['Seguidores', fmtCount(k.followers), `${fmtCost(cost(k.spend, k.followers), platform)} por seguidor`],
      ['Clics destino', fmtCount(k.clicks), `${fmtCount(k.profileVisits)} visitas al perfil`],
      ['Clics a mensajes', fmtCount(k.messageClicks), `${fmtCost(cost(data.spendByGroup.Mensajes, k.messageClicks), platform)} por clic`],
    ] : [
      ['Alcance', fmtCount(k.reach), k.impressions ? `${fmtCount(k.impressions)} impresiones` : 'Suma por campana'],
      ['Clics en el enlace', fmtCount(k.clicks), `${fmtCost(cost(k.spend, k.clicks), platform)} por clic`],
      ['Clics a mensajes', fmtCount(k.messageClicks), k.messageClicks ? `${fmtCost(cost(data.spendByGroup.Mensajes, k.messageClicks), platform)} por clic` : 'Sin campana de Mensajes'],
      ['Interacciones', fmtCount(k.interactions), 'Reacciones, comentarios y compartidos'],
    ];
    const groups = Object.entries(data.spendByGroup || {}).sort((a, b) => b[1] - a[1]);
    const bar = groups.map(([group, value]) => `<i class="${GROUP_CLASS[group] || ''}" style="width:${(value / k.spend * 100).toFixed(2)}%" title="${esc(group)}: ${fmtMoney(value, platform)}"></i>`).join('');
    const legend = groups.map(([group, value]) => `<span><i class="${GROUP_CLASS[group] || ''}"></i>${esc(group)} <b>${fmtMoney(value, platform)}</b> <em>${fmtPct(value / k.spend * 100)}</em></span>`).join('');
    return `
      <div class="panel ads-platform-card ${platform}">
        <div class="ads-platform-head">
          <div>${platformPill(platform)}<div class="panel-sub">${esc(state.data.platforms[platform].currency)}${data.account ? ` | ${esc(data.account)}` : ''} | ${data.campaigns.length} campanas</div></div>
          <div class="ads-platform-spend"><span>Inversion</span><strong>${fmtMoney(k.spend, platform)}</strong></div>
        </div>
        <div class="ads-platform-metrics">${metrics.map(([name, value, hint]) => `<div><span>${name}</span><strong>${value}</strong><small>${hint}</small></div>`).join('')}</div>
        <div class="ads-split"><div class="ads-split-bar">${bar}</div><div class="ads-split-legend">${legend}</div></div>
      </div>`;
  }
  function adsDetail(platform, campaign) {
    const ads = campaign.topAds || [];
    if (!ads.length) return '<span class="no-data">Sin detalle por anuncio</span>';
    const cols = platform === 'tiktok' ? (campaign.group === 'Mensajes' ? ['clicks', 'views'] : ['views', 'clicks']) : ['clicks', 'reach'];
    const names = { views: 'Visual.', clicks: 'Clics', reach: 'Alcance' };
    const truncated = ads.some(ad => ad.truncated);
    return `<table class="ads-top-table"><thead><tr><th>Anuncio</th>${cols.map(col => `<th class="num">${names[col]}</th>`).join('')}<th class="num">Inversion</th>${platform === 'meta' ? '<th></th>' : ''}</tr></thead><tbody>${ads.map(ad => `
      <tr><td>${esc(ad.name)}${ad.truncated && ad.name.length >= 36 ? '…' : ''}</td>${cols.map(col => `<td class="num">${isNum(ad[col]) ? fmtCount(ad[col]) : '-'}</td>`).join('')}<td class="num">${fmtMoney(ad.spend, platform)}</td>${platform === 'meta' ? `<td>${safeUrl(ad.url) ? `<a href="${safeUrl(ad.url)}" target="_blank" rel="noopener">Ver anuncio</a>` : ''}</td>` : ''}</tr>`).join('')}</tbody></table>${truncated ? '<small class="no-data">Nombres tomados del reporte PDF (recortados).</small>' : ''}`;
  }
  function renderCampaigns(month) {
    const platforms = PLATFORM_ORDER.filter(platform => month.platforms[platform] && (state.platform === 'all' || state.platform === platform));
    const rows = platforms.flatMap(platform => month.platforms[platform].campaigns.map((campaign, index) => ({ platform, campaign, key: `${platform}:${index}`, total: month.platforms[platform].kpis.spend })));
    const count = PLATFORM_ORDER.reduce((sum, platform) => sum + (month.platforms[platform]?.campaigns.length || 0), 0);
    document.getElementById('campaigns-title').textContent = `Campanas de ${month.name} 2026`;
    document.getElementById('campaigns-sub').textContent = `${count} campanas con inversion. Despliega cada fila para ver los mejores anuncios.`;
    document.querySelectorAll('#campaigns-filter .series-toggle').forEach(item => item.classList.toggle('active', item.dataset.series === state.platform));
    const body = document.getElementById('campaigns-body');
    if (!rows.length) { body.innerHTML = '<tr><td colspan="13" class="table-empty">Sin campanas para esta plataforma en el mes.</td></tr>'; return; }
    body.innerHTML = rows.map(({ platform, campaign, key, total }) => {
      const result = mainResult(platform, campaign);
      const cpm = campaign.cpm ?? (campaign.impressions ? campaign.spend / campaign.impressions * 1000 : null);
      const cpc = campaign.cpc ?? (campaign.clicks ? campaign.spend / campaign.clicks : null);
      const open = state.open.has(key);
      const hasAds = (campaign.topAds || []).length > 0;
      return `
        <tr class="ads-campaign-row ${open ? 'open' : ''}">
          <td>${platformPill(platform)}</td>
          <td class="campaign-name">${esc(campaign.name)}</td>
          <td>${groupPill(campaign.group)}</td>
          <td class="date-col">${esc(campaign.country)}</td>
          <td class="num"><b>${fmtMoney(campaign.spend, platform)}</b></td>
          <td class="num">${fmtPct(total ? campaign.spend / total * 100 : null)}</td>
          <td class="num">${fmtCount(result.value)} <small class="result-label">${result.label}</small></td>
          <td class="num">${fmtCount(campaign.impressions)}</td>
          <td class="num">${fmtMoney(cpm, platform)}</td>
          <td class="num">${fmtCount(campaign.clicks)}</td>
          <td class="num">${fmtCost(cpc, platform)}</td>
          <td class="num">${platform === 'tiktok' ? fmtCount(campaign.followers) : '-'}</td>
          <td>${hasAds ? `<button type="button" class="ads-expand" data-key="${key}" aria-expanded="${open}">${open ? 'Ocultar' : `Ver ${campaign.topAds.length}`}</button>` : '<span class="no-data">-</span>'}</td>
        </tr>
        ${open ? `<tr class="ads-detail-row"><td></td><td colspan="12">${adsDetail(platform, campaign)}</td></tr>` : ''}`;
    }).join('');
  }
  function renderChecks(month) {
    const names = { spend: 'Inversion', views: 'Visualizaciones', followers: 'Seguidores', clicks: 'Clics', messageClicks: 'Clics a mensajes', interactions: 'Interacciones' };
    const checks = month.checks || [];
    const reportName = month.report ? `${month.report.title} (${month.report.period})` : 'sin reporte';
    document.getElementById('checks-sub').textContent = checks.length
      ? `Totales calculados desde las exportaciones contra el resumen de ${reportName}.`
      : 'Este mes no tiene reporte con el que cruzar los datos.';
    const body = document.getElementById('checks-body');
    if (!checks.length) { body.innerHTML = '<tr><td colspan="6" class="table-empty">Sin controles para este mes.</td></tr>'; return; }
    body.innerHTML = checks.map(check => {
      const money = check.metric === 'spend';
      const value = v => money ? fmtMoney(v, check.platform) : fmtCount(v);
      return `<tr>
        <td>${platformPill(check.platform)}</td>
        <td>${names[check.metric] || esc(check.metric)}${check.scope ? `<small class="result-label"> ${esc(check.scope)}</small>` : ''}</td>
        <td class="num">${value(check.data)}</td>
        <td class="num">${value(check.report)}</td>
        <td class="num">${money ? fmtMoney(check.diff, check.platform) : fmtCount(check.diff)}</td>
        <td><span class="status-pill ${check.ok ? 'green' : 'red'}">${check.ok ? 'Cuadra' : 'Revisar'}</span></td>
      </tr>`;
    }).join('');
  }
  function renderMonth() {
    const month = monthData(state.month);
    renderMonthBar(month);
    document.getElementById('ads-platforms').innerHTML = PLATFORM_ORDER.map(platform => platformCard(month, platform)).join('');
    renderCampaigns(month);
    renderChecks(month);
  }

  // ── Historico (meses cerrados) ─────────────────────────────────────────────
  function renderHistory() {
    const body = document.getElementById('history-body');
    if (!body || !state.data) return;
    const rows = state.data.months.filter(month => month.status === 'cerrado').reverse().flatMap(month => PLATFORM_ORDER.flatMap(platform => (month.platforms[platform]?.campaigns || []).map(campaign => ({ month, platform, campaign }))));
    const totals = yearTotals();
    const closed = state.data.months.filter(month => month.status === 'cerrado');
    const closedSpend = platform => closed.reduce((sum, month) => sum + Number(month.platforms[platform]?.kpis.spend || 0), 0);
    const kpis = document.getElementById('history-kpis');
    if (kpis) {
      kpis.innerHTML = [
        ['Campañas', fmtCount(rows.length), `${closed.length} meses cerrados`],
        ['Inversión TikTok', fmtMoney(closedSpend('tiktok'), 'tiktok'), 'Meses cerrados'],
        ['Inversión Meta', fmtMoney(closedSpend('meta'), 'meta'), 'Meses cerrados'],
        ['Seguidores TikTok', fmtCount(totals.tiktok.followers), 'Acumulado 2026'],
        ['Clics a mensajes', fmtCount(totals.tiktok.messageClicks + totals.meta.messageClicks), 'Acumulado 2026'],
      ].map(([name, value, meta]) => `<div class="kpi-pill"><span>${name}</span><strong>${value}</strong><small>${meta}</small></div>`).join('');
    }
    const sub = document.getElementById('history-sub');
    if (sub) sub.textContent = rows.length ? `${rows.length} campañas de ${closed.length} meses cerrados. El mes en curso se ve en Gasto publicitario.` : 'Sin meses cerrados.';
    if (!rows.length) { body.innerHTML = '<tr><td colspan="10" class="table-empty">Sin campañas en meses cerrados.</td></tr>'; return; }
    body.innerHTML = rows.map(({ month, platform, campaign }) => {
      const result = mainResult(platform, campaign);
      const ads = (campaign.topAds || []).slice(0, 3);
      return `<tr>
        <td class="date-col">${esc(month.name)}</td>
        <td>${platformPill(platform)}</td>
        <td class="campaign-name">${esc(campaign.name)}</td>
        <td>${groupPill(campaign.group)}</td>
        <td class="date-col">${esc(campaign.country)}</td>
        <td class="num">${fmtMoney(campaign.spend, platform)}</td>
        <td class="num">${fmtCount(result.value)} <small class="result-label">${result.label}</small></td>
        <td class="num">${fmtCount(campaign.clicks)}</td>
        <td>${ads.length ? ads.map(ad => safeUrl(ad.url) ? `<a class="history-ad-link" href="${safeUrl(ad.url)}" target="_blank" rel="noopener">${esc(ad.name)}</a>` : `<span class="history-ad-muted">${esc(ad.name)}</span>`).join('') : '-'}</td>
        <td class="date-col">${esc(month.period || '-')}</td>
      </tr>`;
    }).join('');
  }

  function renderAll() {
    renderKpis();
    applyChartCollapsed();
    renderChart();
    renderTabs();
    renderMonth();
    renderHistory();
    window.dispatchEvent(new CustomEvent('rk:data-updated'));
  }
  function wireEvents() {
    document.getElementById('chart-series-toggles').addEventListener('change', event => {
      const input = event.target.closest('input[type="radio"]');
      if (!input) return;
      state.metric = input.value;
      savePref(CHART_METRIC_KEY, state.metric);
      renderChart();
    });
    document.getElementById('chart-toggle-btn').addEventListener('click', () => {
      state.chartCollapsed = !state.chartCollapsed;
      savePref(CHART_COLLAPSED_KEY, state.chartCollapsed);
      applyChartCollapsed();
      if (!state.chartCollapsed) renderChart();
    });
    document.getElementById('month-tabs').addEventListener('click', event => {
      const tab = event.target.closest('.month-tab:not(:disabled)');
      if (tab) selectMonth(tab.dataset.month);
    });
    document.getElementById('campaigns-filter').addEventListener('change', event => {
      const input = event.target.closest('input[type="radio"]');
      if (!input) return;
      state.platform = input.value;
      renderCampaigns(monthData(state.month));
    });
    document.getElementById('campaigns-body').addEventListener('click', event => {
      const button = event.target.closest('.ads-expand');
      if (!button) return;
      const key = button.dataset.key;
      if (state.open.has(key)) state.open.delete(key); else state.open.add(key);
      renderCampaigns(monthData(state.month));
    });
  }
  async function init() {
    try {
      if (window.RK_ADS_DATA) state.data = window.RK_ADS_DATA;
      else {
        const response = await fetch(DATA_URL, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        state.data = await response.json();
      }
      const withData = state.data.months.filter(hasData);
      if (!withData.length) throw new Error('Sin meses con datos');
      state.month = withData[withData.length - 1].name;
      wireEvents();
      renderAll();
    } catch (error) {
      document.getElementById('view-obj').innerHTML = '<div class="data-notice error"><strong>No se pudo cargar la informacion de Rekluta.</strong></div>';
      console.error(error);
    }
  }
  // Snapshot de solo lectura para Proyecciones. Ese modulo proyecta un unico monto en soles y aqui
  // conviven S/. y US$ sin tipo de cambio, asi que se entrega sin gasto consolidado hasta adaptarlo.
  function snapshot() {
    if (!state.data) return null;
    return {
      cutoff: state.data.cutoff,
      source: state.data.source,
      year: state.data.year,
      lastSync: null,
      months: state.data.months.map(month => ({ name: month.name, spend: 0, messages: null, reservations: null, campaigns: [], platforms: JSON.parse(JSON.stringify(month.platforms)) })),
    };
  }
  window.RKObjectives = { renderHistory, snapshot };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
