/* ======================================
   Trader Dash Frontend
   - Uses ONLY /api/* endpoints (Vercel)
   - Real candles + SMA20, EMA12, RSI14, MACD
   - Rate limiting + no direct Finnhub calls
====================================== */

function fmt(n, digits = 2) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return Number(n).toFixed(digits);
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch ${url} failed: ${res.status}`);
  return res.json();
}

/* ---------- Live Ticker (20s refresh) ---------- */
async function loadTicker() {
  try {
    const data = await fetchJSON("/api/ticker");
    const el = document.getElementById("liveTicker");
    let text = "";

    data.forEach((d) => {
      if (!d || d.c === undefined || d.pc === 0) return;
      const changePct = ((d.c - d.pc) / d.pc) * 100;
      const arrow = changePct >= 0 ? "▲" : "▼";
      const color = changePct >= 0 ? "#4caf50" : "#ff5252";

      text += `<span style="margin-right:20px;color:${color}">
        ${d.symbol}: $${fmt(d.c)} ${arrow} ${fmt(changePct)}%
      </span>`;
    });

    el.innerHTML = text || "No ticker data.";
  } catch (err) {
    console.error("ticker error:", err);
    document.getElementById("liveTicker").innerHTML = "Error loading tickers";
  }
}
loadTicker();
setInterval(loadTicker, 20000); // 20s – gentle on rate limits

/* ---------- Chart setup ---------- */
let chart, candleSeries, volumeSeries, smaSeries, emaSeries;

function initChart() {
  const container = document.getElementById("chart");
  container.innerHTML = "";
  chart = LightweightCharts.createChart(container, {
    layout: { background: { color: "#081126" }, textColor: "#dfefff" },
    grid: {
      vertLines: { color: "rgba(255,255,255,0.04)" },
      horzLines: { color: "rgba(255,255,255,0.04)" }
    },
    rightPriceScale: { borderColor: "rgba(255,255,255,0.2)" },
    timeScale: { borderColor: "rgba(255,255,255,0.2)" }
  });
  candleSeries = chart.addCandlestickSeries();
  volumeSeries = chart.addHistogramSeries({
    color: "#2b6bff",
    priceFormat: { type: "volume" },
    priceScaleId: "",
    scaleMargins: { top: 0.8, bottom: 0 }
  });
}

/* ---------- Indicator calculations (client-side) ---------- */
function calcSMA(candles, period) {
  if (!candles || candles.length < period) return [];
  const out = [];
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].close;
    out.push({ time: candles[i].time, value: sum / period });
  }
  return out;
}

function calcEMA(candles, period) {
  if (!candles || candles.length < period) return [];
  const k = 2 / (period + 1);
  const out = [];
  let emaPrev =
    candles.slice(0, period).reduce((a, c) => a + c.close, 0) / period;
  for (let i = period; i < candles.length; i++) {
    const close = candles[i].close;
    const ema = close * k + emaPrev * (1 - k);
    emaPrev = ema;
    out.push({ time: candles[i].time, value: ema });
  }
  return out;
}

function calcRSI(candles, period = 14) {
  if (!candles || candles.length <= period) return [];
  let gains = 0,
    losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses += -diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  const out = [];
  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = Math.max(diff, 0);
    const loss = Math.max(-diff, 0);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);
    out.push({ time: candles[i].time, value: rsi });
  }
  return out;
}

function calcMACD(candles) {
  const ema12 = calcEMA(candles, 12);
  const ema26 = calcEMA(candles, 26);
  if (!ema12.length || !ema26.length) return { macd: [], signal: [] };

  // align by time
  const macd = [];
  const offset = ema12.length - ema26.length;
  for (let i = 0; i < ema26.length; i++) {
    macd.push({
      time: ema26[i].time,
      value: ema12[i + offset].value - ema26[i].value
    });
  }
  const macdForEMA = macd.map((m) => ({ close: m.value }));
  const signalArr = calcEMA(
    macdForEMA.map((c, i) => ({ time: macd[i].time, close: c.close })),
    9
  );
  const signal = signalArr.map((s) => ({
    time: s.time,
    value: s.value
  }));

  return { macd, signal };
}

/* ---------- Load candles via API (ONE call per load) ---------- */
async function getCandles(symbol, resolution) {
  const now = Math.floor(Date.now() / 1000);
  const daysBack =
    resolution === "60" ? 60 : resolution === "15" ? 20 : resolution === "5" ? 7 : 365;
  const from = now - daysBack * 24 * 60 * 60;

  const data = await fetchJSON(
    `/api/candles?symbol=${encodeURIComponent(
      symbol
    )}&resolution=${resolution}&from=${from}&to=${now}`
  );

  const candles = data.t.map((t, i) => ({
    time: data.t[i],
    open: data.o[i],
    high: data.h[i],
    low: data.l[i],
    close: data.c[i],
    volume: data.v[i]
  }));
  return candles;
}

/* ---------- Load stock (quote + candles + indicators + news) ---------- */
let lastSymbol = null;
let lastLoadTime = 0;

async function loadStock(symbol) {
  symbol = symbol.trim().toUpperCase();
  if (!symbol) return;

  const now = Date.now();
  // basic throttle: don't reload same symbol more than once in 5 seconds
  if (symbol === lastSymbol && now - lastLoadTime < 5000) return;
  lastSymbol = symbol;
  lastLoadTime = now;

  document.getElementById("chartTitle").innerText = `${symbol} • Chart`;
  document.getElementById("quoteBox").innerText = "Loading...";
  document.getElementById("indicatorBox").innerText = "Loading...";
  document.getElementById("newsFeed").innerText = "Loading...";

  const resolution = document.getElementById("timeframe").value || "D";

  try {
    const [quote, candles] = await Promise.all([
      fetchJSON(`/api/quote?symbol=${encodeURIComponent(symbol)}`),
      getCandles(symbol, resolution)
    ]);

    /* Quote box */
    document.getElementById("quoteBox").innerHTML = `
      <div style="font-size:1.6rem;font-weight:700;margin-bottom:4px;">
        $${fmt(quote.c)}
      </div>
      <div>Open: ${fmt(quote.o)} • High: ${fmt(quote.h)} • Low: ${fmt(
      quote.l
    )}</div>
      <div>Prev close: ${fmt(quote.pc)} • Volume: ${fmt(quote.v, 0)}</div>
    `;

    /* Candles & volume */
    candleSeries.setData(candles);
    volumeSeries.setData(
      candles.map((c) => ({ time: c.time, value: c.volume }))
    );

    /* Indicators (client-side only, no extra API) */
    const sma20 = calcSMA(candles, 20);
    const ema12 = calcEMA(candles, 12);
    const rsi14 = calcRSI(candles, 14);
    const { macd, signal } = calcMACD(candles);

    if (smaSeries) chart.removeSeries(smaSeries);
    if (emaSeries) chart.removeSeries(emaSeries);

    smaSeries = chart.addLineSeries({ color: "#ffb86b", lineWidth: 1 });
    smaSeries.setData(sma20);

    emaSeries = chart.addLineSeries({ color: "#7ee7a6", lineWidth: 1 });
    emaSeries.setData(ema12);

    const latestRSI = rsi14.length ? rsi14[rsi14.length - 1].value : null;
    const latestMACD = macd.length ? macd[macd.length - 1].value : null;
    const latestSignal = signal.length ? signal[signal.length - 1].value : null;

    document.getElementById("indicatorBox").innerHTML = `
      <div>SMA 20: ${sma20.length ? fmt(sma20[sma20.length - 1].value) : "—"}</div>
      <div>EMA 12: ${ema12.length ? fmt(ema12[ema12.length - 1].value) : "—"}</div>
      <div>RSI 14: ${latestRSI ? fmt(latestRSI) : "—"}</div>
      <div>MACD: ${latestMACD ? fmt(latestMACD, 4) : "—"} • Signal: ${
      latestSignal ? fmt(latestSignal, 4) : "—"
    }</div>
    `;

    /* News (general) – cached for 5 min on server */
    const news = await fetchJSON("/api/news");
    document.getElementById("newsFeed").innerHTML = news
      .slice(0, 8)
      .map(
        (n) => `
        <div class="news-item">
          <strong>${n.headline}</strong><br>
          <small>${n.source}</small>
        </div>`
      )
      .join("");
  } catch (err) {
    console.error("loadStock error:", err);
    document.getElementById("quoteBox").innerText = "Failed to load data.";
  }
}

/* ---------- UI wiring ---------- */
document.addEventListener("DOMContentLoaded", () => {
  initChart();

  const loadBtn = document.getElementById("loadBtn");
  const symbolInput = document.getElementById("symbolInput");
  const timeframe = document.getElementById("timeframe");

  loadBtn.addEventListener("click", () =>
    loadStock(symbolInput.value || "AAPL")
  );
  symbolInput.addEventListener("keyup", (e) => {
    if (e.key === "Enter") loadStock(symbolInput.value || "AAPL");
  });
  timeframe.addEventListener("change", () =>
    loadStock(symbolInput.value || "AAPL")
  );

  symbolInput.value = "AAPL";
  loadStock("AAPL");
});
