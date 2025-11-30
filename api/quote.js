export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=20, stale-while-revalidate=40");

  const { symbol } = req.query;
  const key = process.env.FINNHUB_KEY;

  if (!symbol) {
    return res.status(400).json({ error: "Symbol is required" });
  }

  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(
    symbol
  )}&token=${key}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error("quote error:", err);
    return res.status(500).json({ error: "Quote fetch failed" });
  }
}
