// Vercel serverless function: free, ~15-min delayed index data from Yahoo Finance.
// GET /api/quote  ->  { updated, quotes: [{ name, symbol, price, prevClose, change, series:[...] }] }
const SYMBOLS = [
  { name: 'NIFTY 50', symbol: '^NSEI' },
  { name: 'BANKNIFTY', symbol: '^NSEBANK' },
  { name: 'SENSEX', symbol: '^BSESN' },
];

async function getQuote({ name, symbol }) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=1d`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`${symbol}: HTTP ${r.status}`);
  const j = await r.json();
  const res = j.chart.result[0];
  const meta = res.meta;
  const closes = (res.indicators.quote[0].close || []).filter((v) => v != null);
  const price = meta.regularMarketPrice ?? closes[closes.length - 1];
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? closes[0];
  return {
    name,
    symbol,
    price,
    prevClose,
    change: ((price - prevClose) / prevClose) * 100,
    series: closes.length > 1 ? closes : [prevClose, price],
  };
}

export default async function handler(req, res) {
  try {
    const quotes = await Promise.all(SYMBOLS.map(getQuote));
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.status(200).json({ updated: new Date().toISOString(), quotes });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
