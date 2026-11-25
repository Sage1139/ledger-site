/* ===== LEDGER languages: shows the whole site in Tamil, Malayalam, Hindi or Telugu =====
   How it works: every piece of English text on the page (including text the simulators and lessons draw later)
   is looked up in a saved dictionary; anything new is translated once by /api/tr (cached on the CDN for everyone)
   and remembered in this browser. Numbers are kept out of the text being translated, so live prices never
   need translating. English is the original and is never changed. Brand, fonts and layout stay LEDGER. */
(() => {
  const LANGS = { en: ['English', 'Language'], ta: ['தமிழ்', 'மொழி', 'Tamil'], ml: ['മലയാളം', 'ഭാഷ', 'Malayalam'], hi: ['हिन्दी', 'भाषा', 'Hindi'], te: ['తెలుగు', 'భాష', 'Telugu'] };
  const FONTS = { ta: 'Noto Sans Tamil', ml: 'Noto Sans Malayalam', hi: 'Noto Sans Devanagari', te: 'Noto Sans Telugu' };
  const NOTE = { ta: 'AI மூலம் மொழிபெயர்க்கப்பட்டது', ml: 'AI ഉപയോഗിച്ച് വിവർത്തനം ചെയ്തത്', hi: 'AI द्वारा अनुवादित', te: 'AI ద్వారా అనువదించబడింది' };
  const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  let lang = 'en'; try { lang = JSON.parse(ls.get('ledger.ui') || '"en"'); } catch (e) {} if (!LANGS[lang]) lang = 'en';
  const root = document.documentElement;

  function setLang(l) {
    if (!LANGS[l] || l === lang) return;
    ls.set('ledger.ui', JSON.stringify(l));
    try { if (typeof L !== 'undefined') L.store.set('ledger.ui', l); } catch (e) {} // syncs to the account when signed in
    if (l !== 'en') { try { if (typeof L !== 'undefined') L.store.set('ledger.lang', l); else ls.set('ledger.lang', JSON.stringify(l)); } catch (e) {} } // AURORA answers in the same language
    location.reload();
  }

  /* ---------- language button in the nav ---------- */
  const css = document.createElement('style');
  css.textContent = `.i18n-btn{display:inline-flex;align-items:center;gap:7px;font-size:13px;color:var(--dim);padding:8px 12px;border-radius:999px;border:1px solid var(--line2);white-space:nowrap;transition:color .2s,border-color .2s}
  .i18n-btn:hover{color:var(--fg);border-color:var(--fg)}.i18n-btn svg{width:15px;height:15px;flex:none}
  .i18n-wrap{position:relative}.i18n-menu{position:absolute;right:0;top:calc(100% + 10px);min-width:200px;padding:6px;border-radius:16px;background:rgba(14,14,18,.97);border:1px solid var(--line2);box-shadow:0 24px 60px -20px rgba(0,0,0,.8);display:none;z-index:80}
  .i18n-menu.on{display:block}.i18n-menu button{display:flex;justify-content:space-between;gap:16px;width:100%;padding:10px 12px;border-radius:10px;font-size:14px;text-align:left}
  .i18n-menu button:hover{background:rgba(255,255,255,.06)}.i18n-menu button small{color:var(--dim)}.i18n-menu button.on{color:var(--g1)}
  .i18n-note{margin-top:10px;font-size:12px;color:var(--dim2)}.i18n-note button{color:var(--dim);text-decoration:underline;font-size:12px}
  .nav .row{display:flex;align-items:center;gap:8px;flex-wrap:nowrap}
  @media(max-width:520px){.i18n-btn{padding:6px 9px;font-size:11.5px;gap:5px}.i18n-btn svg{display:none}.nav .acct-btn:not(.in){padding:6px 4px;font-size:13px}.nav .logo{font-size:16px}}
  html.indic body,html.indic button,html.indic input,html.indic select,html.indic textarea{font-family:'Inter Tight','${FONTS[lang] || 'Inter Tight'}',system-ui,sans-serif}
  html.indic body *:not(.logo){letter-spacing:0!important}
  html.indic :is(h1,h2,h3,h4){line-height:1.25!important;overflow-wrap:anywhere}
  html.indic h1.big{font-size:clamp(36px,6.5vw,92px)}html.indic h2.big{font-size:clamp(30px,4.4vw,58px)}
  html.indic .kicker{text-transform:none}
  html.tr-wait body{opacity:0}html body{transition:opacity .2s}`;
  document.head.append(css);

  const globe = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/></svg>';
  function addButton() {
    const row = document.querySelector('.nav .row'); if (!row || row.querySelector('.i18n-wrap')) return !!row;
    const w = document.createElement('div'); w.className = 'i18n-wrap'; w.setAttribute('data-notr', '');
    const label = lang === 'en' ? 'Language' : `${LANGS[lang][1]} <span class="w">(Language)</span>`;
    w.innerHTML = `<button class="i18n-btn" aria-haspopup="true" aria-label="Change language">${globe}<span>${label}</span></button>
      <div class="i18n-menu" role="menu">${Object.entries(LANGS).map(([k, v]) => `<button role="menuitem" data-l="${k}" class="${k === lang ? 'on' : ''}"><span>${v[0]}</span><small>${v[2] || ''}</small></button>`).join('')}</div>`;
    row.insertBefore(w, row.firstChild);
    const m = w.querySelector('.i18n-menu');
    w.querySelector('.i18n-btn').onclick = (e) => { e.stopPropagation(); m.classList.toggle('on'); };
    m.onclick = (e) => { const b = e.target.closest('[data-l]'); if (b) setLang(b.dataset.l); };
    document.addEventListener('click', () => m.classList.remove('on'));
    return true;
  }
  if (!addButton()) { const t = setInterval(() => { if (addButton()) clearInterval(t); }, 200); setTimeout(() => clearInterval(t), 10000); }

  window.LedgerI18n = { get lang() { return lang; }, set: setLang, LANGS };
  if (lang === 'en') return;

  /* ---------- translation ---------- */
  root.lang = lang; root.classList.add('indic', 'tr-wait');
  const f = document.createElement('link'); f.rel = 'stylesheet';
  f.href = `https://fonts.googleapis.com/css2?family=${FONTS[lang].replace(/ /g, '+')}:wght@400;500;700;900&display=swap`; document.head.append(f);
  const reveal = () => root.classList.remove('tr-wait');
  setTimeout(reveal, 2500); // never keep the page hidden for long

  const KEY = 'ledger.tr.' + lang;
  let dict = {}; try { dict = JSON.parse(ls.get(KEY) || '{}'); } catch (e) {}
  let saveT; const save = () => { clearTimeout(saveT); saveT = setTimeout(() => ls.set(KEY, JSON.stringify(dict)), 800); };

  const EXCL = 'script,style,noscript,code,pre,textarea,[data-notr],.ai-body,.ai-hd select,.nav .logo,[contenteditable="true"]';
  const NUM = /[-+−]?₹?\d[\d,]*(?:\.\d+)?%?/g;
  const NUMTAG = new RegExp('(<\\/?\\d+\\/?>)|' + NUM.source, 'g');
  const LETTERS = /[A-Za-z]{2,}/;
  const KEEPONLY = /^[A-Z0-9₹%&.,:;!?()/\-+−·•→←↑↓✓✕×' ]+$/; // all-caps tickers, codes, symbols: leave as is
  function template(text) {
    const s = text.replace(/\s+/g, ' ').trim();
    if (!s || !LETTERS.test(s) || s.length > 700) return null;
    if (KEEPONLY.test(s) && (s.match(/[A-Z]{2,}/g) || []).length < 3) return null; // tickers and short codes stay; longer CAPS labels are translated
    const nums = []; const key = s.replace(NUMTAG, (m, tag) => (tag ? tag : `{${nums.push(m) - 1}}`)); // numbers out, formatting tags kept
    return { key, nums };
  }
  const fill = (t, nums) => t.replace(/\{(\d+)\}/g, (m, i) => (nums[i] !== undefined ? nums[i] : m));

  // each translatable spot: a text node, or an attribute of an element
  const done = new WeakMap(); // text node -> translated text we wrote
  const waiting = new Map(); // key -> [apply functions]
  function want(key, apply) { if (dict[key]) return apply(dict[key]); if (!waiting.has(key)) waiting.set(key, []); waiting.get(key).push(apply); queue(); }

  function doText(node) {
    const v = node.nodeValue; if (!v || done.get(node) === v) return;
    const p = node.parentElement; if (!p || p.closest(EXCL)) return;
    const t = template(v); if (!t) return;
    const lead = v.match(/^\s*/)[0], trail = v.match(/\s*$/)[0];
    want(t.key, (tr) => { if (node.nodeValue !== v) return; const out = lead + fill(tr, t.nums) + trail; done.set(node, out); node.nodeValue = out; });
  }
  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  const attrDone = new WeakMap();
  function doAttrs(el) {
    if (el.closest(EXCL)) return;
    for (const a of ATTRS) {
      const v = el.getAttribute(a); if (!v) continue;
      const seen = attrDone.get(el) || {}; if (seen[a] === v) continue;
      const t = template(v); if (!t) continue;
      want(t.key, (tr) => { if (el.getAttribute(a) !== v) return; const out = fill(tr, t.nums); seen[a] = out; attrDone.set(el, seen); el.setAttribute(a, out); });
    }
  }
  /* A sentence with bold/coloured words inside (<b>, <span>, <a>...) is translated as ONE unit, written like
     "Master the <0>market.</0>", so the word order stays natural; the original inline elements are reused. */
  const INLINE = new Set(['B', 'STRONG', 'I', 'EM', 'SPAN', 'A', 'SMALL', 'U', 'MARK', 'SUB', 'SUP', 'ABBR']);
  const simple = (el) => el.tagName === 'BR' || (INLINE.has(el.tagName) && !el.children.length && !el.matches(EXCL));
  function isUnit(el) {
    if (!el.children.length || el.matches(EXCL)) return false;
    let text = false;
    for (const c of el.childNodes) {
      if (c.nodeType === 3) { if (c.nodeValue.trim()) text = true; if (/[<>]/.test(c.nodeValue)) return false; }
      else if (c.nodeType === 1) { if (!simple(c) || /[<>]/.test(c.textContent)) return false; }
    }
    return text;
  }
  const unitOf = (el) => (!el ? null : isUnit(el) ? el : el.parentElement && simple(el) && isUnit(el.parentElement) ? el.parentElement : null);
  function serial(el) { let k = 0; return [...el.childNodes].map((c) => (c.nodeType === 3 ? c.nodeValue : c.nodeType === 1 ? (c.tagName === 'BR' ? `<${k++}/>` : `<${k}>${c.textContent}</${k++}>`) : '')).join(''); }
  const unitDone = new WeakMap();
  function doUnit(el) {
    const v = serial(el); if (unitDone.get(el) === v) return;
    if (el.closest(EXCL)) return;
    const t = template(v); if (!t) return;
    const els = [...el.children];
    want(t.key, (tr) => {
      if (serial(el) !== v) return;
      const out = fill(tr, t.nums), nodes = [], used = new Set(); let last = 0, m; const re = /<(\d+)>([\s\S]*?)<\/\1>|<(\d+)\/>/g;
      while ((m = re.exec(out))) { if (m.index > last) nodes.push(document.createTextNode(out.slice(last, m.index))); const e = els[+(m[1] || m[3])]; if (!e || used.has(e)) return; used.add(e); if (m[1]) e.textContent = m[2]; nodes.push(e); last = re.lastIndex; }
      if (used.size !== els.length || /<\/?\d+\/?>/.test(out.slice(last))) return; // tags didn't come back cleanly: keep the English
      if (last < out.length) nodes.push(document.createTextNode(out.slice(last)));
      const lead = v.match(/^\s*/)[0], trail = v.match(/\s*$/)[0];
      if (nodes[0] && nodes[0].nodeType === 3) nodes[0].nodeValue = lead + nodes[0].nodeValue.trimStart(); else if (lead) nodes.unshift(document.createTextNode(lead));
      const z = nodes[nodes.length - 1]; if (z && z.nodeType === 3) z.nodeValue = z.nodeValue.trimEnd() + trail; else if (trail) nodes.push(document.createTextNode(trail));
      el.replaceChildren(...nodes); unitDone.set(el, serial(el));
    });
  }

  function scan(n) {
    if (n.nodeType === 3) { const u = unitOf(n.parentElement); return u ? doUnit(u) : doText(n); }
    if (n.nodeType !== 1) return;
    if (n.matches(EXCL)) return;
    const u = unitOf(n); if (u) { doUnit(u); if (u !== n) return; }
    if (n.hasAttributes()) doAttrs(n);
    if (u) { [...n.children].forEach((c) => c.hasAttributes() && doAttrs(c)); return; }
    const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: (x) => (x.nodeType === 1 && x.matches(EXCL) ? NodeFilter.FILTER_REJECT : x.nodeType === 1 && isUnit(x) ? (doUnit(x), x.hasAttributes() && doAttrs(x), NodeFilter.FILTER_REJECT) : NodeFilter.FILTER_ACCEPT) });
    let x; while ((x = w.nextNode())) { if (x.nodeType === 3) doText(x); else if (x.hasAttributes()) doAttrs(x); }
  }

  // ask the server for everything still missing, in small batches
  let qT, active = 0; const inflight = new Set();
  function queue() { clearTimeout(qT); qT = setTimeout(flush, 60); }
  const b64 = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  function flush() {
    const keys = [...waiting.keys()].filter((k) => !inflight.has(k));
    if (!keys.length) { if (!active) reveal(); return; }
    const batches = []; let cur = [], size = 2;
    for (const k of keys) { const add = JSON.stringify(k).length + 1; if (cur.length && (cur.length >= 20 || size + add > 2200)) { batches.push(cur); cur = []; size = 2; } cur.push(k); size += add; }
    if (cur.length) batches.push(cur);
    batches.forEach((b) => { b.forEach((k) => inflight.add(k)); todo.push(b); }); pump();
  }
  const todo = []; // at most 3 requests at a time, so the free AI tier isn't flooded
  function pump() { while (active < 3 && todo.length) send(todo.shift()); }
  async function send(batch, tries = 0) {
    active++;
    try {
      const r = await fetch(`/api/tr?l=${lang}&q=${b64(JSON.stringify(batch))}`);
      if (!r.ok) throw new Error(r.status);
      const { t } = await r.json();
      batch.forEach((k, i) => { dict[k] = t[i]; (waiting.get(k) || []).forEach((fn) => { try { fn(t[i]); } catch (e) {} }); waiting.delete(k); });
      save();
    } catch (e) {
      if (tries < 4) { active--; pump(); return setTimeout(() => send(batch, tries + 1), [4000, 8000, 15000, 25000][tries]); } // the free AI tier is sometimes busy for a minute
      batch.forEach((k) => waiting.delete(k)); // give up quietly: the English stays
    }
    batch.forEach((k) => inflight.delete(k)); active--; pump();
    if (!active && !waiting.size) reveal();
  }

  // translate the page title too
  const title = template(document.title); if (title) want(title.key, (tr) => { document.title = fill(tr, title.nums); });

  function start() {
    scan(document.body);
    if (!waiting.size) reveal(); else queue();
    // small note in the footer: AI translation + one tap back to English
    const addNote = () => { const fm = document.querySelector('.foot-main'); if (!fm || fm.querySelector('.i18n-note')) return !!fm;
      const d = document.createElement('div'); d.className = 'i18n-note'; d.setAttribute('data-notr', '');
      d.innerHTML = `${NOTE[lang]} · <button type="button">Show in English</button>`; d.querySelector('button').onclick = () => setLang('en'); fm.append(d); return true; };
    if (!addNote()) setTimeout(addNote, 1500);
    let pend = new Set(), raf = 0;
    new MutationObserver((ms) => {
      for (const m of ms) {
        if (m.type === 'characterData') pend.add(m.target);
        else if (m.type === 'attributes') pend.add(m.target);
        else m.addedNodes.forEach((n) => pend.add(n));
      }
      if (!raf) raf = setTimeout(() => { raf = 0; const list = pend; pend = new Set(); list.forEach((n) => { if (n.isConnected) scan(n); }); }, 30);
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
