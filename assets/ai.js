/* ===== LEDGER AI tutor: floating chat on every page, answers in the learner's language ===== */
(() => {
  const LANGS = [['en', 'English'], ['hi', 'हिन्दी Hindi'], ['ta', 'தமிழ் Tamil'], ['te', 'తెలుగు Telugu'], ['kn', 'ಕನ್ನಡ Kannada'], ['ml', 'മലയാളം Malayalam'], ['bn', 'বাংলা Bengali'], ['mr', 'मराठी Marathi'], ['gu', 'ગુજરાતી Gujarati'], ['pa', 'ਪੰਜਾਬੀ Punjabi'], ['or', 'ଓଡ଼ିଆ Odia'], ['hinglish', 'Hinglish'], ['tanglish', 'Tanglish']];
  const store = typeof L !== 'undefined' ? L.store : { get: (k, d) => d, set() {} }; // L is a top-level const, not a window property
  let lang = store.get('ledger.lang', 'en'), msgs = [], busy = false;
  const css = `
  .ai-fab{position:fixed;right:20px;bottom:20px;z-index:150;display:flex;align-items:center;gap:8px;padding:13px 20px;border-radius:999px;background:linear-gradient(135deg,#00e38c,#00b3ff);color:#000;font-weight:700;font-size:14px;box-shadow:0 14px 40px -10px rgba(0,227,140,.6);transition:transform .25s}
  .ai-fab:hover{transform:translateY(-3px) scale(1.03)}
  .ai-fab.hide{transform:scale(0);pointer-events:none}
  .ai-panel{position:fixed;right:20px;bottom:20px;z-index:160;width:400px;max-width:calc(100vw - 24px);height:min(620px,calc(100vh - 40px));display:flex;flex-direction:column;border-radius:22px;background:rgba(14,14,18,.92);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,.14);box-shadow:0 40px 100px -20px rgba(0,0,0,.8);transform-origin:bottom right;transform:scale(.9);opacity:0;pointer-events:none;transition:all .3s cubic-bezier(.16,1,.3,1)}
  .ai-panel.on{transform:none;opacity:1;pointer-events:auto}
  .ai-hd{display:flex;align-items:center;gap:10px;padding:14px 14px 12px 18px;border-bottom:1px solid rgba(255,255,255,.08)}
  .ai-hd b{font-size:15px;flex:1}.ai-hd b small{display:block;font-weight:400;font-size:11px;color:#86868b}
  .ai-hd select{background:#0c0c0f;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:6px 8px;color:#f5f5f7;font-size:12px;max-width:150px}
  .ai-x{width:30px;height:30px;border-radius:50%;color:#86868b;font-size:16px}.ai-x:hover{background:rgba(255,255,255,.08);color:#fff}
  .ai-body{flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:12px}
  .ai-m{max-width:88%;padding:11px 14px;border-radius:16px;font-size:14px;line-height:1.6;white-space:normal;word-wrap:break-word}
  .ai-m.u{align-self:flex-end;background:#00e38c;color:#000;border-bottom-right-radius:5px}
  .ai-m.a{align-self:flex-start;background:#1a1a1f;border:1px solid rgba(255,255,255,.08);border-bottom-left-radius:5px;color:#e5e5ea}
  .ai-m.a ul{margin:6px 0 6px 18px}.ai-m.a b{color:#fff}
  .ai-m.err{border-color:rgba(255,69,58,.4)}
  .ai-dots span{display:inline-block;width:7px;height:7px;margin:0 2px;border-radius:50%;background:#86868b;animation:aib 1s infinite}
  .ai-dots span:nth-child(2){animation-delay:.15s}.ai-dots span:nth-child(3){animation-delay:.3s}
  @keyframes aib{0%,80%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-4px)}}
  .ai-sug{display:flex;gap:6px;flex-wrap:wrap;padding:0 16px 10px}
  .ai-sug button{font-size:12px;padding:7px 11px;border-radius:999px;border:1px solid rgba(255,255,255,.16);color:#d4d4d9;text-align:left}
  .ai-sug button:hover{border-color:#00e38c;color:#fff}
  .ai-in{display:flex;gap:8px;padding:12px;border-top:1px solid rgba(255,255,255,.08)}
  .ai-in textarea{flex:1;resize:none;height:44px;max-height:120px;background:#0c0c0f;border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:11px 14px;color:#f5f5f7;font:inherit;font-size:14px;outline:none}
  .ai-in textarea:focus{border-color:#00e38c}
  .ai-in button{width:44px;border-radius:14px;background:#00e38c;color:#000;font-weight:800;font-size:18px}
  .ai-in button[disabled]{opacity:.4}
  .ai-note{font-size:10.5px;color:#6e6e75;text-align:center;padding:0 14px 10px}
  .ai-note a{color:#00e38c}
  .ai-cta{display:inline-block;margin-top:10px;padding:9px 14px;border-radius:999px;background:#00e38c;color:#000!important;font-weight:700;font-size:13px}
  @media(max-width:600px){.ai-panel{right:8px;bottom:8px;left:8px;width:auto;height:calc(100vh - 90px)}.ai-fab{right:14px;bottom:14px;padding:12px 16px}}`;
  const st = document.createElement('style'); st.textContent = css; document.head.append(st);

  const fab = document.createElement('button'); fab.className = 'ai-fab'; fab.innerHTML = '✦ Ask AURORA'; fab.setAttribute('aria-label', 'Ask AURORA, the AI tutor');
  const p = document.createElement('div'); p.className = 'ai-panel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'AURORA AI tutor');
  p.innerHTML = `<div class="ai-hd"><span style="font-size:20px">✦</span><b>AURORA<small>Your market tutor · answers in your language</small></b>
    <select aria-label="Language">${LANGS.map(([k, n]) => `<option value="${k}" ${k === lang ? 'selected' : ''}>${n}</option>`).join('')}</select><button class="ai-x" aria-label="Close">✕</button></div>
    <div class="ai-body"></div><div class="ai-sug"></div>
    <div class="ai-in"><textarea placeholder="Type your question… (any language)" rows="1"></textarea><button aria-label="Send">↑</button></div>
    <div class="ai-note">For learning only, not investment advice. Never share OTPs, passwords or bank details.</div>`;
  document.body.append(fab, p);
  const body = p.querySelector('.ai-body'), ta = p.querySelector('textarea'), send = p.querySelector('.ai-in button'), sel = p.querySelector('select'), sug = p.querySelector('.ai-sug');

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function md(s) {
    const lines = esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>').split('\n');
    let out = '', inList = false;
    lines.forEach((l) => { const m = l.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)/); if (m) { if (!inList) { out += '<ul>'; inList = true; } out += `<li>${m[1]}</li>`; } else { if (inList) { out += '</ul>'; inList = false; } out += l.trim() ? l.replace(/^#+\s*/, '') + '<br>' : '<br>'; } });
    return (inList ? out + '</ul>' : out).replace(/(<br>)+$/, '');
  }
  function bubble(role, text, cls = '') { const d = document.createElement('div'); d.className = `ai-m ${role === 'user' ? 'u' : 'a'} ${cls}`; d.innerHTML = role === 'user' ? esc(text) : md(text); body.append(d); body.scrollTop = body.scrollHeight; return d; }
  function context() {
    let c = '';
    try { c = typeof window.AI_CONTEXT === 'function' ? window.AI_CONTEXT() : ''; } catch (e) {}
    if (!c) { const h = document.querySelector('h1'); c = `Page: ${document.title}. Heading: ${h ? h.innerText.replace(/\s+/g, ' ') : ''}`; }
    return c.slice(0, 2800);
  }
  const DEFAULT_SUG = ['Explain this page in very simple words', 'What is the stock market?', 'What is SIP?', 'What is the difference between a share and a mutual fund?'];
  function suggestions() { const s = (typeof window.AI_SUGGEST === 'function' ? window.AI_SUGGEST() : null) || DEFAULT_SUG; sug.innerHTML = s.slice(0, 4).map((x) => `<button>${esc(x)}</button>`).join(''); }
  sug.onclick = (e) => { const b = e.target.closest('button'); if (b) ask(b.textContent); };
  const me = () => !!(window.LAuth && LAuth.configured && LAuth.user);
  const loginUrl = () => '/account/login.html?mode=up&next=' + encodeURIComponent(location.pathname + location.search);
  function note() { // guests see a short taste; a free account unlocks full answers
    const n = p.querySelector('.ai-note'), base = 'For learning only, not investment advice. Never share OTPs, passwords or bank details.';
    n.innerHTML = window.LAuth && LAuth.configured && !LAuth.user ? `Guest mode: short answers only. <a href="${loginUrl()}">Sign in free</a> for full answers.<br>${base}` : base;
  }
  async function token() { try { if (me()) { const { data } = await LAuth.client.auth.getSession(); return (data.session && data.session.access_token) || ''; } } catch (e) {} return ''; }
  function greet() { if (body.children.length) return; bubble('assistant', lang === 'en' ? "Hi! 👋 I'm your tutor. Ask me anything about stocks, mutual funds, SIP or F&O. I can see which page you're on, so you can just say **\"explain this\"**." : 'Hi! 👋 Ask me anything. I\'ll reply in your chosen language.'); }

  async function ask(q) {
    q = (q || ta.value).trim(); if (!q || busy) return;
    ta.value = ''; ta.style.height = ''; busy = true; send.disabled = true; sug.innerHTML = '';
    bubble('user', q); msgs.push({ role: 'user', content: q });
    const wait = bubble('assistant', ''); wait.innerHTML = '<span class="ai-dots"><span></span><span></span><span></span></span>';
    const slow = setTimeout(() => { if (wait.querySelector('.ai-dots')) wait.insertAdjacentHTML('beforeend', '<div style="font-size:12px;color:#86868b;margin-top:6px">Lots of people are asking right now. Trying a faster model…</div>'); }, 7000);
    try {
      const tok = await token(), headers = { 'Content-Type': 'application/json' }; if (tok) headers.Authorization = 'Bearer ' + tok;
      const r = await fetch('/api/ask', { method: 'POST', headers, body: JSON.stringify({ messages: msgs.slice(-10), lang, context: context() }) });
      let j = {}; try { j = await r.json(); } catch (e) {}
      if (r.status === 503 && j.error === 'not_configured') throw new Error("AURORA isn't switched on yet. The site owner needs to add a free API key. Meanwhile, the **?** buttons and lessons explain every concept.");
      if (!r.ok) throw new Error(j.error || 'Something went wrong. Please try again.');
      wait.innerHTML = md(j.reply); msgs.push({ role: 'assistant', content: j.reply });
      if (j.signin) wait.insertAdjacentHTML('beforeend', `<div><a class="ai-cta" href="${loginUrl()}">🔓 Sign in free for the full answer</a></div>`);
    } catch (e) {
      wait.classList.add('err'); wait.innerHTML = md(e.message.includes('fetch') ? 'Could not reach the tutor. Check your internet and try again.' : e.message); msgs.pop();
    }
    clearTimeout(slow); busy = false; send.disabled = false; body.scrollTop = body.scrollHeight; suggestions(); ta.focus();
  }
  function open(q) { p.classList.add('on'); fab.classList.add('hide'); note(); greet(); suggestions(); if (q) ask(q); else setTimeout(() => ta.focus(), 200); }
  function close() { p.classList.remove('on'); fab.classList.remove('hide'); }
  fab.onclick = () => open(); p.querySelector('.ai-x').onclick = close;
  send.onclick = () => ask();
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } if (e.key === 'Escape') close(); e.stopPropagation(); });
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; });
  sel.onchange = () => { lang = sel.value; store.set('ledger.lang', lang); document.dispatchEvent(new CustomEvent('ledger:lang', { detail: lang })); };
  window.LedgerAI = { open, ask: (q) => open(q), lang: () => lang, langName: () => (LANGS.find((l) => l[0] === lang) || LANGS[0])[1], setLang: (l) => { lang = l; sel.value = l; store.set('ledger.lang', l); }, LANGS };
  document.dispatchEvent(new Event('ledger:ai-ready'));
})();
