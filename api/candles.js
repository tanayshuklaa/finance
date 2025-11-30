export default async function handler(req, res) {
    const key = process.env.FINNHUB_KEY;

    const { symbol, resolution, from, to } = req.query;

    if (!symbol || !resolution || !from || !to) {
        return res.status(400).json({ error: "Missing parameters" });
    }

    const url = `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${to}&token=${key}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.s !== "ok") {
            return res.status(400).json({ error: "Invalid symbol or no candle data" });
        }

        res.status(200).json(data);

    } catch (err) {
        res.status(500).json({ error: "Candle fetch failed" });
    }
}
