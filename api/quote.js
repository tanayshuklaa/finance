export default async function handler(req, res) {
    const { symbol } = req.query;
    const key = process.env.FINNHUB_KEY;

    const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${key}`;

    try {
        const data = await fetch(url).then(r => r.json());
        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
}

