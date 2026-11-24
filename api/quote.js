// Vercel serverless function — free market data from Yahoo Finance (delayed ~15 min).
// GET /api/quote?symbols=^NSEI,RELIANCE.NS&range=1d|5d|1mo|6mo|1y|2y|5y|10y&candles=1&div=1
const DEFAULT = ['^NSEI', '^NSEBANK', '^BSESN'];
const NAMES = { '^NSEI': 'NIFTY 50', '^NSEBANK': 'BANKNIFTY', '^BSESN': 'SENSEX' };
const RANGES = { '1d': '1m', '5d': '5m', '1mo': '30m', '6mo': '1d', '1y': '1d', '2y': '1d', '5y': '1wk', '10y': '1mo' };
const OK = /^[\^A-Z0-9&.\-]{1,24}$/;

async function getQuote(symbol, range, withCandles, withDiv) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${RANGES[range]}&range=${range}${withDiv ? '&events=div' : ''}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`${symbol}: HTTP ${r.status}`);
  const j = await r.json();
  const res = j.chart && j.chart.result && j.chart.result[0];
  if (!res) throw new Error(`${symbol}: no data`);
  const meta = res.meta, q = res.indicators.quote[0] || {}, ts = res.timestamp || [];
  const candles = [];
  ts.forEach((t, i) => {
    const c = q.close && q.close[i];
    if (c == null) return;
    candles.push({ t: t * 1000, o: q.open[i] ?? c, h: q.high[i] ?? c, l: q.low[i] ?? c, c, v: (q.volume && q.volume[i]) || 0 });
  });
  const closes = candles.map((k) => k.c);
  const price = meta.regularMarketPrice ?? closes[closes.length - 1];
  const prevClose = range === '1d' ? (meta.chartPreviousClose ?? meta.previousClose ?? closes[0]) : (meta.previousClose ?? meta.chartPreviousClose ?? closes[closes.length - 2] ?? closes[0]);
  const out = {
    name: NAMES[symbol] || symbol.replace(/\.(NS|BO)$/, ''),
    symbol, price, prevClose,
    change: ((price - prevClose) / prevClose) * 100,
    dayHigh: meta.regularMarketDayHigh ?? null, dayLow: meta.regularMarketDayLow ?? null,
    high52: meta.fiftyTwoWeekHigh ?? null, low52: meta.fiftyTwoWeekLow ?? null,
    time: meta.regularMarketTime ? meta.regularMarketTime * 1000 : null,
    series: closes.length > 1 ? closes : [prevClose, price],
  };
  if (withCandles) out.candles = candles;
  if (withDiv) out.dividends = Object.values((res.events && res.events.dividends) || {}).map((d) => ({ t: d.date * 1000, amount: d.amount })).sort((a, b) => a.t - b.t);
  return out;
}

export default async function handler(req, res) {
  const q = req.query || {};
  const range = RANGES[q.range] ? q.range : '1d';
  let symbols = q.symbols ? String(q.symbols).toUpperCase().split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT;
  symbols = [...new Set(symbols)].filter((s) => OK.test(s)).slice(0, 30);
  if (!symbols.length) return res.status(400).json({ error: 'No valid symbols' });
  const settled = await Promise.allSettled(symbols.map((s) => getQuote(s, range, q.candles === '1', q.div === '1')));
  const quotes = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
  const failed = symbols.filter((_, i) => settled[i].status === 'rejected');
  if (!quotes.length) return res.status(502).json({ error: 'Market data unavailable', failed });
  res.setHeader('Cache-Control', range === '1d' ? 's-maxage=20, stale-while-revalidate=40' : 's-maxage=900, stale-while-revalidate=1800');
  res.status(200).json({ updated: new Date().toISOString(), range, quotes, failed });
}
