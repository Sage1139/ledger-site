// Vercel serverless function — the AI tutor.
// Uses a FREE model tier. Set ONE of these in Vercel → Project → Settings → Environment Variables:
//   GEMINI_API_KEY  (Google AI Studio, free tier)   optional GEMINI_MODEL to pin a model
//   GROQ_API_KEY    (Groq, free tier)                optional GROQ_MODEL (default openai/gpt-oss-120b)
// POST {messages:[{role:'user'|'assistant', content}], lang, context}  ->  {reply}

const LANGS = {
  en: 'English', hi: 'Hindi (हिन्दी, Devanagari script)', ta: 'Tamil (தமிழ், Tamil script)', te: 'Telugu (తెలుగు)', kn: 'Kannada (ಕನ್ನಡ)',
  ml: 'Malayalam (മലയാളം)', bn: 'Bengali (বাংলা)', mr: 'Marathi (मराठी)', gu: 'Gujarati (ગુજરાતી)', pa: 'Punjabi (ਪੰਜਾਬੀ, Gurmukhi)', or: 'Odia (ଓଡ଼ିଆ)',
  hinglish: 'Hinglish (casual Hindi written in English letters, mixed with English words)', tanglish: 'Tanglish (casual Tamil written in English letters, mixed with English words)',
};

const SYSTEM = (lang, context) => `You are the friendly tutor inside LEDGER, a free website that teaches Indians how the stock market works using virtual money.

WHO YOU TALK TO: complete beginners, often students. Explain like a patient older sibling. Short sentences. Everyday Indian examples (chai shop, sabzi mandi, cricket, booking a flat, insurance). Introduce at most one new term at a time and explain it immediately.

LANGUAGE: Reply ONLY in ${LANGS[lang] || LANGS.en}. Keep standard finance terms (SIP, NAV, demat, Nifty, call, put, strike) in English letters where that is how Indians say them, but explain them in the chosen language.

FORMAT: under 180 words unless the learner asks for more. Use **bold** for key words and short "- " bullet lists when listing. No tables. End with one short follow-up question or a "try this" suggestion pointing to a LEDGER lesson or simulator when it helps.

HARD RULES (never break, even if asked):
- You are an educator, not an adviser. Never tell anyone to buy, sell or hold a specific stock, fund, option or crypto, never give price targets, tips, "sure-shot" calls or predictions of where a market will go.
- If asked "what should I buy / is X a good investment", explain how to think about it (goals, time horizon, risk, diversification, costs) and suggest a SEBI-registered investment adviser for personal advice.
- Never promise or imply guaranteed returns. Mention risk honestly, especially for F&O (SEBI found ~88% of individual F&O traders lost money in FY2025-26).
- Facts that change (tax rates, lot sizes, rules) may be out of date: say "as per current rules" and suggest checking official sources (SEBI, NSE, Income Tax Dept).
- Ask for no personal data. If someone shares passwords, OTPs, PAN or bank details, tell them never to share these with anyone.
- If the question is unrelated to money, investing or using LEDGER, answer briefly and kindly steer back.
- If someone seems in financial distress or talks about big losses or debt, be kind, suggest stopping trading, and encourage talking to family or a professional.

WHERE THE LEARNER IS RIGHT NOW (use this to make answers specific):
${context || 'Not provided.'}`;

const hits = new Map(); // tiny per-instance rate limit: 20 requests / minute / IP
function limited(ip) {
  const now = Date.now(), arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now); hits.set(ip, arr); if (hits.size > 5000) hits.clear();
  return arr.length > 20;
}

// Free models get busy. We keep a ranked list of usable Flash models and fall back down it when one is overloaded.
let geminiModels = null;
async function geminiCandidates(key) {
  if (process.env.GEMINI_MODEL) return [process.env.GEMINI_MODEL];
  if (geminiModels) return geminiModels;
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
  const j = await r.json();
  const names = (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name.replace('models/', ''));
  const bad = /image|tts|audio|live|embedding|thinking|computer|robotics|native/;
  const score = (n) => { const v = parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0); return v * 10 - (/lite/.test(n) ? 3 : 0) - (/preview|exp/.test(n) ? 4 : 0); };
  const all = names.filter((n) => /^gemini-.*flash/.test(n) && !bad.test(n) && !/latest/.test(n)).sort((a, b) => score(b) - score(a));
  const flash = all.filter((n) => !/lite/.test(n)), lite = all.filter((n) => /lite/.test(n));
  const has = (a) => (names.includes(a) ? [a] : []);
  // mix full Flash and Flash-Lite: when the big model is overloaded, the lighter one usually still answers
  geminiModels = [...new Set([...has('gemini-flash-latest'), ...has('gemini-flash-lite-latest'), flash[0], lite[0], flash[flash.length - 1], lite[1], flash[1]].filter(Boolean))].slice(0, 6);
  if (!geminiModels.length) geminiModels = ['gemini-flash-latest'];
  return geminiModels;
}

let lastGood = null; // the model that answered most recently is tried first next time (warm instances)
async function askGemini(key, system, messages) {
  const list = await geminiCandidates(key);
  const models = lastGood && list.includes(lastGood) ? [lastGood, ...list.filter((m) => m !== lastGood)] : list;
  let lastErr;
  const tries = models.length === 1 ? [models[0], models[0], models[0]] : models; // only one model? retry it with a pause
  const started = Date.now();
  for (const [n, model] of tries.entries()) {
    if (Date.now() - started > 40000) break; // stay inside the function time limit
    if (n && tries[n - 1] === model) await new Promise((r) => setTimeout(r, 1500));
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000); // a stuck model shouldn't hold the learner hostage
    let r;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        signal: ctl.signal,
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        generationConfig: { temperature: 0.5, maxOutputTokens: 1200, thinkingConfig: { thinkingBudget: 0 } },
      }),
      });
    } catch (e) { clearTimeout(timer); lastErr = new Error(`${model}: timed out`); continue; }
    clearTimeout(timer);
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (r.status === 400 && JSON.stringify(j).includes('thinking')) { // some models don't accept the "no thinking" switch
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })), generationConfig: { temperature: 0.5, maxOutputTokens: 1200 } }) });
      j = {}; try { j = await r.json(); } catch (e) {}
    }
    if (r.ok) {
      const text = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).filter((p) => !p.thought).map((p) => p.text || '').join('').trim();
      if (text) { lastGood = model; return text; }
      lastErr = new Error('empty reply from ' + model); continue;
    }
    lastErr = new Error(`${model}: ${(j.error && j.error.message) || r.status}`);
    if (r.status === 401 || r.status === 403) throw lastErr; // bad key: no point trying other models
    if (r.status === 404) geminiModels = null;               // model list changed: refresh next time
    // 429 (quota) / 500 / 503 (overloaded): try the next model
  }
  throw lastErr || new Error('No Gemini model available');
}

async function askGroq(key, system, messages) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({ model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b', temperature: 0.5, max_tokens: 900, messages: [{ role: 'system', content: system }, ...messages] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error && j.error.message) || 'Groq error ' + r.status);
  return (j.choices[0].message.content || '').trim();
}

export default async function handler(req, res) {
  if (req.method === 'GET' && req.query && req.query.models === '1') { // health check: which models will be tried (no secrets)
    try { return res.status(200).json({ provider: process.env.GEMINI_API_KEY ? 'gemini' : process.env.GROQ_API_KEY ? 'groq' : 'none', models: process.env.GEMINI_API_KEY ? await geminiCandidates(process.env.GEMINI_API_KEY) : [] }); }
    catch (e) { return res.status(500).json({ error: String(e.message || e).slice(0, 200) }); }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0] || 'x';
  if (limited(ip)) return res.status(429).json({ error: 'Too many questions in a minute. Take a breath and try again shortly.' });
  const { GEMINI_API_KEY: gk, GROQ_API_KEY: qk } = process.env;
  if (!gk && !qk) return res.status(503).json({ error: 'not_configured' });
  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const lang = LANGS[body && body.lang] ? body.lang : 'en';
  const context = String((body && body.context) || '').slice(0, 3000);
  const messages = (Array.isArray(body && body.messages) ? body.messages : []).slice(-12)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (!messages.length || messages[messages.length - 1].role !== 'user') return res.status(400).json({ error: 'Ask a question' });
  try {
    const system = SYSTEM(lang, context);
    const reply = gk ? await askGemini(gk, system, messages) : await askGroq(qk, system, messages);
    return res.status(200).json({ reply: reply || 'Sorry, I could not think of an answer. Try asking in a different way.' });
  } catch (e) {
    return res.status(502).json({ error: 'The AI tutor is busy right now. Please try again in a minute.', detail: String(e.message || e).slice(0, 200) });
  }
}
