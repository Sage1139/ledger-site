// Vercel serverless function — free market data from Yahoo Finance (delayed ~15 min).
// GET /api/quote                         -> Nifty 50, Bank Nifty, Sensex (intraday)
// GET /api/quote?symbols=RELIANCE.NS,TCS.NS&range=1d|5d|1mo|6mo|1y|5y
const DEFAULT = ['^NSEI', '^NSEBANK', '^BSESN'];
const NAMES = { '^NSEI': 'NIFTY 50', '^NSEBANK': 'BANKNIFTY', '^BSESN': 'SENSEX' };
const RANGES = { '1d': '5m', '5d': '15m', '1mo': '1d', '6mo': '1d', '1y': '1d', '5y': '1wk' };
const OK = /^[\^A-Z0-9&.\-]{1,24}$/;

async function getQuote(symbol, range) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${RANGES[range]}&range=${range}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`${symbol}: HTTP ${r.status}`);
  const j = await r.json();
  const res = j.chart && j.chart.result && j.chart.result[0];
  if (!res) throw new Error(`${symbol}: no data`);
  const meta = res.meta;
  const closes = ((res.indicators.quote[0] || {}).close || []).filter((v) => v != null);
  const price = meta.regularMarketPrice ?? closes[closes.length - 1];
  const prevClose = range === '1d' ? (meta.chartPreviousClose ?? meta.previousClose ?? closes[0]) : (meta.previousClose ?? meta.chartPreviousClose ?? closes[closes.length - 2] ?? closes[0]);
  return {
    name: NAMES[symbol] || symbol.replace(/\.(NS|BO)$/, ''),
    symbol,
    price,
    prevClose,
    change: ((price - prevClose) / prevClose) * 100,
    dayHigh: meta.regularMarketDayHigh ?? null,
    dayLow: meta.regularMarketDayLow ?? null,
    high52: meta.fiftyTwoWeekHigh ?? null,
    low52: meta.fiftyTwoWeekLow ?? null,
    time: meta.regularMarketTime ? meta.regularMarketTime * 1000 : null,
    series: closes.length > 1 ? closes : [prevClose, price],
  };
}

export default async function handler(req, res) {
  const q = req.query || {};
  const range = RANGES[q.range] ? q.range : '1d';
  let symbols = q.symbols ? String(q.symbols).toUpperCase().split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT;
  symbols = [...new Set(symbols)].filter((s) => OK.test(s)).slice(0, 30);
  if (!symbols.length) return res.status(400).json({ error: 'No valid symbols' });

  const settled = await Promise.allSettled(symbols.map((s) => getQuote(s, range)));
  const quotes = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
  const failed = symbols.filter((_, i) => settled[i].status === 'rejected');
  if (!quotes.length) return res.status(502).json({ error: 'Market data unavailable', failed });

  res.setHeader('Cache-Control', range === '1d' ? 's-maxage=30, stale-while-revalidate=60' : 's-maxage=600, stale-while-revalidate=1200');
  res.status(200).json({ updated: new Date().toISOString(), range, quotes, failed });
}
