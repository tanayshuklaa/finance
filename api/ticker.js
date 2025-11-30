export default async function handler(req, res) {
    const key = process.env.FINNHUB_KEY;
    const symbols = ["AAPL", "TSLA", "NVDA", "AMZN", "SPY"];

    try {
        const responses = await Promise.all(
            symbols.map(s =>
                fetch(`https://finnhub.io/api/v1/quote?symbol=${s}&token=${key}`)
                    .then(r => r.json())
                    .then(data => ({ symbol: s, ...data }))
            )
        );

        res.status(200).json(responses);

    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
}

