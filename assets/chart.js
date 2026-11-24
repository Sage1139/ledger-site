/* ===== LEDGER chart engine =====
   LChart.create(wrapEl, opts) -> chart
   chart.set(data, {animate}) ; chart.type('line'|'area'|'candle'|'bar'|'ha') ; chart.replay(ms)
   data: [{t,o,h,l,c}] or numbers. opts: {type, fmt, xfmt, overlays:[{values,color,dash,label}], height} */
const LChart = (() => {
  const GREEN = '#00e38c', RED = '#ff453a', GRID = 'rgba(255,255,255,.06)', TXT = '#6e6e75';
  const toCandles = (d) => d.map((v, i) => (typeof v === 'number' ? { t: null, o: d[i - 1] ?? v, h: Math.max(v, d[i - 1] ?? v), l: Math.min(v, d[i - 1] ?? v), c: v } : v));
  function heikin(k) {
    const out = []; k.forEach((x, i) => {
      const c = (x.o + x.h + x.l + x.c) / 4, o = i ? (out[i - 1].o + out[i - 1].c) / 2 : (x.o + x.c) / 2;
      out.push({ t: x.t, o, c, h: Math.max(x.h, o, c), l: Math.min(x.l, o, c) });
    }); return out;
  }
  const defFmt = (v) => v.toLocaleString('en-IN', { maximumFractionDigits: v < 100 ? 2 : 0 });
  function defX(t, span) {
    if (!t) return '';
    const o = { timeZone: 'Asia/Kolkata' };
    if (span < 2 * 864e5) return new Date(t).toLocaleTimeString('en-IN', { ...o, hour: '2-digit', minute: '2-digit' });
    if (span < 400 * 864e5) return new Date(t).toLocaleDateString('en-IN', { ...o, day: '2-digit', month: 'short' });
    return new Date(t).toLocaleDateString('en-IN', { ...o, month: 'short', year: '2-digit' });
  }

  function create(wrap, opts = {}) {
    wrap.style.position = 'relative';
    const cv = document.createElement('canvas'); cv.style.cssText = 'width:100%;height:100%;display:block;cursor:crosshair';
    wrap.appendChild(cv);
    const tip = document.createElement('div');
    tip.style.cssText = 'position:absolute;top:6px;left:8px;font:12px "JetBrains Mono",monospace;color:#c7c7cc;pointer-events:none;background:rgba(10,10,13,.85);padding:4px 8px;border-radius:6px;display:none;white-space:nowrap';
    wrap.appendChild(tip);
    const S = { raw: [], type: opts.type || 'area', n: 0, hover: null, overlays: opts.overlays || [], fmt: opts.fmt || defFmt, xfmt: opts.xfmt, anim: 0, markers: [] };

    function geom() {
      const dpr = Math.min(2, devicePixelRatio || 1), W = cv.offsetWidth, H = cv.offsetHeight;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      return { dpr, W, H, padR: 62, padB: 22, padT: 10 };
    }
    function draw() {
      const c = cv.getContext('2d'), g = geom(); c.setTransform(g.dpr, 0, 0, g.dpr, 0, 0); c.clearRect(0, 0, g.W, g.H);
      let k = toCandles(S.raw); if (S.type === 'ha') k = heikin(k);
      const total = k.length, n = Math.max(1, Math.min(total, S.n || total)); if (total < 1) return; // even a single forming candle is drawn
      const vis = k.slice(0, n), all = S.lockScale ? k : vis;
      let lo = Infinity, hi = -Infinity;
      const useHL = S.type === 'candle' || S.type === 'bar' || S.type === 'ha';
      all.forEach((x) => { lo = Math.min(lo, useHL ? x.l : x.c); hi = Math.max(hi, useHL ? x.h : x.c); });
      S.overlays.forEach((o) => o.values.slice(0, S.lockScale ? total : n).forEach((v) => { if (isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }));
      if (hi === lo) { hi += 1; lo -= 1; }
      const padV = (hi - lo) * 0.08, wasPos = lo >= 0; lo -= padV; hi += padV; if (wasPos && lo < 0) lo = 0;
      const pw = g.W - g.padR, ph = g.H - g.padB - g.padT;
      const slots = Math.max(total, S.slots || 0); // fixed time axis (e.g. a full 9:15–3:30 session) so the chart fills left→right like a live day
      const X = (i) => (slots === 1 ? pw / 2 : (i / (slots - 1)) * (pw - 8) + 4), Y = (v) => g.padT + (1 - (v - lo) / (hi - lo)) * ph;
      S.g = { X, Y, total, slots, n, pw, ph, lo, hi, k, ...g };
      // grid + price labels
      c.font = '11px "JetBrains Mono", monospace'; c.textAlign = 'left'; c.textBaseline = 'middle';
      for (let i = 0; i <= 4; i++) {
        const v = lo + ((hi - lo) * i) / 4, y = Y(v);
        c.strokeStyle = GRID; c.lineWidth = 1; c.beginPath(); c.moveTo(0, y); c.lineTo(pw, y); c.stroke();
        c.fillStyle = TXT; c.fillText(S.fmt(v), pw + 8, y);
      }
      // time labels
      if (k[0].t && k[total - 1].t) {
        const step = total > 1 ? (k[total - 1].t - k[0].t) / (total - 1) : 6e4, span = step * (slots - 1); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
        for (let i = 0; i < 4; i++) { const idx = Math.round(((slots - 1) * (i + 0.5)) / 4), t = idx < total ? k[idx].t : k[0].t + idx * step; c.fillStyle = TXT; c.fillText((S.xfmt || defX)(t, span), X(idx), g.H - 6); }
      }
      const up = vis[n - 1].c >= vis[0].o;
      const col = opts.color || (up ? GREEN : RED);
      if (S.type === 'line' || S.type === 'area') {
        c.beginPath(); vis.forEach((x, i) => (i ? c.lineTo(X(i), Y(x.c)) : c.moveTo(X(i), Y(x.c))));
        c.strokeStyle = col; c.lineWidth = 2; c.lineJoin = 'round'; c.shadowColor = col; c.shadowBlur = 10; c.stroke(); c.shadowBlur = 0;
        if (S.type === 'area') { c.lineTo(X(n - 1), g.padT + ph); c.lineTo(X(0), g.padT + ph); const gr = c.createLinearGradient(0, g.padT, 0, g.padT + ph); gr.addColorStop(0, col + '40'); gr.addColorStop(1, col + '00'); c.fillStyle = gr; c.fill(); }
        // pulsing last point
        const lx = X(n - 1), ly = Y(vis[n - 1].c); c.fillStyle = col; c.beginPath(); c.arc(lx, ly, 3.5, 0, 7); c.fill();
        c.globalAlpha = 0.25 + 0.2 * Math.sin(performance.now() / 300); c.beginPath(); c.arc(lx, ly, 8, 0, 7); c.fill(); c.globalAlpha = 1;
      } else {
        const bw = Math.max(1, Math.min(14, ((pw - 8) / slots) * 0.7));
        vis.forEach((x, i) => {
          const cx = X(i), isUp = x.c >= x.o, cc = isUp ? GREEN : RED; c.strokeStyle = cc; c.fillStyle = cc; c.lineWidth = 1;
          if (S.type === 'bar') { c.beginPath(); c.moveTo(cx, Y(x.h)); c.lineTo(cx, Y(x.l)); c.moveTo(cx - bw / 2, Y(x.o)); c.lineTo(cx, Y(x.o)); c.moveTo(cx, Y(x.c)); c.lineTo(cx + bw / 2, Y(x.c)); c.stroke(); }
          else { c.beginPath(); c.moveTo(cx, Y(x.h)); c.lineTo(cx, Y(x.l)); c.stroke(); const y1 = Y(Math.max(x.o, x.c)), y2 = Y(Math.min(x.o, x.c)); c.fillRect(cx - bw / 2, y1, bw, Math.max(1, y2 - y1)); }
        });
      }
      // overlays (e.g. "money you put in")
      S.overlays.forEach((o) => { c.beginPath(); o.values.slice(0, n).forEach((v, i) => (i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v)))); c.strokeStyle = o.color || 'rgba(255,255,255,.5)'; c.lineWidth = 1.5; c.setLineDash(o.dash || [5, 4]); c.stroke(); c.setLineDash([]); });
      // markers (e.g. buy/sell points)
      S.markers.forEach((m) => { if (m.i >= n) return; const x = X(m.i), y = Y(k[m.i].c); c.fillStyle = m.color || '#fff'; c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); if (m.label) { c.font = '600 11px "Inter Tight", sans-serif'; c.textAlign = 'center'; c.fillText(m.label, x, y - 12); } });
      // last price tag
      const last = vis[n - 1].c, ly = Y(last); c.fillStyle = col; c.fillRect(pw + 2, ly - 9, g.padR - 4, 18); c.fillStyle = '#000'; c.font = '600 11px "JetBrains Mono", monospace'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(S.fmt(last), pw + 6, ly);
      // crosshair
      if (S.hover != null && S.hover < n) {
        const i = S.hover, x = X(i), p = k[i]; c.strokeStyle = 'rgba(255,255,255,.3)'; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(x, g.padT); c.lineTo(x, g.padT + ph); c.moveTo(0, Y(p.c)); c.lineTo(pw, Y(p.c)); c.stroke(); c.setLineDash([]);
        const span = k[total - 1].t - k[0].t;
        tip.style.display = 'block';
        tip.innerHTML = (p.t ? (S.xfmt || defX)(p.t, Math.min(span, 1e9)) + ' · ' : '') + (useHL ? `O ${S.fmt(p.o)} H ${S.fmt(p.h)} L ${S.fmt(p.l)} C <b style="color:${p.c >= p.o ? GREEN : RED}">${S.fmt(p.c)}</b>` : `<b>${S.fmt(p.c)}</b>`) + S.overlays.map((o) => ` · ${o.label || ''} ${S.fmt(o.values[i])}`).join('');
      } else tip.style.display = 'none';
    }
    // keep the pulse alive
    let raf; const loop = () => { if ((S.type === 'line' || S.type === 'area') && seen && wrap.offsetParent && !document.hidden) draw(); raf = setTimeout(() => requestAnimationFrame(loop), 120); };
    function animateTo(total, ms) {
      const id = ++S.anim, t0 = performance.now();
      const step = (t) => { if (id !== S.anim) return; const p = Math.min(1, (t - t0) / ms); S.n = Math.max(2, Math.ceil(total * (ms > 3000 ? p : 1 - Math.pow(1 - p, 3)))); draw(); if (p < 1) requestAnimationFrame(step); else { S.n = 0; S.lockScale = false; draw(); api.onReplayEnd && api.onReplayEnd(); } };
      requestAnimationFrame(step);
    }
    cv.addEventListener('mousemove', (e) => { if (!S.g) return; const r = cv.getBoundingClientRect(), i = Math.round(((e.clientX - r.left - 4) / (S.g.pw - 8)) * (S.g.slots - 1)); S.hover = Math.max(0, Math.min(S.g.n - 1, i)); draw(); });
    cv.addEventListener('mouseleave', () => { S.hover = null; draw(); });
    cv.addEventListener('touchmove', (e) => { const t = e.touches[0]; cv.dispatchEvent(new MouseEvent('mousemove', { clientX: t.clientX, clientY: t.clientY })); }, { passive: true });
    new ResizeObserver(() => draw()).observe(wrap);
    let seen = false; const io = new IntersectionObserver((es) => { if (es[0].isIntersecting && !seen) { seen = true; if (S.pendingAnim && S.raw.length > 2) animateTo(S.raw.length, 900); else draw(); } }, { threshold: 0.2 }); io.observe(wrap);
    loop();
    const api = {
      set(data, o = {}) { S.raw = data || []; S.markers = o.markers || S.markers; S.slots = o.slots || 0; if (o.overlays) S.overlays = o.overlays; if (o.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) { if (seen) animateTo(S.raw.length, 900); else S.pendingAnim = true; } else { S.n = 0; draw(); } },
      type(t) { S.type = t; draw(); },
      overlays(o) { S.overlays = o; draw(); },
      replay(ms = 20000) { S.lockScale = true; animateTo(S.raw.length, ms); },
      stop() { S.anim++; S.n = 0; S.lockScale = false; draw(); },
      get type_() { return S.type; },
      redraw: draw,
      onReplayEnd: null,
    };
    return api;
  }

  // chart-type switcher buttons: LChart.switcher(el, chart, current)
  function switcher(el, chart, cur = 'area', onChange) {
    const T = [['line', 'Line'], ['area', 'Mountain'], ['candle', 'Candles'], ['bar', 'OHLC bars'], ['ha', 'Heikin-Ashi']];
    el.innerHTML = T.map(([k, l]) => `<button class="chip ${k === cur ? 'on' : ''}" data-ct="${k}">${l}</button>`).join('');
    el.onclick = (e) => { const b = e.target.closest('[data-ct]'); if (!b) return; el.querySelectorAll('[data-ct]').forEach((x) => x.classList.toggle('on', x === b)); chart.type(b.dataset.ct); onChange && onChange(b.dataset.ct); };
  }
  return { create, switcher, heikin };
})();
