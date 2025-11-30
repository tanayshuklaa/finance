export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

  const key = process.env.FINNHUB_KEY;
  const url = `https://finnhub.io/api/v1/news?category=general&token=${key}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error("news error:", err);
    return res.status(500).json({ error: "News fetch failed" });
  }
}
