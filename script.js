// ----------------------------
// REAL-TIME MARKET TICKER
// ----------------------------
async function loadTicker() {
    let data = await fetch("/api/ticker").then(r => r.json());

    let text = "";
    data.forEach(item => {
        let change = ((item.c - item.pc) / item.pc * 100).toFixed(2);
        let arrow = change >= 0 ? "▲" : "▼";
        let color = change >= 0 ? "#4caf50" : "#ff5252";

        text += `<span style="color:${color}; margin-right:22px;">
                    ${item.symbol}: ${item.c} ${arrow} ${change}%
                </span>`;
    });

    document.getElementById("liveTicker").innerHTML = text;
}
loadTicker();
setInterval(loadTicker, 15000);


// ----------------------------
// BUY • HOLD • SELL ANALYZER
// ----------------------------
async function fetchStock() {
    let symbol = document.getElementById("symbol").value.toUpperCase();
    let result = document.getElementById("result");

    if (!symbol) {
        result.innerHTML = "Enter a valid stock symbol.";
        return;
    }

    let quote = await fetch(`/api/quote?symbol=${symbol}`).then(r => r.json());

    if (!quote.c) {
        result.innerHTML = "Invalid ticker.";
        return;
    }

    let current = quote.c;
    let high52 = quote.h;
    let low52 = quote.l;

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


// ----------------------------
// NEWS FEED
// ----------------------------
async function loadNews() {
    let data = await fetch("/api/news").then(r => r.json());
    let list = document.getElementById("newsFeed");

    list.innerHTML = "";

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
setInterval(loadNews, 60000);
