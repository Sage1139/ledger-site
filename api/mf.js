// Vercel serverless function — free mutual fund data (official AMFI NAVs via mfapi.in).
// GET /api/mf?q=parag parikh          -> search: [{code, name}]
// GET /api/mf?code=122639             -> {code, name, house, category, navs:[{t, nav}] oldest first, daily}
const BASE = 'https://api.mfapi.in/mf';

export default async function handler(req, res) {
  const q = req.query || {};
  try {
    if (q.q) {
      const term = String(q.q).slice(0, 60);
      const r = await fetch(`${BASE}/search?q=${encodeURIComponent(term)}`);
      if (!r.ok) throw new Error('search ' + r.status);
      const list = (await r.json()).filter((f) => /direct/i.test(f.schemeName) && /growth/i.test(f.schemeName)).slice(0, 15).map((f) => ({ code: f.schemeCode, name: f.schemeName }));
      res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=86400');
      return res.status(200).json({ results: list });
    }
    const code = parseInt(q.code, 10);
    if (!code) return res.status(400).json({ error: 'Pass ?q= to search or ?code= for NAV history' });
    const r = await fetch(`${BASE}/${code}`);
    if (!r.ok) throw new Error('nav ' + r.status);
    const j = await r.json();
    if (!j.data || !j.data.length) throw new Error('no NAV data');
    const navs = j.data.map((d) => { const [dd, mm, yy] = d.date.split('-').map(Number); return { t: Date.UTC(yy, mm - 1, dd), nav: parseFloat(d.nav) }; })
      .filter((d) => d.nav > 0).sort((a, b) => a.t - b.t);
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=43200');
    return res.status(200).json({ code, name: j.meta.scheme_name, house: j.meta.fund_house, category: j.meta.scheme_category, navs });
  } catch (e) {
    return res.status(502).json({ error: 'Fund data unavailable right now', detail: String(e.message || e) });
  }
}
