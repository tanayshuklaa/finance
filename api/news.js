export default async function handler(req, res) {
    const key = process.env.FINNHUB_KEY;

    const url = `https://finnhub.io/api/v1/news?category=general&token=${key}`;

    try {
        const response = await fetch(url);
        const news = await response.json();
        res.status(200).json(news);
    } catch (err) {
        res.status(500).json({ error: "News fetch failed" });
    }
}
