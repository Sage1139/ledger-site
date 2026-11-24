// Daily ping (Vercel Cron, see vercel.json) so the free Supabase project never pauses for inactivity.
// It makes one tiny database request; nothing is read or changed (visitors can't read that table).
export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(503).json({ ok: false, error: 'not_configured' });
  try {
    const r = await fetch(url + '/rest/v1/user_state?select=key&limit=1', { headers: { apikey: key, Authorization: 'Bearer ' + key } });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, db: r.status, at: new Date().toISOString() });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e.message || e).slice(0, 120) });
  }
}
