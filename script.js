const API_KEY = "d4maeh1r01qjidhujfmgd4maeh1r01qjidhujfn0";  // <-- your real Finnhub ke

// ----------------------------------
// REAL-TIME MARKET TICKER
// ----------------------------------
async function loadTicker() {
    const symbols = ["AAPL", "TSLA", "NVDA", "AMZN", "SPY"];

    let text = "";
    for (let s of symbols) {
        let url = `https://finnhub.io/api/v1/quote?symbol=${s}&token=${API_KEY}`;
        let data = await fetch(url).then(r => r.json());

        let change = ((data.c - data.pc) / data.pc * 100).toFixed(2);
        let arrow = change >= 0 ? "▲" : "▼";
        let color = change >= 0 ? "#4caf50" : "#ff5252";

        text += `<span style="color:${color}; margin-right:22px;">
                    ${s}: ${data.c} ${arrow} ${change}%
                 </span>`;
    }
    document.getElementById("liveTicker").innerHTML = text;
}
loadTicker();
setInterval(loadTicker, 15000); // update every 15 sec


// ----------------------------------
// BUY • HOLD • SELL ANALYZER
// ----------------------------------
async function fetchStock() {
    let symbol = document.getElementById("symbol").value.toUpperCase();
    let result = document.getElementById("result");

    if (!symbol) {
        result.innerHTML = "Enter a valid stock symbol.";
        return;
    }

    // Fetch real price data
    let quote = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${API_KEY}`
    ).then(r => r.json());

    if (!quote.c) {
        result.innerHTML = "Invalid stock ticker.";
        return;
    }

    let current = quote.c;
    let high52 = quote.h;
    let low52 = quote.l;

    // Decision logic
    if (current < low52 * 1.15) show("BUY", "#0f7b32");
    else if (current > high52 * 0.95) show("SELL", "#b81f1f");
    else show("HOLD", "#c4a000");

    function show(text, color) {
        result.innerHTML = `
            <strong style="color:${color}; font-size:2rem;">${text}</strong><br><br>
            Current: $${current}<br>
            52w High: $${high52}<br>
            52w Low: $${low52}
        `;
    }
}


// ----------------------------------
// REAL MARKET NEWS
// ----------------------------------
async function loadNews() {
    const url = `https://finnhub.io/api/v1/news?category=general&token=${API_KEY}`;

    let data = await fetch(url).then(r => r.json());
    let list = document.getElementById("newsFeed");

    list.innerHTML = ""; // Clear old news

    data.slice(0, 8).forEach(n => {
        list.innerHTML += `
            <div class="newsItem">
                <strong>${n.headline}</strong><br>
                <span style="font-size:0.9rem;">${n.source}</span>
            </div>
        `;
    });
}
loadNews();
setInterval(loadNews, 60000); // refresh every minute

