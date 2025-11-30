export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=20, stale-while-revalidate=40");

  const key = process.env.FINNHUB_KEY;
  const symbols = ["AAPL", "TSLA", "NVDA", "AMZN", "SPY"];

  try {
    const responses = await Promise.all(
      symbols.map(async (symbol) => {
        const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${key}`;
        const r = await fetch(url);
        const d = await r.json();
        return { symbol, ...d };
      })
    );

    return res.status(200).json(responses);
  } catch (err) {
    console.error("ticker error:", err);
    return res.status(500).json({ error: "Ticker fetch failed" });
  }
}
