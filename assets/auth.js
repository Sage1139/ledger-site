/* ===== LEDGER accounts: sign-in (Supabase) + syncing progress across devices =====
   Works without an account too: everything is kept in this browser until you sign in. */
(() => {
  const SYNC_KEYS = ['ledger.done2', 'ledger.sim.v1', 'ledger.lang', 'ledger.level'];
  const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js';
  const listeners = []; let client = null, user = null, ready = false, configured = false;
  const meta = () => L.store.get('ledger.sync.meta', {}); // key -> last local change time
  const setMeta = (m) => { try { localStorage.setItem('ledger.sync.meta', JSON.stringify(m)); } catch (e) {} };

  function emit() { listeners.forEach((f) => { try { f(user); } catch (e) {} }); navButton(); }
  function loadScript(src) { return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.append(s); }); }

  // remember when each synced setting last changed locally, and upload it shortly after (when signed in)
  const origSet = L.store.set.bind(L.store); let pending = new Set(), timer;
  L.store.set = (k, v) => { origSet(k, v); if (SYNC_KEYS.includes(k)) { const m = meta(); m[k] = Date.now(); setMeta(m); if (user) { pending.add(k); clearTimeout(timer); timer = setTimeout(push, 1500); } } };

  async function push() {
    if (!user || !pending.size) return; const keys = [...pending]; pending.clear(); const m = meta();
    const rows = keys.map((k) => ({ user_id: user.id, key: k, value: { v: L.store.get(k, null) }, updated_at: new Date(m[k] || Date.now()).toISOString() }));
    const { error } = await client.from('user_state').upsert(rows); if (error) { keys.forEach((k) => pending.add(k)); console.warn('sync', error.message); }
  }
  const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, key) => ((o[key] = x[key]), o), {}) : x)); // the database may reorder object keys
  const same = (a, b) => stable(a) === stable(b);
  async function pull() { // merge: whichever side changed most recently wins; finished lessons are combined from both
    const { data, error } = await client.from('user_state').select('key,value,updated_at'); if (error) return console.warn('sync', error.message);
    const m = meta(); let changed = false;
    const server = Object.fromEntries((data || []).map((r) => [r.key, r]));
    for (const k of SYNC_KEYS) {
      const s = server[k], local = L.store.get(k, null), lt = m[k] || 0, st = s ? Date.parse(s.updated_at) : 0;
      if (k === 'ledger.done2' && s) { const merged = { ...(s.value.v || {}), ...(local || {}) }; if (!same(merged, local)) { origSet(k, merged); changed = true; } if (!same(merged, s.value.v)) pending.add(k); continue; }
      if (s && st > lt) { if (!same(s.value.v, local)) { origSet(k, s.value.v); m[k] = st; changed = true; } }
      else if (local != null && lt > st) pending.add(k);
    }
    setMeta(m); await push();
    if (changed && !sessionStorage.getItem('ledger.synced')) { sessionStorage.setItem('ledger.synced', '1'); location.reload(); } // show the synced data
  }

  async function init() {
    try {
      const cfg = await fetch('/api/config').then((r) => r.json());
      configured = !!cfg.auth; if (!configured) { ready = true; return emit(); }
      await loadScript(SDK);
      client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } });
      const { data } = await client.auth.getSession(); user = data.session ? data.session.user : null;
      client.auth.onAuthStateChange((ev, session) => { const was = user && user.id; user = session ? session.user : null; if (user && user.id !== was) pull(); emit(); });
      ready = true; emit(); if (user) pull();
    } catch (e) { console.warn('auth init', e); ready = true; emit(); }
  }

  // small account button in the floating nav
  function navButton() {
    const nav = document.querySelector('.nav'); if (!nav) return;
    let b = nav.querySelector('.acct-btn');
    if (!b) { b = document.createElement('a'); b.className = 'acct-btn'; const row = nav.querySelector('.row'); row.insertBefore(b, row.firstChild); }
    if (user) { const n = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || user.email || 'Me', pic = user.user_metadata && user.user_metadata.avatar_url;
      b.href = '/account/'; b.title = 'Your account'; b.innerHTML = pic ? `<img src="${pic}" alt="" referrerpolicy="no-referrer">` : `<span>${n.trim()[0].toUpperCase()}</span>`; b.classList.add('in'); }
    else { b.href = '/account/login.html?next=' + encodeURIComponent(location.pathname + location.search); b.textContent = 'Sign in'; b.classList.remove('in'); }
  }
  const st = document.createElement('style');
  st.textContent = `.acct-btn{font-size:14px;color:var(--dim);padding:9px 14px;border-radius:999px;transition:color .2s}.acct-btn:hover{color:var(--fg)}
  .acct-btn.in{padding:0;width:36px;height:36px;border-radius:50%;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--g1),var(--g2));color:#000;font-weight:800;border:2px solid rgba(255,255,255,.2)}
  .acct-btn.in img{width:100%;height:100%;object-fit:cover}`;
  document.head.append(st);

  const err = (e) => { throw new Error((e && e.message) || 'Something went wrong'); };
  window.LAuth = {
    get user() { return user; }, get ready() { return ready; }, get configured() { return configured; }, get client() { return client; },
    onChange(f) { listeners.push(f); if (ready) f(user); },
    async google(next) { const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + (next || '/account/') } }); if (error) err(error); },
    async signIn(email, password) { const { error } = await client.auth.signInWithPassword({ email, password }); if (error) err(error); },
    async signUp(email, password, name) { const { data, error } = await client.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: location.origin + '/account/' } }); if (error) err(error); return data; },
    async reset(email) { const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/account/login.html?mode=newpass' }); if (error) err(error); },
    async newPassword(password) { const { error } = await client.auth.updateUser({ password }); if (error) err(error); },
    async signOut() { await push(); await client.auth.signOut(); sessionStorage.removeItem('ledger.synced'); },
    async deleteData() { const { error } = await client.from('user_state').delete().eq('user_id', user.id); if (error) err(error); },
    syncNow: async () => { SYNC_KEYS.forEach((k) => pending.add(k)); await push(); },
  };
  init();
})();
