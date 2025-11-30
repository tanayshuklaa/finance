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
