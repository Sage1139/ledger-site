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

async function gemini(key, system, input) {
  const models = ['gemini-flash-lite-latest', 'gemini-flash-latest'];
  let last;
  for (const model of models) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 25000);
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 8000, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } } }),
      });
      clearTimeout(t);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { last = new Error(model + ': ' + ((j.error && j.error.message) || r.status)); continue; }
      const text = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map((p) => p.text || '').join('');
      return JSON.parse(text);
    } catch (e) { clearTimeout(t); last = e; }
  }
  throw last || new Error('gemini failed');
}

async function groq(key, system, input) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({ model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b', temperature: 0, max_tokens: 8000, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system + '\nWrap the array as {"t": [...]}.' }, { role: 'user', content: JSON.stringify(input) }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error && j.error.message) || 'groq ' + r.status);
  const o = JSON.parse(j.choices[0].message.content);
  return Array.isArray(o) ? o : o.t;
}

const ok = (input, out) => Array.isArray(out) && out.length === input.length && out.every((s, i) => typeof s === 'string' && s.trim() &&
  ((input[i].match(/\{\d+\}/g) || []).sort().join() === (s.match(/\{\d+\}/g) || []).sort().join()));

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
  const system = SYSTEM(lang);
  let out;
  for (const step of [gk && (() => gemini(gk, system, input)), qk && (() => groq(qk, system, input)), gk && (() => gemini(gk, system, input))].filter(Boolean)) {
    try { out = await step(); if (ok(input, out)) break; out = null; } catch (e) { out = null; }
  }
  if (!out) { res.setHeader('Cache-Control', 'no-store'); return res.status(503).json({ error: 'busy' }); }
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, stale-while-revalidate=31536000');
  return res.status(200).json({ t: out.map((s) => s.trim()) });
}
