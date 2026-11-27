// Vercel serverless function: translates LEDGER's interface text into Indian languages.
// GET /api/tr?l=ta&q=<base64url of a JSON array of English strings>  ->  {t:[translated strings]}
// Responses are cached on Vercel's CDN for a year (same request = same answer), so each piece of text
// is translated once and then served instantly to everyone. Uses the same free AI keys as AURORA.

const LANGS = { ta: 'Tamil (தமிழ்)', ml: 'Malayalam (മലയാളം)', hi: 'Hindi (हिन्दी, Devanagari script)', te: 'Telugu (తెలుగు)' };
const KEEP = 'LEDGER, AURORA, SIP, NAV, demat, Nifty, Nifty 50, Sensex, F&O, IPO, ETF, CNC, MIS, NRML, LTP, P&L, XIRR, CAGR, STCG, LTCG, NSE, BSE, SEBI, AMFI, RBI, FD, EMI, KYC, PAN, UPI, OHLC, Heikin-Ashi, call, put, strike, premium, lot, expiry, option chain, futures, options, stop-loss, Greeks, delta, theta, gamma, vega, IV, Black-Scholes';

const SYSTEM = (lang) => `You translate the interface and lesson text of LEDGER, a free website that teaches Indian beginners how the stock market works using virtual money.
Translate each English string into natural, simple, everyday ${LANGS[lang]} that an Indian college student would speak. Be friendly and clear, not formal or bookish.
Rules:
- Return ONLY a JSON array of strings, the same length and order as the input.
- Keep these words in English letters exactly as written: ${KEEP}. Keep stock and fund names, ticker symbols, brand names, people's names, URLs and email addresses unchanged.
- Keep every placeholder like {0}, {1} exactly as it is, in a position that reads naturally.
- Some strings mark bold or coloured words with numbered tags like <0>word</0>, and line breaks like <1/>. Keep every tag exactly once, wrapped around the translation of the same words, moved to wherever those words naturally go in the sentence.
- Keep numbers, ₹ amounts, %, symbols (→ · ✓ ✕ ↑ ↓ + −), emoji and leading/trailing punctuation.
- Keep any word that is entirely in CAPITAL letters (like BUY, SELL, NIFTY, TCS) unchanged.
- Address the reader politely and consistently with the respectful "you" (Tamil நீங்கள், Hindi आप, Malayalam നിങ്ങൾ, Telugu మీరు). Describe actions neutrally, never as "I did".
- Translate the meaning exactly; never add or drop words like "maybe", "always" or "never".
- Never add explanations, notes, quotes or extra words. Never give investment advice.`;

const hits = new Map(); // gentle per-instance limit: 120 requests / minute / IP
function limited(ip) {
  const now = Date.now(), arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now); hits.set(ip, arr); if (hits.size > 5000) hits.clear();
  return arr.length > 120;
}

function decode(q) {
  const b64 = q.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

// Each free model has its own daily quota, so trying several gives far more free capacity.
const GEMINI = ['gemini-flash-lite-latest', 'gemini-2.5-flash-lite', 'gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-2.5-flash'];
const GROQ = [process.env.GROQ_MODEL || 'openai/gpt-oss-120b', 'meta-llama/llama-4-maverick-17b-128e-instruct', 'llama-3.3-70b-versatile', 'moonshotai/kimi-k2-instruct', 'openai/gpt-oss-20b'];

async function timed(url, opts, ms) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { ...opts, signal: ctl.signal }); const j = await r.json().catch(() => ({})); return { r, j }; } finally { clearTimeout(t); }
}

async function gemini(key, model, system, input, ms) {
  const cfg = { temperature: 0, maxOutputTokens: 8000, responseMimeType: 'application/json' };
  if (!/2\.0/.test(model)) cfg.thinkingConfig = { thinkingBudget: 0 };
  const { r, j } = await timed(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }], generationConfig: cfg }),
  }, ms);
  if (!r.ok) throw new Error(r.status + ' ' + ((j.error && j.error.message) || '').slice(0, 80));
  const text = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map((p) => p.text || '').join('');
  const o = JSON.parse(text); return Array.isArray(o) ? o : o.t;
}

async function groq(key, model, system, input, ms) {
  const { r, j } = await timed('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({ model, temperature: 0, max_tokens: 8000, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system + '\nWrap the array as {"t": [...]}.' }, { role: 'user', content: JSON.stringify(input) }] }),
  }, ms);
  if (!r.ok) throw new Error(r.status + ' ' + ((j.error && j.error.message) || '').slice(0, 80));
  const o = JSON.parse(j.choices[0].message.content);
  return Array.isArray(o) ? o : o.t;
}

const ok = (input, out) => Array.isArray(out) && out.length === input.length && out.every((s, i) => typeof s === 'string' && s.trim() &&
  ((input[i].match(/\{\d+\}/g) || []).sort().join() === (s.match(/\{\d+\}/g) || []).sort().join()) &&
  ((input[i].match(/<\/?\d+\/?>/g) || []).sort().join() === (s.match(/<\/?\d+\/?>/g) || []).sort().join()));

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const lang = String((req.query && req.query.l) || '');
  if (!LANGS[lang]) return res.status(400).json({ error: 'language' });
  let input;
  try { input = decode(String(req.query.q || '')); } catch (e) { return res.status(400).json({ error: 'bad q' }); }
  if (!Array.isArray(input) || !input.length || input.length > 60 || input.some((s) => typeof s !== 'string' || s.length > 700) || JSON.stringify(input).length > 6000)
    return res.status(400).json({ error: 'too much text' });
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0] || 'x';
  if (limited(ip)) return res.status(429).json({ error: 'slow down' });
  const { GEMINI_API_KEY: gk, GROQ_API_KEY: qk } = process.env;
  const system = SYSTEM(lang), t0 = Date.now(), why = [];
  const steps = [];
  if (gk) steps.push(['g:' + GEMINI[0], (ms) => gemini(gk, GEMINI[0], system, input, ms)]);
  if (qk) steps.push(['q:' + GROQ[0], (ms) => groq(qk, GROQ[0], system, input, ms)]);
  if (gk) GEMINI.slice(1).forEach((m) => steps.push(['g:' + m, (ms) => gemini(gk, m, system, input, ms)]));
  if (qk) GROQ.slice(1).forEach((m) => steps.push(['q:' + m, (ms) => groq(qk, m, system, input, ms)]));
  let out;
  for (const [name, step] of steps) {
    const left = 52000 - (Date.now() - t0); if (left < 4000) break; // stay inside Vercel's 60 s limit
    try { out = await step(Math.min(22000, left)); if (ok(input, out)) break; why.push(name + ' bad output'); out = null; }
    catch (e) { why.push(name + ' ' + String((e && e.message) || e).slice(0, 60)); out = null; }
  }
  if (!out) { res.setHeader('Cache-Control', 'no-store'); console.log('tr busy', lang, why.join(' | ')); return res.status(503).json({ error: 'busy', why: why.map((w) => w.split(' ').slice(0, 2).join(' ')) }); }
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, stale-while-revalidate=31536000');
  return res.status(200).json({ t: out.map((s) => s.trim()) });
}
