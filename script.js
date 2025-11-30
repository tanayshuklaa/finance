/* ================================
   TRADER DASH — FULL REAL VERSION
   Real Candles, Indicators, Ticker,
   SMA, EMA, RSI, MACD, Volume
================================ */

// ------------------------------
// Utility
// ------------------------------
async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Fetch error");
    return res.json();
}

function fmt(n) {
    return n ? Number(n).toFixed(2) : "—";
}


// ------------------------------
// LIVE TICKER
// ------------------------------
async function loadTicker() {
    try {
        const data = await fetchJSON("/api/ticker");
        let html = "";

        data.forEach(d => {
            const change = ((d.c - d.pc) / d.pc) * 100;
            const arrow = change >= 0 ? "▲" : "▼";
            const color = change >= 0 ? "#4caf50" : "#ff5252";
            html += `<span style="margin-right:20px;color:${color}">
                        ${d.symbol}: $${fmt(d.c)} ${arrow} ${fmt(change)}%
                     </span>`;
        });

        document.getElementById("liveTicker").innerHTML = html;

    } catch (e) {
        document.getElementById("liveTicker").innerHTML = "Error loading ticker data";
    }
}
loadTicker();
setInterval(loadTicker, 15000);


// ------------------------------
// GLOBAL VARIABLES
// ------------------------------
let chart;
let candleSeries;
let volumeSeries;
let sma5Series;
let sma20Series;
let ema12Series;
let rsiSeries;
let macdSeries;
let signalSeries;


// ------------------------------
// INIT CHART
// ------------------------------
function initChart() {
    const container = document.getElementById("chart");
    container.innerHTML = "";

    chart = LightweightCharts.createChart(container, {
        layout: { background: { color: "#081126" }, textColor: "#dfefff" },
        width: container.clientWidth,
        height: 400
    });

    candleSeries = chart.addCandlestickSeries();
    volumeSeries = chart.addHistogramSeries({
        color: "#2b6bff",
        priceFormat: { type: "volume" },
        scaleMargins: { top: 0.8, bottom: 0 }
    });
}


// ------------------------------
// INDICATORS
// ------------------------------
function SMA(values, period) {
    const result = [];
    for (let i = period - 1; i < values.length; i++) {
        let sum = 0;
        for (let j = i - period + 1; j <= i; j++) sum += values[j].close;
        result.push({ time: values[i].time, value: sum / period });
    }
    return result;
}

function EMA(values, period) {
    const result = [];
    const k = 2 / (period + 1);

    let emaPrev = values.slice(0, period).reduce((a, b) => a + b.close, 0) / period;

    for (let i = period; i < values.length; i++) {
        const close = values[i].close;
        const ema = close * k + emaPrev * (1 - k);
        result.push({ time: values[i].time, value: ema });
        emaPrev = ema;
    }

    return result;
}

function RSI(values, period = 14) {
    if (values.length <= period) return [];

    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = values[i].close - values[i - 1].close;
        if (diff >= 0) gains += diff;
        else losses += -diff;
    }

    let avgGain = gains / period, avgLoss = losses / period;
    const rsi = [];

    for (let i = period + 1; i < values.length; i++) {
        const diff = values[i].close - values[i - 1].close;
        const gain = Math.max(diff, 0);
        const loss = Math.max(-diff, 0);

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;

        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        const rsiValue = 100 - 100 / (1 + rs);

        rsi.push({ time: values[i].time, value: rsiValue });
    }

    return rsi;
}

function MACD(values) {
    const ema12 = EMA(values, 12);
    const ema26 = EMA(values, 26);

    const macd = [];
    for (let i = 0; i < ema26.length; i++) {
        macd.push({
            time: ema26[i].time,
            value: ema12[i + (ema12.length - ema26.length)].value - ema26[i].value
        });
    }

    const signal = EMA(macd.map(m => ({ close: m.value })), 9)
        .map((s, i) => ({ time: macd[i + (macd.length - signal.length)].time, value: s.value }));

    return { macd, signal };
}


// ------------------------------
// LOAD CANDLES + INDICATORS
// ------------------------------
async function loadCandles(symbol, resolution = "D") {
    const now = Math.floor(Date.now() / 1000);
    const from = now - 60 * 60 * 24 * 365;

    const data = await fetchJSON(
        `/api/candles?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${now}`
    );

    const candles = data.t.map((t, i) => ({
        time: t,
        open: data.o[i],
        high: data.h[i],
        low: data.l[i],
        close: data.c[i],
        volume: data.v[i]
    }));

    candleSeries.setData(candles);

    volumeSeries.setData(
        candles.map(c => ({ time: c.time, value: c.volume }))
    );

    // Indicators
    const sma5 = SMA(candles, 5);
    const sma20 = SMA(candles, 20);
    const ema12 = EMA(candles, 12);
    const rsi14 = RSI(candles, 14);
    const macd = MACD(candles);

    // Draw on chart
    sma5Series = chart.addLineSeries({ color: "#ffb86b" });
    sma5Series.setData(sma5);

    sma20Series = chart.addLineSeries({ color: "#ff6bd1" });
    sma20Series.setData(sma20);

    ema12Series = chart.addLineSeries({ color: "#7ee7a6" });
    ema12Series.setData(ema12);

    // MACD
    macdSeries = chart.addHistogramSeries({ color: "#2b6bff" });
    macdSeries.setData(macd.macd);

    signalSeries = chart.addLineSeries({ color: "#ffa600" });
    signalSeries.setData(macd.signal);

    return candles;
}


// ------------------------------
// QUOTE + NEWS + CHART LOAD
// ------------------------------
async function loadStock(symbol) {
    if (!symbol) return;

    // Quote
    const quote = await fetchJSON(`/api/quote?symbol=${symbol}`);
    document.getElementById("quoteBox").innerHTML = `
        <div style="font-size:32px;">$${fmt(quote.c)}</div>
        <div>Open: ${fmt(quote.o)} | High: ${fmt(quote.h)} | Low: ${fmt(quote.l)}</div>
        <div>Prev Close: ${fmt(quote.pc)} | Volume: ${fmt(quote.v)}</div>
    `;

    // News
    const news = await fetchJSON(`/api/news`);
    document.getElementById("newsFeed").innerHTML = news.slice(0, 8).map(n =>
        `<div style="margin-bottom:12px"><strong>${n.headline}</strong><br><small>${n.source}</small></div>`
    ).join("");

    // Chart
    loadCandles(symbol, "D");
}


// ------------------------------
// UI
// ------------------------------
document.getElementById("loadBtn").onclick = () => {
    const symbol = document.getElementById("symbolInput").value.toUpperCase();
    initChart();
    loadStock(symbol);
};

// Default load
initChart();
loadStock("AAPL");
