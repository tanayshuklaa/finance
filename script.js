/* — BUY HOLD SELL ANALYZER — */
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

    // Rule #1: Low-based BUY
    if (current < low52 * 1.15) return showResult("BUY", "#0f7b32");

    // Rule #2: High-based SELL
    if (current > high52 * 0.95) return showResult("SELL", "#b81f1f");

    // Rule #3: SMA-based logic
    if (past.length > 0) {
        let nums = past.split(",").map(v => parseFloat(v.trim()));
        if (nums.length > 1) {
            let sma = nums.reduce((a, b) => a + b, 0) / nums.length;
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

/* — HIGH IMPACT NEWS ROTATOR — */
const newsHeadlines = [
    "BREAKING: Tech stocks surge after strong earnings.",
    "FED ALERT: New rate policy update expected tomorrow.",
    "Market volatility rises as traders await CPI numbers.",
    "Oil prices spike amid global supply disruptions.",
    "Crypto markets rally: BTC crosses key resistance.",
    "Semiconductors soar on renewed AI demand.",
    "Investors rotate into defensive sectors.",
];

let newsIndex = 0;

function rotateNews() {
    const bar = document.getElementById("newsBar");
    bar.innerHTML = newsHeadlines[newsIndex];
    newsIndex = (newsIndex + 1) % newsHeadlines.length;
}

rotateNews();
setInterval(rotateNews, 3500);
