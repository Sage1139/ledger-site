// Vercel serverless function: the saved translations for one language, for the site's language switcher.
// GET /api/dict?l=ta  ->  { "English text": "translation", ... }
// Translations live in the Supabase table public.i18n (readable by anyone, written only from the dashboard).
// The answer is cached on Vercel's CDN for 10 minutes, so pages switch language instantly.
export default async function handler(req, res) {
  const lang = String((req.query && req.query.l) || '');
  if (!/^(ta|ml|hi|te)$/.test(lang)) return res.status(400).json({ error: 'language' });
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(200).json({});
  try {
    const r = await fetch(`${url}/rest/v1/rpc/i18n_dict`, { method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ l: lang }) });
    if (!r.ok) throw new Error('supabase ' + r.status);
    const dict = await r.json();
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400');
    return res.status(200).json(dict || {});
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({});
  }
}
