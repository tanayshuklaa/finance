export default async function handler(req, res) {
    const { symbol } = req.query;
    const key = process.env.FINNHUB_KEY;

    if (!symbol) {
        return res.status(400).json({ error: "Symbol required" });
    }

    const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${key}`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ error: "Quote fetch failed" });
    }
}
