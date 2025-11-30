export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

  const key = process.env.FINNHUB_KEY;
  const { symbol, resolution, from, to } = req.query;

  if (!symbol || !resolution || !from || !to) {
    return res.status(400).json({ error: "symbol, resolution, from, to required" });
  }

  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(
    symbol
  )}&resolution=${encodeURIComponent(resolution)}&from=${from}&to=${to}&token=${key}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.s !== "ok") {
      console.error("candles status:", data);
      return res.status(400).json({ error: "No candle data for this symbol" });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("candles error:", err);
    return res.status(500).json({ error: "Candles fetch failed" });
  }
}
