// Public, browser-safe settings. The Supabase "anon" key is designed to be public: every table is protected by
// Row Level Security, so a visitor can only ever read or write their own rows.
// Set in Vercel → Settings → Environment Variables: SUPABASE_URL, SUPABASE_ANON_KEY
export default function handler(req, res) {
  const url = process.env.SUPABASE_URL || '', key = process.env.SUPABASE_ANON_KEY || '';
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.status(200).json({ auth: !!(url && key), supabaseUrl: url, supabaseAnonKey: key });
}
