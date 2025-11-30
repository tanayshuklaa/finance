export default async function handler(req, res) {
    const key = process.env.FINNHUB_KEY;
    const symbols = ["AAPL", "TSLA", "NVDA", "AMZN", "SPY"];

    try {
        const quotes = await Promise.all(
            symbols.map(async symbol => {
                const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${key}`;
                const response = await fetch(url);
                const data = await response.json();
                return { symbol, ...data };
            })
        );

        res.status(200).json(quotes);
    } catch (err) {
        res.status(500).json({ error: "Ticker fetch failed" });
    }
}


