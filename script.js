function analyzeStock() {
    let current = parseFloat(document.getElementById("currentPrice").value);
    let high52 = parseFloat(document.getElementById("high52").value);
    let low52 = parseFloat(document.getElementById("low52").value);
    let past = document.getElementById("pastPrices").value;

    let resultBox = document.getElementById("result");
    resultBox.style.display = "block";

    if (!current || !high52 || !low52) {
        resultBox.innerHTML = "❗ Please fill in all required fields.";
        resultBox.style.background = "#3a1a1a";
        return;
    }

    // Basic Rule-Based Logic
    if (current < low52 * 1.15) {
        return showResult("BUY", "#0f7b32");
    }
    if (current > high52 * 0.95) {
        return showResult("SELL", "#b81f1f");
    }

    // SMA Logic (Optional)
    if (past.length > 0) {
        let numbers = past.split(",").map(n => parseFloat(n.trim()));
        if (numbers.length > 1) {
            let sma = numbers.reduce((a, b) => a + b, 0) / numbers.length;

            if (current < sma) return showResult("BUY", "#0f7b32");
            if (current > sma) return showResult("SELL", "#b81f1f");
        }
    }

    return showResult("HOLD", "#c4a000");

    function showResult(text, color) {
        resultBox.innerHTML = text;
        resultBox.style.background = color;
    }
}

/**********************
 * Configuration
 **********************/
const DIRECT_CLIENT_MODE = false; // set true to test quickly (exposes API key in client)
const FINNHUB_API_KEY = "<REPLACE_WITH_YOUR_KEY_IF_DIRECT_CLIENT_MODE>"; // only for direct mode

// If using Netlify Function proxy use endpoint below:
const PROXY_BASE = "/.netlify/functions/finnhub-proxy"; // recommended for production (Netlify Functions)

/**********************
 * App State
 **********************/
const watchlist = ["AAPL","MSFT","TSLA","GOOGL"]; // default tickers
const tickerData = {}; // stores latest price + sma + recommendation

/**********************
 * Helpers: SMA & Signal
 **********************/
function calcSMA(values) {
  if (!values || values.length === 0) return null;
  const sum = values.reduce((a,b)=>a+b,0);
  return sum / values.length;
}

function signalForTicker(current, high52, low52, sma) {
  // priority rules similar to your earlier logic
  if (current < low52 * 1.15) return "BUY";
  if (current > high52 * 0.95) return "SELL";
  if (sma !== null) {
    if (current < sma) return "BUY";
    if (current > sma) return "SELL";
  }
  return "HOLD";
}

/**********************
 * UI Utilities
 **********************/
function createTickerItem(t, price, change, rec) {
  const span = document.createElement("span");
  span.className = "ticker-item";
  span.innerText = `${t} ${price === null ? "" : price.toFixed(2)} ${change ? (change>0? "↑":"↓") + Math.abs(change).toFixed(2) : ""} [${rec}]`;
  return span;
}

function updateTickerUI() {
  const container = document.getElementById("tickerList");
  container.innerHTML = "";
  for (const t of watchlist) {
    const info = tickerData[t];
    const price = info?.c ?? null;
    const change = info?.d ?? null;
    const rec = info?.rec ?? "—";
    container.appendChild(createTickerItem(t, price, change, rec));
  }
}

function updateTopMoversUI(movers) {
  const ul = document.getElementById("topMovers");
  ul.innerHTML = "";
  (movers || []).slice(0,6).forEach(m=> {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${m.symbol}</strong> ${m.changePercent.toFixed(2)}% — ${m.type || ""}`;
    ul.appendChild(li);
  });
}

function updateNewsUI(news) {
  const container = document.getElementById("newsFeed");
  container.innerHTML = "";
  (news||[]).slice(0,6).forEach(item=>{
    const div = document.createElement("div");
    div.className = "news-item";
    const time = new Date(item.datetime*1000).toLocaleString();
    div.innerHTML = `<a href="${item.url}" target="_blank">${item.headline}</a><div style="font-size:0.8rem;color:#9bb3d1">${time}</div>`;
    container.appendChild(div);
  });
}

/**********************
 * Data: Finnhub Requests
 **********************/
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Fetch error " + res.status);
  return res.json();
}

// Get company metrics (52-week high/low) and historical candles for SMA
async function fetchCompanyMetrics(symbol) {
  try {
    const base = DIRECT_CLIENT_MODE ? `https://finnhub.io/api/v1` : PROXY_BASE;
    const keyParam = DIRECT_CLIENT_MODE ? `&token=${FINNHUB_API_KEY}` : "";
    const profileUrl = `${base}/stock/metric?symbol=${symbol}&metric=all${keyParam}`;
    const profile = await fetchJSON(profileUrl);
    // quick candes (last 5 closes)
    const today = Math.floor(Date.now()/1000);
    const from = today - 60*60*24*14; // last 14 days
    const candlesUrl = `${base}/stock/candle?symbol=${symbol}&resolution=D&from=${from}&to=${today}${keyParam}`;
    const candles = await fetchJSON(candlesUrl);
    return { profile, candles };
  } catch (e) {
    console.warn("metric fetch failed", e);
    return null;
  }
}

// Top movers (we'll approximate by querying a set of tickers and computing percent change)
async function getTopMovers(symbols) {
  const results = [];
  for (const s of symbols) {
    try {
      const base = DIRECT_CLIENT_MODE ? `https://finnhub.io/api/v1` : PROXY_BASE;
      const keyParam = DIRECT_CLIENT_MODE ? `&token=${FINNHUB_API_KEY}` : "";
      const quote = await fetchJSON(`${base}/quote?symbol=${s}${keyParam}`);
      // percent change from open (use o or previous close p)
      const pct = quote.pc ? ((quote.c - quote.pc)/quote.pc)*100 : 0;
      results.push({ symbol: s, changePercent: pct, price: quote.c });
    } catch(e){ /* ignore failures */ }
  }
  results.sort((a,b)=>Math.abs(b.changePercent) - Math.abs(a.changePercent));
  return results;
}

// News fetch
async function fetchNews(symbol=null) {
  try {
    const base = DIRECT_CLIENT_MODE ? `https://finnhub.io/api/v1` : PROXY_BASE;
    const keyParam = DIRECT_CLIENT_MODE ? `&token=${FINNHUB_API_KEY}` : "";
    const url = symbol ? `${base}/company-news?symbol=${symbol}&from=${getDateDaysAgo(7)}&to=${getDateDaysAgo(0)}${keyParam}`
                       : `${base}/news?category=general${keyParam}`;
    return await fetchJSON(url);
  } catch(e){ console.warn("news fail", e); return []; }
}

function getDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0,10);
}

/**********************
 * WebSocket for real-time quotes (Finnhub)
 **********************/
function openWS() {
  if (DIRECT_CLIENT_MODE) {
    const token = FINNHUB_API_KEY;
    const ws = new WebSocket(`wss://ws.finnhub.io?token=${token}`);
    ws.onopen = () => {
      console.log("WS open");
      for (const t of watchlist) ws.send(JSON.stringify({ type: "subscribe", symbol: t }));
    };
    ws.onmessage = async (evt) => {
      const data = JSON.parse(evt.data);
      if (data.type === 'trade' && data.data) {
        data.data.forEach(tr => {
          const s = tr.s;
          tickerData[s] = tickerData[s] || {};
          tickerData[s].c = tr.p;
          // we don't have 52-week metrics when streaming; try fetching metrics if missing
        });
        updateTickerUI();
      }
    };
    ws.onerror = (e) => console.warn("WS error", e);
    return ws;
  } else {
    // If not direct mode, WebSocket can't be opened without key in client.
    // In production you would proxy or use another streaming service or server-side WS.
    return null;
  }
}

/**********************
 * Main update loop
 **********************/
async function refreshAll() {
  // update each ticker: quote + metrics
  for (const t of watchlist) {
    try {
      const base = DIRECT_CLIENT_MODE ? `https://finnhub.io/api/v1` : PROXY_BASE;
      const keyParam = DIRECT_CLIENT_MODE ? `&token=${FINNHUB_API_KEY}` : "";
      const quote = await fetchJSON(`${base}/quote?symbol=${t}${keyParam}`);
      // store quote
      tickerData[t] = tickerData[t] || {};
      tickerData[t].c = quote.c;
      tickerData[t].d = quote.d || (quote.c - quote.pc);
      // fetch metrics/candles if we don't have them recently
      if (!tickerData[t].profile || (Date.now() - (tickerData[t].profileFetched||0) > 1000*60*10)) {
        const { profile, candles } = await fetchCompanyMetrics(t) || {};
        if (profile) {
          tickerData[t].profile = profile.metric || profile; // fallback
          tickerData[t].profileFetched = Date.now();
        }
        if (candles && candles.c && candles.c.length) {
          tickerData[t].candles = candles.c;
        }
      }
      // compute sma from recent candles
      const closes = (tickerData[t].candles || []).slice(-5);
      const sma = closes.length ? calcSMA(closes) : null;
      const high52 = tickerData[t].profile && tickerData[t].profile["52WeekHigh"] ? tickerData[t].profile["52WeekHigh"] : (tickerData[t].profile && tickerData[t].profile["52WeekHigh"]!==undefined ? tickerData[t].profile["52WeekHigh"] : (quote.h || quote.pc));
      const low52 = tickerData[t].profile && tickerData[t].profile["52WeekLow"] ? tickerData[t].profile["52WeekLow"] : (quote.l || quote.pc);
      tickerData[t].rec = signalForTicker(quote.c, high52, low52, sma);
    } catch (e) {
      console.warn("ticker refresh fail", t, e);
    }
  }
  // top movers: use a fixed basket (you can replace with S&P tickers)
  const sampleSymbols = ["AAPL","MSFT","TSLA","NVDA","AMZN","GOOGL","META","NFLX","BABA","JPM","BAC","XOM"];
  const movers = await getTopMovers(sampleSymbols);
  updateTopMoversUI(movers);

  // news (general high-impact)
  const news = await fetchNews(); // general
  updateNewsUI(news);

  updateTickerUI();
}

/**********************
 * UI events and init
 **********************/
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("addTickerBtn").addEventListener("click", () => {
    const v = document.getElementById("watchInput").value.trim().toUpperCase();
    if (v && !watchlist.includes(v)) {
      watchlist.push(v);
      refreshAll();
      document.getElementById("watchInput").value = "";
    }
  });

  updateTickerUI();

  // If direct client mode, open websocket for fast updates
  if (DIRECT_CLIENT_MODE) {
    try { openWS(); } catch(e) { console.warn("WS disabled", e); }
  }

  // initial refresh + interval polling
  refreshAll();
  setInterval(refreshAll, 10 * 1000); // update every 10s
});


