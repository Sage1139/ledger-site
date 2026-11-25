/* ===== LEDGER shared script ===== */
const BRAND = 'LEDGER'; // change the site name here once, it updates every page
const CONTACT_EMAIL = 'ledger.learn.admin@gmail.com'; // add your support email here; it appears on the Terms, Privacy and footer

// Lessons need a free account. Until auth.js confirms who is signed in, hide the lesson pages for visitors with
// no saved session (so they never see a flash of content before being sent to sign in). Safety net: show after 8s.
const GATED = /^\/learn(\/|$)/.test(location.pathname);
if (GATED) { let has = false; try { has = Object.keys(localStorage).some((k) => /^sb-.+-auth-token$/.test(k)); } catch (e) {}
  if (!has) { document.documentElement.classList.add('gate'); setTimeout(() => document.documentElement.classList.remove('gate'), 8000); } }


// Vercel Web Analytics: counts page views and where visitors come from. No cookies, no personal data.
window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
(() => { const s = document.createElement('script'); s.defer = true; s.src = '/_vercel/insights/script.js'; document.head.append(s); })();

const L = (() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const inr = (n, d = 0) => (n < 0 ? '-₹' : '₹') + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
  const num = (n, d = 2) => Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (n) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';

  /* --- safe storage (works even when the browser blocks storage) --- */
  const mem = {};
  const store = {
    get(k, def) { try { const v = localStorage.getItem(k); return v == null ? (k in mem ? mem[k] : def) : JSON.parse(v); } catch (e) { return k in mem ? mem[k] : def; } },
    set(k, v) { mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  /* --- nav + footer --- */
  function chrome(active) {
    const root = document.body.dataset.root || '';
    const links = [
      ['learn', '/learn/', 'Learn'],
      ['stocks', '/simulator/stocks.html', 'Stocks sim'],
      ['funds', '/simulator/funds.html', 'Funds & SIP sim'],
      ['trade', '/simulator/trade.html', 'Live trading & F&O'],
    ];
    const nav = document.createElement('nav');
    nav.className = 'nav';
    nav.innerHTML = `<a class="logo" href="${root || './'}">${BRAND}</a>
      <ul>${links.map(([k, h, t]) => `<li><a href="${h}" class="${k === active ? 'on' : ''}">${t}</a></li>`).join('')}</ul>
      <div class="row"><a class="pill" href="/simulator/">Simulators</a><button class="menu" aria-label="Menu">☰</button></div>`;
    document.body.prepend(nav); document.body.classList.add('has-nav');
    $('.menu', nav).onclick = () => $('ul', nav).classList.toggle('open');
    // Hide after a deliberate scroll down, show after a deliberate scroll up. Small jitters (trackpads,
    // momentum, bouncing at the page bottom) are ignored, so the bar never flickers.
    let anchorY = scrollY, hidden = false, ticking = false;
    const update = () => {
      ticking = false;
      const y = Math.max(0, scrollY), max = document.documentElement.scrollHeight - innerHeight, menuOpen = $('ul', nav).classList.contains('open');
      nav.classList.toggle('solid', y > 10);
      if (y < 120 || menuOpen) { if (hidden) { hidden = false; nav.classList.remove('hide'); } anchorY = y; return; }
      if (y >= max - 2) return; // ignore rubber-band bounce at the very bottom
      if (!hidden && y - anchorY > 60) { hidden = true; nav.classList.add('hide'); anchorY = y; }
      else if (hidden && anchorY - y > 40) { hidden = false; nav.classList.remove('hide'); anchorY = y; }
      else if ((!hidden && y < anchorY) || (hidden && y > anchorY)) anchorY = y; // keep the anchor at the turning point
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true }); update();
    loadAI();
    const f = document.createElement('footer');
    f.className = 'foot-main';
    f.innerHTML = `<div style="margin-bottom:10px"><a href="/about.html">About</a> · <a href="/pricing">Pricing</a> · <a href="/contact.html">Contact</a> · <a href="/terms.html">Terms</a> · <a href="/privacy.html">Privacy</a> · <a href="/refund.html">Refunds</a> · <a href="/shipping.html">Delivery</a>${CONTACT_EMAIL ? ` · <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>` : ''}</div>${BRAND} is a free educational platform. No real money is traded and nothing here is investment advice.<br>Market data from Yahoo Finance, delayed about 15 minutes. Option prices in the simulator are model-calculated, not live exchange quotes.`;
    document.body.append(f);
    document.title = document.title.replace(/LEDGER/g, BRAND);
    $$('[data-brand]').forEach((e) => (e.textContent = BRAND));
  }

  function loadAI() { if (window.__aiLoaded) return; window.__aiLoaded = 1; ['/assets/ai.js', '/assets/auth.js'].forEach((src) => { const s = document.createElement('script'); s.src = src; s.defer = true; document.body.append(s); }); }

  /* --- scroll reveal + reading progress --- */
  function motion() {
    const io = new IntersectionObserver((es) => es.forEach((x) => x.isIntersecting && x.target.classList.add('in')), { threshold: 0.12 });
    $$('.reveal').forEach((el) => io.observe(el));
    const bar = $('.progress');
    if (bar) addEventListener('scroll', () => {
      const h = document.documentElement.scrollHeight - innerHeight;
      bar.style.width = (h > 0 ? (scrollY / h) * 100 : 0) + '%';
    }, { passive: true });
  }

  /* --- canvas line chart --- */
  // animated on first draw: the line "grows" in, so charts feel alive
  function line(cv, data, color, opt = {}) {
    if (!cv) return;
    if (!cv._drawn && !cv._visible && 'IntersectionObserver' in window) { // wait until the chart scrolls into view, then animate
      cv._pending = [data, color, opt];
      if (!cv._io) { cv._io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { cv._visible = true; cv._io.disconnect(); line(cv, ...cv._pending); } }, { threshold: 0.3 }); cv._io.observe(cv); }
      return;
    }
    if (!cv._drawn && opt.animate !== false && data.length > 2 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cv._drawn = true; const id = (cv._anim = (cv._anim || 0) + 1), t0 = performance.now(), dur = 900;
      const step = (t) => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3), n = Math.max(2, Math.ceil(data.length * e));
        const o2 = { ...opt, min: opt.min ?? Math.min(...data.filter(isFinite)), max: opt.max ?? Math.max(...data.filter(isFinite)), series2: opt.series2 && opt.series2.slice(0, n), mark: opt.mark != null && opt.mark < n ? opt.mark : undefined, _n: data.length };
        if (cv._anim !== id) return; lineRaw(cv, data.slice(0, n), color, o2); if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step); return;
    }
    cv._drawn = true; cv._anim = (cv._anim || 0) + 1; lineRaw(cv, data, color, opt);
  }
  function lineRaw(cv, data, color, opt = {}) {
    const c = cv.getContext('2d');
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = (cv.width = cv.offsetWidth * dpr), h = (cv.height = cv.offsetHeight * dpr);
    c.clearRect(0, 0, w, h);
    const d = data.filter((v) => v != null && isFinite(v));
    if (d.length < 2) return;
    let mn = opt.min ?? Math.min(...d), mx = opt.max ?? Math.max(...d);
    if (opt.zero) { mn = Math.min(mn, 0); mx = Math.max(mx, 0); }
    const pad = h * 0.1, N = Math.max(d.length, opt._n || 0), X = (i) => (i / (N - 1)) * w, Y = (v) => h - pad - ((v - mn) / (mx - mn || 1)) * (h - pad * 2);
    if (opt.zero) { c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = dpr; c.setLineDash([4 * dpr, 4 * dpr]); c.beginPath(); c.moveTo(0, Y(0)); c.lineTo(w, Y(0)); c.stroke(); c.setLineDash([]); }
    if (opt.mark != null) { const mxp = X(opt.mark); c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = dpr; c.beginPath(); c.moveTo(mxp, 0); c.lineTo(mxp, h); c.stroke(); }
    c.beginPath();
    d.forEach((v, i) => (i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v))));
    c.strokeStyle = color; c.lineWidth = 3 * dpr; c.lineJoin = 'round';
    if (opt.glow !== false) { c.shadowColor = color; c.shadowBlur = 18 * dpr; }
    c.stroke(); c.shadowBlur = 0;
    if (opt.fill !== false) {
      c.lineTo(X(d.length - 1), h); c.lineTo(0, h);
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, color + '44'); g.addColorStop(1, color + '00');
      c.fillStyle = g; c.fill();
    }
    if (opt.series2) { // second line (e.g. invested amount)
      c.beginPath(); opt.series2.forEach((v, i) => (i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v))));
      c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 2 * dpr; c.setLineDash([6 * dpr, 5 * dpr]); c.stroke(); c.setLineDash([]);
    }
  }

  /* --- quiz engine: L.quiz('#id', [{q, o:[...], a:index, why}], 'lessonKey') --- */
  function quiz(sel, qs, key) {
    const el = $(sel); if (!el) return;
    let i = 0, score = 0; const res = [];
    el.classList.add('quiz', 'glass');
    function draw() {
      if (i >= qs.length) {
        const pass = score >= Math.ceil(qs.length * 0.6);
        el.innerHTML = `<div class="kicker">Your result</div><div class="stat ${pass ? 'up' : 'down'}">${score} / ${qs.length}</div>
          <p class="why">${pass ? 'Lesson complete. Nicely done. This lesson is now marked done on your learning path.' : 'Not quite there yet. Scroll back through the lesson and try again, there is no penalty.'}</p>
          <div class="foot"><button class="ghost" data-retry>Try again</button><a class="pill" href="./">Back to all lessons</a></div>`;
        if (pass && key) { const done = store.get('ledger.done', {}); done[key] = Math.max(done[key] || 0, score / qs.length); store.set('ledger.done', done); }
        $('[data-retry]', el).onclick = () => { i = 0; score = 0; res.length = 0; draw(); };
        return;
      }
      const q = qs[i];
      el.innerHTML = `<div class="kicker">Check yourself · ${i + 1} of ${qs.length}</div><div class="q">${q.q}</div>
        <div class="opts">${q.o.map((o, k) => `<button class="opt" data-k="${k}">${o}</button>`).join('')}</div>
        <div class="why"></div>
        <div class="foot"><div class="dots">${qs.map((_, k) => `<i class="${res[k] === true ? 'ok' : res[k] === false ? 'no' : ''} ${k === i ? 'cur' : ''}"></i>`).join('')}</div><button class="pill" data-next style="visibility:hidden">Next →</button></div>`;
      $$('.opt', el).forEach((b) => (b.onclick = () => {
        const k = +b.dataset.k, ok = k === q.a;
        $$('.opt', el).forEach((x) => { x.disabled = true; if (+x.dataset.k === q.a) x.classList.add('right'); });
        if (!ok) b.classList.add('wrong'); else score++;
        res[i] = ok;
        $('.why', el).innerHTML = `<b class="${ok ? 'up' : 'down'}">${ok ? 'Correct.' : 'Not quite.'}</b> ${q.why}`;
        $('[data-next]', el).style.visibility = 'visible';
      }));
      $('[data-next]', el).onclick = () => { i++; draw(); };
    }
    draw();
  }

  /* --- market data --- */
  async function quotes(symbols, range, o = {}) {
    const url = '/api/quote?symbols=' + encodeURIComponent(symbols.join(',')) + (range ? '&range=' + range : '') + (o.candles ? '&candles=1' : '') + (o.div ? '&div=1' : '') + (o.interval ? '&interval=' + o.interval : '');
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('feed ' + r.status);
    return r.json();
  }
  async function mf(params) {
    const r = await fetch('/api/mf?' + new URLSearchParams(params), { cache: 'no-store' });
    if (!r.ok) throw new Error('mf ' + r.status);
    return r.json();
  }

  /* --- toast --- */
  let tt;
  function toast(msg, kind = 'ok') {
    let t = $('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.append(t); }
    t.className = 'toast ' + kind; t.textContent = msg;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 3200);
  }

  /* --- seeded random walk for demos --- */
  function walk(n, start, vol, drift = 0, seed = 7) {
    let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const out = [start];
    for (let i = 1; i < n; i++) out.push(out[i - 1] * (1 + drift + (rnd() - 0.5) * vol));
    return out;
  }

  /* --- Black-Scholes option price (educational model) --- */
  function ncdf(x) { const t = 1 / (1 + 0.2316419 * Math.abs(x)); const d = 0.3989423 * Math.exp(-x * x / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; }
  function bs(S, K, T, type = 'CE', vol = 0.13, r = 0.065) {
    if (T <= 0) return Math.max(0, type === 'CE' ? S - K : K - S);
    const d1 = (Math.log(S / K) + (r + vol * vol / 2) * T) / (vol * Math.sqrt(T)), d2 = d1 - vol * Math.sqrt(T);
    const price = type === 'CE' ? S * ncdf(d1) - K * Math.exp(-r * T) * ncdf(d2) : K * Math.exp(-r * T) * ncdf(-d2) - S * ncdf(-d1);
    return Math.max(0.05, price);
  }
  function delta(S, K, T, type = 'CE', vol = 0.13, r = 0.065) {
    if (T <= 0) return type === 'CE' ? (S > K ? 1 : 0) : (S < K ? -1 : 0);
    const d1 = (Math.log(S / K) + (r + vol * vol / 2) * T) / (vol * Math.sqrt(T));
    return type === 'CE' ? ncdf(d1) : ncdf(d1) - 1;
  }

  const lakh = (n) => { const a = Math.abs(n), s = n < 0 ? '-₹' : '₹'; return a >= 1e7 ? s + (a / 1e7).toFixed(2) + ' Cr' : a >= 1e5 ? s + (a / 1e5).toFixed(2) + ' L' : inr(n); };

  return { $, $$, inr, num, pct, lakh, store, chrome, loadAI, motion, line, quiz, quotes, mf, toast, walk, bs, delta };
})();
