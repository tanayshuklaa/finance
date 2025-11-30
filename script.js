/* =========================
   FULL DASHBOARD SCRIPT
   Uses Finnhub (client-side)
   ========================= */

// ---------- CONFIG ----------
const API_KEY = "d4ma5m1r01qjidhuhs90d4ma5m1r01qjidhuhs9g"; // <-- your Finnhub key
const sampleSymbols = ["AAPL","TSLA","NVDA","AMZN","MSFT","GOOGL","META","NVDA","SPY","QQQ"];
const cryptoSymbols = ["BINANCE:BTCUSDT","BINANCE:ETHUSDT"];
const forexSymbols = ["OANDA:EUR_USD","OANDA:USD_JPY"];

// ---------- UTILITIES ----------
async function fetchJSON(url){
  const r = await fetch(url);
  if(!r.ok) throw new Error("Fetch error "+r.status);
  return r.json();
}
function safe(val){ return (val===null||val===undefined) ? "—" : val; }
function numberFmt(n){ return (n===null||n===undefined) ? "—" : (Math.round((n + Number.EPSILON)*100)/100).toLocaleString(); }

// ---------- TOP TICKER (stocks+crypto+forex) ----------
async function updateTopTicker(){
  try{
    const parts = [];
    // stocks
    for(const s of ["AAPL","TSLA","NVDA","SPY"]){
      const q = await fetchJSON(`https://finnhub.io/api/v1/quote?symbol=${s}&token=${API_KEY}`);
      const change = q.pc ? ((q.c - q.pc)/q.pc*100) : 0;
      const color = change>=0 ? 'var(--good)' : 'var(--bad)';
      parts.push(`<span style="color:${color};margin-right:20px">${s}: ${numberFmt(q.c)} (${change>=0?'+':''}${change.toFixed(2)}%)</span>`);
    }
    // crypto (uses exchange symbol)
    for(const s of cryptoSymbols){
      const q = await fetchJSON(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(s)}&token=${API_KEY}`);
      const change = q.pc ? ((q.c - q.pc)/q.pc*100) : 0;
      parts.push(`<span style="color:${change>=0?'var(--good)':'var(--bad)'};margin-right:20px">${s.split(':')[1]}: ${numberFmt(q.c)} (${change.toFixed(2)}%)</span>`);
    }
    // forex
    for(const s of forexSymbols){
      const q = await fetchJSON(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(s)}&token=${API_KEY}`);
      parts.push(`<span style="margin-right:20px">${s.split(':')[1]}: ${q.c}</span>`);
    }

    document.getElementById('topTicker').innerHTML = parts.join('');
  }catch(e){
    console.warn('Ticker update failed',e);
  }
}
updateTopTicker();
setInterval(updateTopTicker,15000);


// ---------- WATCHLIST ----------
let watchlist = [];
function renderWatchlist(){
  const el = document.getElementById('watchlist');
  if(!watchlist.length){ el.innerHTML = '<div class="meta-block">Empty — add tickers with + Watch</div>'; return; }
  el.innerHTML = '';
  watchlist.forEach(t => {
    const div = document.createElement('div'); div.className='mover';
    div.innerHTML = `<div>${t}</div><div><button onclick="loadSymbol('${t}')">Open</button> <button onclick="removeWatch('${t}')">x</button></div>`;
    el.appendChild(div);
  });
}
function addWatch(t){
  if(!t) return;
  if(!watchlist.includes(t)) watchlist.push(t);
  renderWatchlist();
}
function removeWatch(t){
  watchlist = watchlist.filter(x=>x!==t); renderWatchlist();
}

// hook + watch button
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('loadBtn').addEventListener('click', ()=> {
    const s = document.getElementById('symbolInput').value.trim();
    if(s) loadSymbol(s);
  });
  document.getElementById('watchBtn').addEventListener('click', ()=> {
    const s = document.getElementById('symbolInput').value.trim();
    if(s) { addWatch(s.toUpperCase()); }
  });
  renderWatchlist();
});

// ---------- CHART (Lightweight Charts) ----------
let chart, candleSeries, smaSeries, emaSeries, macdSeries, volumeSeries;
function createChart(){
  const container = document.getElementById('chart');
  container.innerHTML = '';
  chart = LightweightCharts.createChart(container, {
    layout: { background: { color: '#081126' }, textColor: '#dfefff' },
    grid: { vertLines:{color:'rgba(255,255,255,0.03)'}, horzLines:{color:'rgba(255,255,255,0.02)'} },
    rightPriceScale: { borderColor: 'rgba(255,255,255,0.06)' },
    timeScale: { borderColor: 'rgba(255,255,255,0.06)' }
  });
  candleSeries = chart.addCandlestickSeries();
  volumeSeries = chart.addHistogramSeries({ color: '#2b6bff', priceFormat: { type: 'volume' }, scaleMargins: { top: 0.8, bottom: 0 }});
}
createChart();

async function loadCandles(symbol, resolution='D'){
  try{
    // Finnhub requires from/to unix timestamps
    const to = Math.floor(Date.now()/1000);
    // choose from based on resolution
    const days = (resolution==='1'?2 : resolution==='5'?7 : resolution==='15'?14 : resolution==='60'?60 : 365);
    const from = to - days*24*60*60;
    const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${from}&to=${to}&token=${API_KEY}`;
    const data = await fetchJSON(url);
    if(data.s !== 'ok') throw new Error('Candle fetch error');
    const candles = data.t.map((ts,i)=>({
      time: ts,
      open: data.o[i],
      high: data.h[i],
      low: data.l[i],
      close: data.c[i]
    }));
    // set series
    candleSeries.setData(candles);
    // volume: use histogram with close-open for color
    const volumes = data.t.map((ts,i)=>({time: ts, value: data.v[i]}));
    volumeSeries.setData(volumes);
    return candles;
  }catch(e){
    console.warn('loadCandles failed',e);
    return null;
  }
}

// ---------- INDICATORS: SMA, EMA, RSI, MACD ----------
function calcSMA(values, period){
  if(values.length < period) return [];
  const res = [];
  for(let i=period-1;i<values.length;i++){
    const slice = values.slice(i-period+1,i+1);
    const sma = slice.reduce((a,b)=>a+b,0)/period;
    res.push({time: valuesTimes(values)[i], value: sma});
  }
  return res;
}
// helper to map values to times (values param is closes array of numbers or objects)
function valuesTimes(values){
  // expects values to be array of objects that were fed to candleSeries; fallback numeric indexes
  return values.map(v => v.time ? v.time : 0);
}
function calcSMAFromCandles(candles, period){
  if(!candles) return [];
  const res = [];
  for(let i=period-1;i<candles.length;i++){
    let sum=0;
    for(let j=i-period+1;j<=i;j++) sum += candles[j].close;
    res.push({time: candles[i].time, value: +(sum/period).toFixed(4)});
  }
  return res;
}
function calcEMAFromCandles(candles, period){
  if(!candles || candles.length<period) return [];
  const res = [];
  const k = 2/(period+1);
  let emaPrev = candles.slice(0,period).reduce((a,b)=>a+b.close,0)/period;
  for(let i=period;i<candles.length;i++){
    const close = candles[i].close;
    const ema = close * k + emaPrev * (1-k);
    res.push({time: candles[i].time, value: +ema.toFixed(4)});
    emaPrev = ema;
  }
  return res;
}
function calcRSI(candles, period=14){
  if(!candles || candles.length <= period) return [];
  let gains=0, losses=0;
  for(let i=1;i<=period;i++){
    const diff = candles[i].close - candles[i-1].close;
    if(diff>=0) gains += diff; else losses += Math.abs(diff);
  }
  let avgGain = gains/period, avgLoss = losses/period;
  const rsiArr = [];
  for(let i=period+1;i<candles.length;i++){
    const diff = candles[i].close - candles[i-1].close;
    const gain = Math.max(0,diff), loss = Math.max(0,-diff);
    avgGain = (avgGain*(period-1) + gain)/period;
    avgLoss = (avgLoss*(period-1) + loss)/period;
    const rs = avgLoss===0 ? 100 : avgGain/avgLoss;
    const rsi = 100 - (100/(1+rs));
    rsiArr.push({time: candles[i].time, value: +rsi.toFixed(2)});
  }
  return rsiArr;
}
function calcMACD(candles){
  // MACD line = EMA12 - EMA26; signal = EMA9 of MACD
  const ema12 = calcEMAFromCandles(candles,12);
  const ema26 = calcEMAFromCandles(candles,26);
  // align by time: ema12 starts later than ema26; find overlap
  const startIndex = Math.max(0, ema26.length - ema12.length);
  const macd = [];
  for(let i=0;i<ema12.length && i+startIndex<ema26.length;i++){
    const a = ema12[i].value;
    const b = ema26[i+startIndex].value;
    macd.push({time: ema12[i].time, value: +(a-b).toFixed(6)});
  }
  // signal = EMA9 of macd values (simple numeric)
  if(macd.length < 9) return {macd, signal: []};
  const signal = [];
  // compute EMA9 on macd values
  let k = 2/(9+1);
  let emaPrev = macd.slice(0,9).reduce((a,b)=>a+b.value,0)/9;
  for(let i=9;i<macd.length;i++){
    const val = macd[i].value;
    const ema = val*k + emaPrev*(1-k);
    signal.push({time: macd[i].time, value: +ema.toFixed(6)});
    emaPrev = ema;
  }
  return {macd, signal};
}

// ---------- FUNDAMENTALS ----------
async function loadFundamentals(symbol){
  try{
    const data = await fetchJSON(`https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${API_KEY}`);
    return data.metric || data;
  }catch(e){ console.warn('fundamentals failed',e); return null; }
}

// ---------- EARNINGS ----------
async function loadEarnings(symbol){
  try{
    const now = new Date(); const to = now.toISOString().slice(0,10);
    const fromDate = new Date(); fromDate.setMonth(now.getMonth()-3);
    const from = fromDate.toISOString().slice(0,10);
    const data = await fetchJSON(`https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${API_KEY}`);
    // the API returns a list under 'earnings' or structured calendar; filter matches
    // we'll scan for entries matching symbol
    const matched = [];
    if(data.earnings && Array.isArray(data.earnings)){
      for(const e of data.earnings) if(e.symbol===symbol) matched.push(e);
    } else if(data.symbols){
      // fallback
    }
    return matched.slice(0,6);
  }catch(e){ console.warn('earnings fail',e); return []; }
}

// ---------- NEWS ----------
async function loadNews(symbol=null){
  try{
    const url = symbol ? `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${getDateDaysAgo(7)}&to=${getDateDaysAgo(0)}&token=${API_KEY}`
                       : `https://finnhub.io/api/v1/news?category=general&token=${API_KEY}`;
    const data = await fetchJSON(url);
    return data.slice(0,12);
  }catch(e){ console.warn('news fail',e); return []; }
}
function getDateDaysAgo(days){
  const d=new Date(); d.setDate(d.getDate()-days); return d.toISOString().slice(0,10);
}

// ---------- TOP MOVERS (sample) ----------
async function loadTopMovers(){
  try{
    const symbols = ["AAPL","TSLA","NVDA","AMZN","MSFT","META","AMD","INTC","GOOGL","NFLX"];
    const arr = [];
    for(const s of symbols){
      const q = await fetchJSON(`https://finnhub.io/api/v1/quote?symbol=${s}&token=${API_KEY}`);
      const change = q.pc ? ((q.c - q.pc)/q.pc*100) : 0;
      arr.push({symbol:s,change,price:q.c});
    }
    arr.sort((a,b)=>Math.abs(b.change)-Math.abs(a.change));
    return arr;
  }catch(e){ console.warn('movers fail',e); return []; }
}

// ---------- Recommendation logic (rules + indicators) ----------
function simpleRuleRec(current, high52, low52){
  if(current < low52 * 1.15) return 'BUY';
  if(current > high52 * 0.95) return 'SELL';
  return 'HOLD';
}
function indicatorRec(current, smaShort, smaLong, rsi, macdObj){
  // basic: if price above long SMA and rsi < 70 and macd positive => BUY
  if(smaShort && smaLong && current < smaShort[smaShort.length-1].value) return 'BUY';
  if(smaShort && smaLong && current > smaShort[smaShort.length-1].value) return 'SELL';
  if(rsi && rsi.length){
    const lastR = rsi[rsi.length-1].value;
    if(lastR < 30) return 'BUY';
    if(lastR > 70) return 'SELL';
  }
  if(macdObj && macdObj.macd.length && macdObj.signal.length){
    const lastMacd = macdObj.macd[macdObj.macd.length-1].value;
    const lastSignal = macdObj.signal[macdObj.signal.length-1].value;
    if(lastMacd > lastSignal) return 'BUY';
    if(lastMacd < lastSignal) return 'SELL';
  }
  return 'HOLD';
}

// ---------- LOAD SYMBOL: main orchestrator ----------
let lastCandles = null;
async function loadSymbol(symbol){
  try{
    symbol = symbol.trim().toUpperCase();
    document.getElementById('chartTitle').innerText = symbol + ' • Chart';
    document.getElementById('quoteTitle').innerText = symbol + ' • Quote';
    // resolution
    const res = document.getElementById('resolutionSelect').value || 'D';

    // fetch quote
    const quote = await fetchJSON(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${API_KEY}`);

    // candles
    const candles = await loadCandles(symbol,res);
    lastCandles = candles;

    // draw indicators & compute
    // SMA short=5, long=20
    const sma5 = calcSMAFromCandles(candles,5);
    const sma20 = calcSMAFromCandles(candles,20);
    const ema12 = calcEMAFromCandles(candles,12);
    const rsi14 = calcRSI(candles,14);
    const macdObj = calcMACD(candles);

    // plot SMA/EMA overlays
    if(window.smaSeries) chart.removeSeries(window.smaSeries);
    window.smaSeries = chart.addLineSeries({color:'#ffb86b',lineWidth:1});
    window.smaSeries.setData(sma5.map(p=>({time:p.time,value:p.value})));

    if(window.emaSeries) chart.removeSeries(window.emaSeries);
    window.emaSeries = chart.addLineSeries({color:'#7ee7a6',lineWidth:1});
    window.emaSeries.setData(ema12.map(p=>({time:p.time,value:p.value})));

    // quote box
    const qBox = document.getElementById('quoteBox');
    qBox.innerHTML = `
      <div class="big">${numberFmt(quote.c)}</div>
      <div>Change: ${(quote.pc?((quote.c-quote.pc).toFixed(2)):'—')} (${quote.pc?((((quote.c-quote.pc)/quote.pc)*100).toFixed(2)+'%'):'—'})</div>
      <div>Open: ${safe(quote.o)} • High: ${safe(quote.h)} • Low: ${safe(quote.l)}</div>
      <div>Volume: ${safe(quote.v)}</div>
    `;

    // fundamentals
    const fundamentals = await loadFundamentals(symbol);
    const fundBox = document.getElementById('fundamentals');
    if(fundamentals){
      fundBox.innerHTML = `
        P/E: ${safe(fundamentals.peNormalized)} • Market Cap: ${safe(fundamentals.marketCapitalization)}<br>
        EPS (ttm): ${safe(fundamentals.epsBasic)} • Beta: ${safe(fundamentals.beta)}
      `;
    } else fundBox.innerHTML = '<div class="muted">No fundamentals</div>';

    // earnings
    const earn = await loadEarnings(symbol);
    const earnBox = document.getElementById('earnings');
    earnBox.innerHTML = earn.length ? earn.map(e=>`<div>${e.symbol} • ${e.period} • ${e.time}</div>`).join('') : '<div class="muted">No upcoming earnings found</div>';

    // news
    const news = await loadNews(symbol);
    const newsBox = document.getElementById('newsFeed');
    newsBox.innerHTML = news.map(n=>`<div class="newsItem"><strong><a href="${n.url}" target="_blank">${n.headline}</a></strong><div style="font-size:0.85rem;color:var(--muted)">${n.source} • ${new Date(n.datetime*1000).toLocaleString()}</div></div>`).join('');

    // movers update
    const movers = await loadTopMovers();
    document.getElementById('movers').innerHTML = movers.slice(0,8).map(m=>`<div class="mover"><div>${m.symbol}</div><div style="color:${Math.abs(m.change)>=0? (m.change>=0?'var(--good)':'var(--bad)'):''}">${m.price} • ${m.change.toFixed(2)}%</div></div>`).join('');

    // recommendation: combine simpleRuleRec with indicatorRec
    const rule = simpleRuleRec(quote.c, quote.h, quote.l);
    const ind = indicatorRec(quote.c, sma5, sma20, rsi14, macdObj);
    // priority: if rule is BUY/SELL, use it; else use indicator
    let finalRec = rule==='HOLD' ? ind : rule;
    // update rec box
    const recBox = document.getElementById('recBox');
    const color = finalRec==='BUY' ? 'var(--good)' : finalRec==='SELL' ? 'var(--bad)' : 'var(--hold)';
    recBox.style.background = '#071229';
    recBox.style.color = color;
    recBox.innerHTML = finalRec;

  }catch(e){
    console.error('loadSymbol error',e);
    alert('Failed to load symbol: '+(e.message||e));
  }
}

// helper to call loadSymbol from UI
async function loadSymbolFromInput(){
  const s = document.getElementById('symbolInput').value.trim();
  if(s) await loadSymbol(s);
}
document.getElementById && document.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('loadBtn').addEventListener('click', loadSymbolFromInput);
  document.getElementById('symbolInput').addEventListener('keyup', (e)=>{ if(e.key==='Enter') loadSymbolFromInput(); });
  // load a default
  document.getElementById('symbolInput').value = 'AAPL';
  loadSymbol('AAPL');
  // initial movers
  loadTopMovers().then(arr => document.getElementById('movers').innerHTML = arr.slice(0,8).map(m=>`<div class="mover"><div>${m.symbol}</div><div style="color:${m.change>=0?'var(--good)':'var(--bad)'}">${m.price} • ${m.change.toFixed(2)}%</div></div>`).join(''));
});

// ---------- basic helpers for SMA calc used earlier ----------
function calcSMAFromCandlesSimple(candles, period){
  if(!candles || candles.length < period) return [];
  const out = [];
  for(let i=period-1;i<candles.length;i++){
    let sum=0;
    for(let j=i-period+1;j<=i;j++) sum+=candles[j].close;
    out.push({time:candles[i].time, value: sum/period});
  }
  return out;
}
