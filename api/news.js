export default async function handler(req, res) {
    const key = process.env.FINNHUB_KEY;

    const url = `https://finnhub.io/api/v1/news?category=general&token=${key}`;

    try {
        const data = await fetch(url).then(r => r.json());
        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
}

