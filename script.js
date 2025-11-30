/* ===========
   script.js
   VERCEL-FRIENDLY FRONTEND
   All API calls go to /api/* (Vercel serverless functions)
   Replace existing script.js with this file.
   =========== */

/* ---------- Utilities ---------- */
async function fetchJSON(url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      const text = await res.text().catch(()=>"");
      throw new Error(`Fetch ${url} failed: ${res.status} ${text}`);
    }
    return await res.json();
  } catch (err) {
    console.error("fetchJSON error:", err);
    throw err;
  }
}

function safe(val) { return (val === null || val === undefined) ? "—" : val; }
function numberFmt(n) { return (n === null || n === undefined) ? "—" : (Math.round((n + Number.EPSILON) * 100) / 100).toLocaleString(); }

/* ---------- Top ticker (server-proxied) ---------- */
async function updateTopTicker() {
  try {
    const data = await fetchJSON('/api/ticker'); // expects [{symbol, c, pc, ...}, ...]
    if (!Array.isArray(data) || data.length === 0) {
      document.getElementById('topTicker').textContent = 'No tickers available';
      return;
    }
    const parts = data.map(q => {
      const change = q.pc ? ((q.c - q.pc) / q.pc * 100) : 0;
      const color = change >= 0 ? 'var(--good)' : 'var(--bad)';
      return `<span style="color:${color};margin-right:20px">${q.symbol}: ${numberFmt(q.c)} (${change>=0?'+':''}${change.toFixed(2)}%)</span>`;
    });
    document.getElementById('topTicker').innerHTML = parts.join('');
  } catch (err) {
    console.warn('updateTopTicker error', err);
    document.getElementById('topTicker').textContent = 'Ticker unavailable — check /api/ticker';
  }
}
updateTopTicker();
setInterval(updateTopTicker, 15000);

/* ---------- Watchlist UI ---------- */
let watchlist = [];
function renderWatchlist() {
  const el = document.getElementById('watchlist');
  if (!el) return;
  if (!watchlist.length) { el.innerHTML = '<div class="meta-block">Empty — add tickers with + Watch</div>'; return; }
  el.innerHTML = '';
  watchlist.forEach(t => {
    const div = document.createElement('div'); div.className = 'mover';
    div.innerHTML = `<div>${t}</div><div><button onclick="loadSymbol('${t}')">Open</button> <button onclick="removeWatch('${t}')">x</button></div>`;
    el.appendChild(div);
  });
}
function addWatch(t) { if (!t) return; if (!watchlist.includes(t)) watchlist.push(t.toUpperCase()); renderWatchlist(); }
function removeWatch(t) { watchlist = watchlist.filter(x => x !== t); renderWatchlist(); }

/* ---------- DOM ready: attach handlers ---------- */
document.addEventListener('DOMContentLoaded', () => {
  // safe guards if elements missing
  const loadBtn = document.getElementById('loadBtn');
  const watchBtn = document.getElementById('watchBtn');
  const symbolInput = document.getElementById('symbolInput');

  if (loadBtn) loadBtn.addEventListener('click', loadSymbolFromInput);
  if (watchBtn) watchBtn.addEventListener('click', () => {
    const s = symbolInput.value.trim();
    if (s) addWatch(s.toUpperCase());
  });
  if (symbolInput) {
    symbolInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') loadSymbolFromInput(); });
  }

  renderWatchlist();

  // default load
  if (symbolInput) symbolInput.value = 'AAPL';
  loadSymbol('AAPL').catch(()=>{ /* ignore initial fail */ });

  // initial movers load
  loadTopMovers().then(arr => {
    const moversEl = document.getElementById('movers');
    if (!moversEl) return;
    moversEl.innerHTML = arr.slice(0, 8).map(m => `<div class="mover"><div>${m.symbol}</div><div style="color:${m.change>=0?'var(--good)':'var(--bad)'}">${numberFmt(m.price)} • ${m.change.toFixed(2)}%</div></div>`).join('');
  }).catch(err => {
    console.warn('initial movers failed', err);
    const moversEl = document.getElementById('movers');
    if (moversEl) moversEl.textContent = 'Loading movers failed — check /api/movers or /api/ticker';
  });
});

/* ---------- Chart setup (Lightweight Charts) ---------- */
let chart, candleSeries, volumeSeries;
function createChart() {
  const container = document.getElementById('chart');
  if (!container) return;
  container.innerHTML = '';
  chart = LightweightCharts.createChart(container, {
    layout: { background: { color: '#081126' }, textColor: '#dfefff' },
    grid: { vertLines: { color: 'rgba(255,255,255,0.03)' }, horzLines: { color: 'rgba(255,255,255,0.02)' } },
    rightPriceScale: { borderColor: 'rgba(255,255,255,0.06)' },
    timeScale: { borderColor: 'rgba(255,255,255,0.06)' }
  });
  candleSeries = chart.addCandlestickSeries();
  volumeSeries = chart.addHistogramSeries({ color: '#2b6bff', priceFormat: { type: 'volume' }, scaleMargins: { top: 0.8, bottom: 0 } });
}
createChart();

/* ---------- Candles (via server) ---------- */
async function loadCandles(symbol, resolution = 'D') {
  try {
    // build from/to on client (server will accept and pass to Finnhub)
    const to = Math.floor(Date.now() / 1000);
    const days = (resolution === '1' ? 2 : resolution === '5' ? 7 : resolution === '15' ? 14 : resolution === '60' ? 60 : 365);
    const from = to - days * 24 * 60 * 60;
    // call server endpoint -- ensure you created /api/candles
    const url = `/api/candles?symbol=${encodeURIComponent(symbol)}&resolution=${encodeURIComponent(resolution)}&from=${from}&to=${to}`;
    const data = await fetchJSON(url);
    // If server returns Finnhub-style data object {t,o,h,l,c,v,s}
    if (data.s && data.s !== 'ok') throw new Error('Candle response error');
    const candles = data.t.map((ts, i) => ({
      time: data.t[i],
      open: data.o[i],
      high: data.h[i],
      low: data.l[i],
      close: data.c[i]
    }));
    candleSeries.setData(candles);
    const volumes = data.t.map((ts, i) => ({ time: data.t[i], value: data.v[i] }));
    volumeSeries.setData(volumes);
    return candles;
  } catch (err) {
    console.warn('loadCandles failed — ensure /api/candles exists and proxies Finnhub', err);
    throw err;
  }
}

/* ---------- Indicators ---------- */
function calcSMAFromCandles(candles, period) {
  if (!candles || candles.length < period) return [];
  const res = [];
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].close;
    res.push({ time: candles[i].time, value: +(sum / period).toFixed(4) });
  }
  return res;
}
function calcEMAFromCandles(candles, period) {
  if (!candles || candles.length < period) return [];
  const res = [];
  const k = 2 / (period + 1);
  let emaPrev = candles.slice(0, period).reduce((a, b) => a + b.close, 0) / period;
  for (let i = period; i < candles.length; i++) {
    const close = candles[i].close;
    const ema = close * k + emaPrev * (1 - k);
    res.push({ time: candles[i].time, value: +ema.toFixed(4) });
    emaPrev = ema;
  }
  return res;
}
function calcRSI(candles, period = 14) {
  if (!candles || candles.length <= period) return [];
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gains += diff; else losses += Math.abs(diff);
  }
  let avgGain = gains / period, avgLoss = losses / period;
  const rsiArr = [];
  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = Math.max(0, diff), loss = Math.max(0, -diff);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    rsiArr.push({ time: candles[i].time, value: +rsi.toFixed(2) });
  }
  return rsiArr;
}
function calcMACD(candles) {
  const ema12 = calcEMAFromCandles(candles, 12);
  const ema26 = calcEMAFromCandles(candles, 26);
  const startIndex = Math.max(0, ema26.length - ema12.length);
  const macd = [];
  for (let i = 0; i < ema12.length && i + startIndex < ema26.length; i++) {
    const a = ema12[i].value, b = ema26[i + startIndex].value;
    macd.push({ time: ema12[i].time, value: +(a - b).toFixed(6) });
  }
  if (macd.length < 9) return { macd, signal: [] };
  const signal = [];
  const k = 2 / (9 + 1);
  let emaPrev = macd.slice(0, 9).reduce((a, b) => a + b.value, 0) / 9;
  for (let i = 9; i < macd.length; i++) {
    const val = macd[i].value;
    const ema = val * k + emaPrev * (1 - k);
    signal.push({ time: macd[i].time, value: +ema.toFixed(6) });
    emaPrev = ema;
  }
  return { macd, signal };
}

/* ---------- Fundamentals, earnings, news, movers (server-proxied) ---------- */
async function loadFundamentals(symbol) {
  try {
    // requires /api/metric?symbol=...
    const url = `/api/metric?symbol=${encodeURIComponent(symbol)}`;
    const data = await fetchJSON(url);
    return data.metric || data;
  } catch (err) {
    console.warn('loadFundamentals failed — check /api/metric', err);
    return null;
  }
}

async function loadEarnings(symbol) {
  try {
    // server can accept symbol or date range
    const url = `/api/earnings?symbol=${encodeURIComponent(symbol)}`;
    const data = await fetchJSON(url);
    return Array.isArray(data) ? data : (data.earnings || []);
  } catch (err) {
    console.warn('loadEarnings failed — check /api/earnings', err);
    return [];
  }
}

async function loadNews(symbol = null) {
  try {
    const url = symbol ? `/api/news?symbol=${encodeURIComponent(symbol)}` : '/api/news';
    const data = await fetchJSON(url);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('loadNews failed — check /api/news', err);
    return [];
  }
}

async function loadTopMovers() {
  try {
    // prefer a dedicated movers endpoint if available
    try {
      const res = await fetchJSON('/api/movers');
      if (Array.isArray(res) && res.length) return res;
    } catch (_) { /* ignore, fallback to /api/ticker */ }

    const tickerData = await fetchJSON('/api/ticker');
    // tickerData expected [{symbol, c, pc, ...}, ...]
    return tickerData.map(q => {
      const change = q.pc ? ((q.c - q.pc) / q.pc * 100) : 0;
      return { symbol: q.symbol, change, price: q.c };
    }).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  } catch (err) {
    console.warn('loadTopMovers failed', err);
    return [];
  }
}

/* ---------- Recommendation logic ---------- */
function simpleRuleRec(current, high52, low52) {
  if (current < low52 * 1.15) return 'BUY';
  if (current > high52 * 0.95) return 'SELL';
  return 'HOLD';
}
function indicatorRec(current, smaShort, smaLong, rsi, macdObj) {
  if (smaShort && smaLong && smaShort.length && smaLong.length) {
    const lastSmaShort = smaShort[smaShort.length - 1].value;
    if (current < lastSmaShort) return 'BUY';
    if (current > lastSmaShort) return 'SELL';
  }
  if (rsi && rsi.length) {
    const lastR = rsi[rsi.length - 1].value;
    if (lastR < 30) return 'BUY';
    if (lastR > 70) return 'SELL';
  }
  if (macdObj && macdObj.macd.length && macdObj.signal.length) {
    const lastMacd = macdObj.macd[macdObj.macd.length - 1].value;
    const lastSignal = macdObj.signal[macdObj.signal.length - 1].value;
    if (lastMacd > lastSignal) return 'BUY';
    if (lastMacd < lastSignal) return 'SELL';
  }
  return 'HOLD';
}

/* ---------- Main: loadSymbol (uses server endpoints) ---------- */
let lastCandles = null;
async function loadSymbol(symbol) {
  try {
    symbol = symbol.trim().toUpperCase();
    document.getElementById('chartTitle').innerText = symbol + ' • Chart';
    document.getElementById('quoteTitle').innerText = symbol + ' • Quote';
    const res = document.getElementById('resolutionSelect') ? document.getElementById('resolutionSelect').value : 'D';

    // 1) Quote via server
    const quote = await fetchJSON(`/api/quote?symbol=${encodeURIComponent(symbol)}`);

    // 2) Candles via server (must create /api/candles)
    const candles = await loadCandles(symbol, res);
    lastCandles = candles;

    // 3) indicators
    const sma5 = calcSMAFromCandles(candles, 5);
    const sma20 = calcSMAFromCandles(candles, 20);
    const ema12 = calcEMAFromCandles(candles, 12);
    const rsi14 = calcRSI(candles, 14);
    const macdObj = calcMACD(candles);

    // 4) plot overlays (SMA/EMA) - remove old then add new
    if (window.smaSeries) chart.removeSeries(window.smaSeries);
    window.smaSeries = chart.addLineSeries({ color: '#ffb86b', lineWidth: 1 });
    window.smaSeries.setData(sma5.map(p => ({ time: p.time, value: p.value })));

    if (window.emaSeries) chart.removeSeries(window.emaSeries);
    window.emaSeries = chart.addLineSeries({ color: '#7ee7a6', lineWidth: 1 });
    window.emaSeries.setData(ema12.map(p => ({ time: p.time, value: p.value })));

    // 5) Quote box
    const qBox = document.getElementById('quoteBox');
    qBox.innerHTML = `
      <div class="big">${numberFmt(quote.c)}</div>
      <div>Change: ${(quote.pc ? ((quote.c - quote.pc).toFixed(2)) : '—')} (${quote.pc ? ((((quote.c - quote.pc) / quote.pc) * 100).toFixed(2) + '%') : '—'})</div>
      <div>Open: ${safe(quote.o)} • High: ${safe(quote.h)} • Low: ${safe(quote.l)}</div>
      <div>Volume: ${safe(quote.v)}</div>
    `;

    // 6) fundamentals (server)
    const fundamentals = await loadFundamentals(symbol);
    const fundBox = document.getElementById('fundamentals');
    if (fundamentals) {
      fundBox.innerHTML = `
        P/E: ${safe(fundamentals.peNormalized)} • Market Cap: ${safe(fundamentals.marketCapitalization)}<br>
        EPS (ttm): ${safe(fundamentals.epsBasic)} • Beta: ${safe(fundamentals.beta)}
      `;
    } else fundBox.innerHTML = '<div class="muted">No fundamentals</div>';

    // 7) earnings (server)
    const earn = await loadEarnings(symbol);
    const earnBox = document.getElementById('earnings');
    earnBox.innerHTML = earn.length ? earn.map(e => `<div>${e.symbol} • ${e.period} • ${e.time}</div>`).join('') : '<div class="muted">No upcoming earnings found</div>';

    // 8) news (server)
    const news = await loadNews(symbol);
    const newsBox = document.getElementById('newsFeed');
    newsBox.innerHTML = news.map(n => `<div class="newsItem"><strong><a href="${n.url}" target="_blank" rel="noreferrer">${n.headline}</a></strong><div style="font-size:0.85rem;color:var(--muted)">${n.source} • ${n.datetime ? new Date(n.datetime*1000).toLocaleString() : ''}</div></div>`).join('');

    // 9) movers (server)
    const movers = await loadTopMovers();
    document.getElementById('movers').innerHTML = movers.slice(0, 8).map(m => `<div class="mover"><div>${m.symbol}</div><div style="color:${m.change>=0?'var(--good)':'var(--bad)'}">${numberFmt(m.price)} • ${m.change.toFixed(2)}%</div></div>`).join('');

    // 10) recommendation
    const rule = simpleRuleRec(quote.c, quote.h, quote.l);
    const ind = indicatorRec(quote.c, sma5, sma20, rsi14, macdObj);
    let finalRec = (rule === 'HOLD') ? ind : rule;
    const recBox = document.getElementById('recBox');
    const color = finalRec === 'BUY' ? 'var(--good)' : finalRec === 'SELL' ? 'var(--bad)' : 'var(--hold)';
    if (recBox) {
      recBox.style.background = '#071229';
      recBox.style.color = color;
      recBox.innerHTML = finalRec;
    }

  } catch (err) {
    console.error('loadSymbol error', err);
    alert('Failed to load symbol. Check your Vercel /api endpoints and console for details.');
  }
}

/* helper to load from input */
async function loadSymbolFromInput() {
  const el = document.getElementById('symbolInput');
  if (!el) return;
  const s = el.value.trim();
  if (s) await loadSymbol(s);
}

/* ---------- Small utility: loadTopMovers on interval ---------- */
setInterval(() => {
  loadTopMovers().then(arr => {
    const moversEl = document.getElementById('movers');
    if (!moversEl) return;
    moversEl.innerHTML = arr.slice(0, 8).map(m => `<div class="mover"><div>${m.symbol}</div><div style="color:${m.change>=0?'var(--good)':'var(--bad)'}">${numberFmt(m.price)} • ${m.change.toFixed(2)}%</div></div>`).join('');
  }).catch(e => { console.warn('periodic movers update failed', e); });
}, 30000);
