/* ===== LEDGER trading simulator =====
   Virtual money only. Equity prices: real (Yahoo Finance, ~15 min delay).
   NIFTY options & futures: priced by a Black-Scholes model from the real Nifty spot. */
(() => {
const { $, $$, inr, num, pct, store, toast } = L;
const NIFTY_LOT = 65, FNO_MARGIN = 0.12, MIS_MARGIN = 0.20, BROKERAGE = 20, STRIKE_STEP = 50;
const START_CASH = 1000000;
const INDEX = [['^NSEI', 'NIFTY 50'], ['^NSEBANK', 'BANKNIFTY'], ['^BSESN', 'SENSEX']];
const UNIVERSE = {
  RELIANCE:'Reliance Industries', TCS:'Tata Consultancy Services', HDFCBANK:'HDFC Bank', INFY:'Infosys', ICICIBANK:'ICICI Bank',
  BHARTIARTL:'Bharti Airtel', ITC:'ITC', SBIN:'State Bank of India', LT:'Larsen & Toubro', HINDUNILVR:'Hindustan Unilever',
  KOTAKBANK:'Kotak Mahindra Bank', AXISBANK:'Axis Bank', BAJFINANCE:'Bajaj Finance', MARUTI:'Maruti Suzuki', SUNPHARMA:'Sun Pharma',
  TITAN:'Titan Company', ASIANPAINT:'Asian Paints', HCLTECH:'HCL Technologies', WIPRO:'Wipro', ULTRACEMCO:'UltraTech Cement',
  NTPC:'NTPC', POWERGRID:'Power Grid', ONGC:'ONGC', TATASTEEL:'Tata Steel', JSWSTEEL:'JSW Steel', 'M&M':'Mahindra & Mahindra',
  ADANIENT:'Adani Enterprises', ADANIPORTS:'Adani Ports', COALINDIA:'Coal India', NESTLEIND:'Nestle India', TECHM:'Tech Mahindra',
  BAJAJFINSV:'Bajaj Finserv', HDFCLIFE:'HDFC Life', SBILIFE:'SBI Life', DRREDDY:"Dr Reddy's", CIPLA:'Cipla', EICHERMOT:'Eicher Motors',
  HEROMOTOCO:'Hero MotoCorp', BRITANNIA:'Britannia', GRASIM:'Grasim', TATACONSUM:'Tata Consumer', INDUSINDBK:'IndusInd Bank',
  ZOMATO:'Zomato (Eternal)', ETERNAL:'Eternal', DMART:'Avenue Supermarts', IRCTC:'IRCTC', HAL:'Hindustan Aeronautics', BEL:'Bharat Electronics',
  TRENT:'Trent', PAYTM:'Paytm', NYKAA:'Nykaa', TATAPOWER:'Tata Power', VEDL:'Vedanta', PIDILITIND:'Pidilite', DIVISLAB:"Divi's Labs",
};
const DEFAULT_WL = ['NIFTY', 'RELIANCE', 'HDFCBANK', 'TCS', 'INFY', 'ICICIBANK', 'SBIN', 'ITC', 'BHARTIARTL', 'TATASTEEL'];

/* ---------- state ---------- */
const KEY = 'ledger.sim.v1';
function fresh() { return { cash: START_CASH, charges: 0, realized: 0, orders: [], holdings: {}, positions: {}, wl: DEFAULT_WL.slice(), seq: 1 }; }
let S = store.get(KEY, null) || fresh();
if (!S.wl || !S.positions) S = fresh();
const save = () => store.set(KEY, S);

const Q = {};          // symbol -> quote  (equities keyed by plain symbol, indices by ^code)
let spot = null, demo = false, lastPx = {};
let sel = 'NIFTY', range = '1d';

/* ---------- time & expiry (IST) ---------- */
const IST = 5.5 * 3600e3;
const istNow = () => new Date(Date.now() + IST); // read with getUTC*
// NSE trading holidays (weekdays) from the official 2026 circular. Add next year's list when NSE publishes it.
const HOLIDAYS = new Set(['2026-01-26','2026-03-03','2026-03-26','2026-03-31','2026-04-03','2026-04-14','2026-05-01','2026-05-28','2026-06-26','2026-09-14','2026-10-02','2026-10-20','2026-11-10','2026-11-24','2026-12-25']);
const ymd = (t) => new Date(t).toISOString().slice(0, 10);
const tradingDay = (t) => { const wd = new Date(t).getUTCDay(); return wd >= 1 && wd <= 5 && !HOLIDAYS.has(ymd(t)); };
function holidayToday() { const d = istNow(); return HOLIDAYS.has(ymd(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))); }
function marketOpen() {
  const d = istNow(), m = d.getUTCHours() * 60 + d.getUTCMinutes();
  return tradingDay(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) && m >= 555 && m < 930;
}
// expiry falls back to the previous trading day when the Tuesday is a holiday
function shiftBack(t) { while (!tradingDay(t)) t -= 864e5; return Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth(), new Date(t).getUTCDate(), 10, 0); } // 15:30 IST = 10:00 UTC
function weeklyExpiries(n = 4) {
  const out = []; const d = istNow(); let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 7 * 864e5;
  while (out.length < n) {
    if (new Date(t).getUTCDay() === 2) { const e = shiftBack(t); if (e > Date.now() && !out.includes(e)) out.push(e); }
    t += 864e5;
  }
  return out;
}
function monthlyExpiry() {
  const d = istNow(); let y = d.getUTCFullYear(), m = d.getUTCMonth();
  for (let k = 0; k < 3; k++) {
    let last = Date.UTC(y, m + 1, 0); while (new Date(last).getUTCDay() !== 2) last -= 864e5;
    const e = shiftBack(last); if (e > Date.now()) return e;
    m++; if (m > 11) { m = 0; y++; }
  }
}
const fmtExp = (e) => new Date(e).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' }).toUpperCase();
const yrs = (e) => Math.max(0, (e - Date.now()) / (365 * 864e5));

/* ---------- instruments ---------- */
// keys: "EQ:RELIANCE" | "IDX:NIFTY" | "OPT:<expiryMs>:<strike>:CE" | "FUT:<expiryMs>"
function parse(k) {
  const [t, a, b, c] = k.split(':');
  if (t === 'EQ') return { t, sym: a };
  if (t === 'IDX') return { t, sym: a };
  if (t === 'OPT') return { t, exp: +a, K: +b, type: c };
  if (t === 'FUT') return { t, exp: +a };
}
function instName(k) {
  const p = parse(k);
  if (p.t === 'EQ') return p.sym;
  if (p.t === 'IDX') return 'NIFTY 50';
  if (p.t === 'OPT') return `NIFTY ${fmtExp(p.exp)} ${p.K} ${p.type}`;
  return `NIFTY ${fmtExp(p.exp)} FUT`;
}
const isFno = (k) => /^(OPT|FUT)/.test(k);
const lot = (k) => (isFno(k) ? NIFTY_LOT : 1);
const tick = (x) => Math.round(x * 20) / 20;
function volFor(K) { const m = Math.log(K / spot); return 0.12 + 8 * m * m; }
function price(k) {
  const p = parse(k);
  if (p.t === 'EQ') return Q[p.sym] ? Q[p.sym].price : null;
  if (spot == null) return null;
  if (p.t === 'IDX') return spot;
  if (p.t === 'FUT') return tick(spot * (1 + 0.065 * yrs(p.exp)));
  return tick(L.bs(spot, p.K, yrs(p.exp), p.type, volFor(p.K)));
}

/* ---------- account maths ---------- */
function posMargin(key, pos) {
  const k = pos.inst, q = Math.abs(pos.qty), px = price(k) ?? pos.avg, p = parse(k);
  if (!q) return 0;
  if (p.t === 'OPT') return pos.qty > 0 ? pos.avg * q : (spot ?? px) * q * FNO_MARGIN;
  if (p.t === 'FUT') return px * q * FNO_MARGIN;
  return px * q * MIS_MARGIN; // MIS equity
}
function posMtm(pos) { const px = price(pos.inst); return px == null ? 0 : (px - pos.avg) * pos.qty; }
function account() {
  let used = 0, mtm = 0, negMtm = 0;
  Object.entries(S.positions).forEach(([key, pos]) => {
    if (!pos.qty) return;
    used += posMargin(key, pos);
    const m = posMtm(pos); mtm += m;
    const longOpt = parse(pos.inst).t === 'OPT' && pos.qty > 0;
    if (!longOpt && m < 0) negMtm += m;
  });
  let hv = 0, hInv = 0; Object.entries(S.holdings).forEach(([s, h]) => { const px = Q[s] ? Q[s].price : h.avg; hv += px * h.qty; hInv += h.avg * h.qty; });
  const blockedOrders = S.orders.filter((o) => o.status === 'OPEN').reduce((a, o) => a + (o.block || 0), 0);
  return { used, mtm, available: S.cash - used + negMtm - blockedOrders, hv, hInv, blockedOrders, worth: S.cash + hv + mtm };
}
function marginFor(inst, side, qty, px, product) {
  const p = parse(inst);
  if (p.t === 'EQ' && product === 'CNC') return side === 'BUY' ? px * qty : 0;
  if (p.t === 'EQ') return px * qty * MIS_MARGIN;
  if (p.t === 'OPT') return side === 'BUY' ? px * qty : (spot ?? px) * qty * FNO_MARGIN;
  return px * qty * FNO_MARGIN;
}

/* ---------- order engine ---------- */
function newOrder(o) {
  // o: {inst, side, qty(units), product, type, limit}
  const ord = { id: S.seq++, time: Date.now(), status: 'OPEN', avg: null, reason: '', ...o };
  S.orders.unshift(ord); if (S.orders.length > 200) S.orders.length = 200;
  const px = price(o.inst);
  if (px == null) return reject(ord, 'No price available for this instrument yet');
  if (!(o.qty > 0) || o.qty % lot(o.inst)) return reject(ord, `Quantity must be a multiple of the lot size (${lot(o.inst)})`);
  if (o.type === 'LIMIT' && !(o.limit > 0)) return reject(ord, 'Enter a valid limit price');
  if (o.type === 'LIMIT') {
    const now = o.side === 'BUY' ? px <= o.limit : px >= o.limit;
    if (!now) {
      const chk = check(ord, o.limit); if (chk) return reject(ord, chk);
      ord.block = incMargin(ord, o.limit); save(); toast(`Limit order placed: waiting for ${instName(o.inst)} to reach ${num(o.limit)}`); return ord;
    }
    return fill(ord, o.side === 'BUY' ? Math.min(px, o.limit) : Math.max(px, o.limit));
  }
  return fill(ord, px);
}
function reject(ord, why) { ord.status = 'REJECTED'; ord.reason = why; save(); toast('Order rejected: ' + why, 'err'); render(); return ord; }
function posKey(inst, product) { return inst + '|' + product; }
function incMargin(ord, px) {
  if (parse(ord.inst).t === 'EQ' && ord.product === 'CNC') return ord.side === 'BUY' ? px * ord.qty : 0;
  const key = posKey(ord.inst, ord.product), pos = S.positions[key] || { inst: ord.inst, qty: 0, avg: px };
  const before = pos.qty ? posMargin(key, pos) : 0;
  const nq = pos.qty + (ord.side === 'BUY' ? ord.qty : -ord.qty);
  if (!nq) return 0;
  const after = posMargin(key, { inst: ord.inst, qty: nq, avg: Math.sign(nq) === Math.sign(pos.qty) && pos.qty ? pos.avg : px });
  return Math.max(0, after - before);
}
function check(ord, px) {
  const p = parse(ord.inst);
  if (p.t === 'EQ' && ord.product === 'CNC' && ord.side === 'SELL') {
    const h = S.holdings[p.sym], pending = S.orders.filter((o) => o !== ord && o.status === 'OPEN' && o.side === 'SELL' && o.inst === ord.inst && o.product === 'CNC').reduce((a, o) => a + o.qty, 0);
    if (!h || h.qty - pending < ord.qty) return `You hold ${h ? h.qty - pending : 0} free shares of ${p.sym}. Delivery (CNC) sells need shares in your holdings. Use MIS to short-sell intraday.`;
    return '';
  }
  const need = incMargin(ord, px) + (isFno(ord.inst) || ord.product === 'MIS' ? BROKERAGE : 0);
  const av = account().available;
  if (need > av) return `Insufficient funds: needs ${inr(need)}, available ${inr(av)}`;
  return '';
}
function fill(ord, px) {
  const chk = check(ord, px); if (chk) return reject(ord, chk);
  ord.block = 0; ord.status = 'COMPLETE'; ord.avg = px; ord.filled = Date.now();
  const p = parse(ord.inst), q = ord.qty, sg = ord.side === 'BUY' ? 1 : -1;
  if (p.t === 'EQ' && ord.product === 'CNC') {
    const h = S.holdings[p.sym] || { qty: 0, avg: 0 };
    if (sg > 0) { h.avg = (h.avg * h.qty + px * q) / (h.qty + q); h.qty += q; S.cash -= px * q; }
    else { const r = (px - h.avg) * q; S.realized += r; S.cash += px * q; h.qty -= q; }
    if (h.qty > 0) S.holdings[p.sym] = h; else delete S.holdings[p.sym];
  } else {
    const key = posKey(ord.inst, ord.product), pos = S.positions[key] || { inst: ord.inst, product: ord.product, qty: 0, avg: 0, realized: 0 };
    let dq = sg * q;
    if (pos.qty && Math.sign(pos.qty) !== Math.sign(dq)) { // closing (part of) position
      const close = Math.min(Math.abs(pos.qty), Math.abs(dq)) * Math.sign(dq);
      const r = (px - pos.avg) * -close; pos.realized += r; S.realized += r; S.cash += r;
      pos.qty += close; dq -= close;
      if (!pos.qty) pos.avg = 0;
    }
    if (dq) { pos.avg = (pos.avg * Math.abs(pos.qty) + px * Math.abs(dq)) / (Math.abs(pos.qty) + Math.abs(dq)); pos.qty += dq; }
    S.cash -= BROKERAGE; S.charges += BROKERAGE;
    S.positions[key] = pos;
  }
  save();
  toast(`${ord.side === 'BUY' ? 'Bought' : 'Sold'} ${q} ${instName(ord.inst)} @ ${num(px)}`);
  render();
  return ord;
}
function cancel(id) { const o = S.orders.find((x) => x.id === id); if (o && o.status === 'OPEN') { o.status = 'CANCELLED'; o.block = 0; save(); toast('Order cancelled'); render(); } }
function workLimits() {
  S.orders.filter((o) => o.status === 'OPEN').forEach((o) => {
    const px = price(o.inst); if (px == null) return;
    if (o.side === 'BUY' ? px <= o.limit : px >= o.limit) { o.block = 0; o.status = 'OPEN'; fill(o, o.limit); }
  });
}
function settleExpired() {
  if (spot == null) return;
  Object.entries(S.positions).forEach(([key, pos]) => {
    const p = parse(pos.inst); if (!pos.qty || !p.exp || p.exp > Date.now()) return;
    const final = p.t === 'OPT' ? Math.max(0, p.type === 'CE' ? spot - p.K : p.K - spot) : spot;
    const r = (final - pos.avg) * pos.qty; S.cash += r; S.realized += r; pos.realized += r; pos.qty = 0;
    S.orders.unshift({ id: S.seq++, time: Date.now(), inst: pos.inst, side: '—', qty: 0, product: pos.product, type: 'EXPIRY', status: 'COMPLETE', avg: final, reason: 'Settled at expiry' });
    toast(`${instName(pos.inst)} expired and settled at ${num(final)}`);
  });
  S.orders.filter((o) => o.status === 'OPEN' && parse(o.inst).exp && parse(o.inst).exp < Date.now()).forEach((o) => { o.status = 'CANCELLED'; o.reason = 'Contract expired'; o.block = 0; });
  save();
}

/* ---------- data ---------- */
function eqSymbols() {
  const set = new Set(S.wl.filter((s) => s !== 'NIFTY'));
  Object.keys(S.holdings).forEach((s) => set.add(s));
  Object.values(S.positions).forEach((p) => { const x = parse(p.inst); if (x.t === 'EQ' && p.qty) set.add(x.sym); });
  S.orders.filter((o) => o.status === 'OPEN').forEach((o) => { const x = parse(o.inst); if (x.t === 'EQ') set.add(x.sym); });
  return [...set].slice(0, 26);
}
const ySym = (s) => s + '.NS';
async function refresh() {
  const eq = eqSymbols();
  try {
    const j = await L.quotes([...INDEX.map((i) => i[0]), ...eq.map(ySym)]);
    j.quotes.forEach((q) => { const s = q.symbol.replace(/\.NS$/, ''); Q[s] = q; });
    spot = Q['^NSEI'] ? Q['^NSEI'].price : spot;
    demo = false;
  } catch (e) {
    demo = true; demoTick(eq);
  }
  settleExpired(); workLimits(); render(true);
}
function demoTick(eq) { // offline fallback so the terminal still works when the data feed is unreachable
  const seedPx = (s) => 200 + (s.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 40) * 90;
  [...INDEX.map((i) => i[0]), ...eq].forEach((s) => {
    const base = s === '^NSEI' ? 25000 : s === '^NSEBANK' ? 56000 : s === '^BSESN' ? 82000 : seedPx(s);
    const q = Q[s] || { symbol: s, name: s, prevClose: base, price: base, series: [base] };
    q.price = q.price * (1 + (Math.random() - 0.5) * 0.002); q.change = (q.price / q.prevClose - 1) * 100;
    q.series = [...q.series.slice(-120), q.price]; Q[s] = q;
  });
  spot = Q['^NSEI'].price;
}

/* ---------- rendering ---------- */
function chg(c) { return c == null ? '' : `<span class="${c >= 0 ? 'up' : 'down'}">${pct(c)}</span>`; }
function renderTop() {
  $('#idx').innerHTML = INDEX.map(([s, n]) => Q[s] ? `<div>${n}<b>${num(Q[s].price)}</b>${chg(Q[s].change)}</div>` : '').join('');
  const open = marketOpen(); $('#mkt').textContent = demo ? 'DEMO PRICES' : open ? '● MARKET OPEN' : holidayToday() ? 'MARKET HOLIDAY' : 'MARKET CLOSED'; $('#mkt').className = 'mkt ' + (open && !demo ? 'open' : '');
  $('#fTop').textContent = inr(account().available);
}
function renderWl() {
  $('#wlCount').textContent = S.wl.length;
  $('#list').innerHTML = S.wl.map((s) => {
    const q = s === 'NIFTY' ? Q['^NSEI'] : Q[s];
    const px = q ? q.price : null, prev = lastPx[s], fl = prev != null && px != null && px !== prev ? (px > prev ? 'flash-up' : 'flash-dn') : '';
    return `<div class="wr ${sel === s ? 'sel' : ''} ${fl}" data-s="${s}"><div class="s">${s}<small>${s === 'NIFTY' ? 'NSE index · F&O' : UNIVERSE[s] || 'NSE'}</small></div>
      <div class="p ${q && q.change < 0 ? 'down' : q ? 'up' : ''}">${px != null ? num(px) : '—'}<small>${q ? pct(q.change) : ''}</small></div>
      <div class="acts">${s === 'NIFTY' ? '<button class="b-btn" data-chain>Chain</button>' : `<button class="b-btn" data-b>B</button><button class="s-btn" data-sl>S</button>`}<button class="x-btn" data-x title="Remove">✕</button></div></div>`;
  }).join('') || '<div class="empty"><b>Empty watchlist</b>Search above to add stocks.</div>';
  S.wl.forEach((s) => { const q = s === 'NIFTY' ? Q['^NSEI'] : Q[s]; if (q) lastPx[s] = q.price; });
}
let selInst = null; // an F&O contract shown on the chart
function renderChartHead() {
  if (R.on) return; // replay controls the header while it runs
  const isIdx = sel === 'NIFTY', q = isIdx ? Q['^NSEI'] : Q[sel];
  if (selInst) {
    const px = price(selInst), p = parse(selInst);
    $('#cName').textContent = instName(selInst);
    $('#cSub').textContent = p.t === 'OPT' ? `NIFTY OPTION · ${p.type === 'CE' ? 'gains if Nifty rises above ' : 'gains if Nifty falls below '}${p.K} · model price from live Nifty` : 'NIFTY FUTURE · moves 1:1 with Nifty';
    $('#cLtp').textContent = px != null ? num(px) : '—'; $('#cChg').innerHTML = `<span class="small">Nifty ${spot ? num(spot) : ''}</span>`;
    $('#cBuy').textContent = 'Buy'; $('#cSell').textContent = 'Sell';
  } else {
    $('#cName').textContent = isIdx ? 'NIFTY 50' : sel;
    $('#cSub').textContent = isIdx ? 'NSE INDEX · you trade it through futures & options' : 'NSE · ' + (UNIVERSE[sel] || 'Equity');
    $('#cLtp').textContent = q ? num(q.price) : '—';
    $('#cChg').innerHTML = q ? chg(q.change) + ` <span class="small">today</span>` : '';
    $('#cBuy').textContent = isIdx ? 'Buy future' : 'Buy'; $('#cSell').textContent = isIdx ? 'Sell future' : 'Sell';
  }
  const open = marketOpen() && !demo;
  if (!R.on) $('#liveDot').innerHTML = open ? '<span class="up">● Live</span> · new candle every minute (data ~15 min delayed)' : 'Market closed: prices are frozen.';
  $('#dataBanner').innerHTML = demo ? '<div class="banner">Live data is unreachable right now, so you\'re seeing demo prices. Everything still works.</div>'
    : !marketOpen() ? `<div class="banner">${holidayToday() ? 'Today is an NSE trading holiday.' : 'The market is closed.'} Orders fill instantly at the last traded price so you can keep practising.</div>` : '';
  if (q) $('#cStats').innerHTML = [['Prev close', q.prevClose], ['Day high', q.dayHigh], ['Day low', q.dayLow], ['52W high', q.high52]].map(([l, v]) => `<div><span>${l}</span><b>${v != null ? num(v) : '—'}</b></div>`).join('');
}
const CH = LChart.create($('#cWrap'), { type: 'candle' });
LChart.switcher($('#cTypes'), CH, 'candle');
let chartReq = 0, chartKey = '';
function fnoCandles(k, inst) { // turn Nifty candles into the contract's price candles
  const p = parse(inst);
  return k.map((x) => {
    const T = Math.max(0, (p.exp - x.t) / (365 * 864e5));
    if (p.t === 'FUT') { const f = 1 + 0.065 * T; return { t: x.t, o: x.o * f, h: x.h * f, l: x.l * f, c: x.c * f }; }
    const f = (s) => L.bs(s, p.K, T, p.type, volFor(p.K)), o = f(x.o), c = f(x.c), a = f(x.h), b = f(x.l);
    return { t: x.t, o, c, h: Math.max(o, c, a, b), l: Math.min(o, c, a, b) };
  });
}
async function loadChart(quiet) {
  const id = ++chartReq, sym = selInst || sel === 'NIFTY' ? '^NSEI' : ySym(sel), key = (selInst || sel) + range;
  const fresh = key !== chartKey; chartKey = key;
  try {
    const q = (await L.quotes([sym], range, { candles: true })).quotes[0]; if (id !== chartReq) return;
    CH.set(selInst ? fnoCandles(q.candles, selInst) : q.candles, { animate: fresh && !quiet });
    $('#cNote').textContent = selInst ? 'Contract price worked out from real Nifty prices (about 15 min delayed). Hover to read values.' : 'Real prices, about 15 minutes delayed. Hover the chart to read open, high, low and close.';
  } catch (e) {
    if (id !== chartReq) return;
    const q = sel === 'NIFTY' || selInst ? Q['^NSEI'] : Q[sel], s = q ? q.series : [];
    const k = s.map((c, i) => ({ t: Date.now() - (s.length - i) * 6e4, o: s[i - 1] || c, h: Math.max(c, s[i - 1] || c), l: Math.min(c, s[i - 1] || c), c }));
    CH.set(selInst ? fnoCandles(k, selInst) : k, { animate: fresh && !quiet });
    $('#cNote').textContent = 'Showing demo data.';
  }
}
function drawChart() { CH.redraw(); }
/* ---------- session replay at REAL speed ----------
   Plays a past trading day from 9:15 am exactly as fast as it happened (1 one-minute candle per real minute).
   The current candle "forms" smoothly inside its minute, like a live chart. Speed can be raised by the learner. */
const R = { on: false, days: {}, k: [], tau: 0, speed: 1, playing: false, last: 0, drawn: 0 };
const istDay = (t) => new Date(t).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' });
const istTime = (t) => new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kolkata' });
function seeded(n) { let s = Math.floor(Math.abs(n * 1000)) % 2147483646 + 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
function pathAt(x, f) { // price of a forming candle at fraction f of its minute: open → one extreme → the other → close
  const r = seeded(x.o + x.c + x.t / 6e4), first = x.c >= x.o ? x.l : x.h, second = x.c >= x.o ? x.h : x.l;
  const a = 0.2 + r() * 0.25, b = 0.55 + r() * 0.3, pts = [[0, x.o], [a, first], [b, second], [1, x.c]];
  for (let i = 1; i < pts.length; i++) if (f <= pts[i][0]) { const [f0, p0] = pts[i - 1], [f1, p1] = pts[i], u = (f - f0) / (f1 - f0 || 1); return p0 + (p1 - p0) * u + (Math.sin(f * 40 + r() * 6) * (x.h - x.l) * 0.04); }
  return x.c;
}
function rpFrame(now) {
  if (!R.on) return;
  if (R.playing) { R.tau += (now - R.last) * R.speed; }
  R.last = now;
  const total = R.k.length * 6e4; if (R.tau >= total) { R.tau = total; R.playing = false; $('#rpPlay').textContent = '↺'; }
  if (now - R.drawn > (R.speed >= 30 ? 50 : 200)) {
    R.drawn = now;
    const i = Math.min(R.k.length - 1, Math.floor(R.tau / 6e4)), f = Math.min(1, (R.tau % 6e4) / 6e4), x = R.k[i];
    const done = R.tau >= total, out = R.k.slice(0, done ? R.k.length : i);
    if (!done) { let hi = x.o, lo = x.o; const steps = 12; for (let s = 0; s <= steps; s++) { const p = pathAt(x, (f * s) / steps); hi = Math.max(hi, p); lo = Math.min(lo, p); } const c = pathAt(x, f); out.push({ t: x.t, o: x.o, h: Math.max(hi, c), l: Math.min(lo, c), c }); }
    CH.set(out, { slots: Math.max(375, R.k.length) });
    const last = out.at(-1); $('#cLtp').textContent = num(last.c);
    const chgD = (last.c / R.k[0].o - 1) * 100; $('#cChg').innerHTML = `<span class="${chgD >= 0 ? 'up' : 'down'}">${pct(chgD)}</span> <span class="small">since open</span>`;
    $('#rpClock').textContent = istTime(R.k[0].t + R.tau); $('#rpFill').style.width = (R.tau / total) * 100 + '%';
  }
  requestAnimationFrame(rpFrame);
}
async function startReplay() {
  const sym = selInst || sel === 'NIFTY' ? '^NSEI' : ySym(sel);
  $('#replay').textContent = 'Loading sessions…';
  let k;
  try { k = (await L.quotes([sym], '5d', { candles: true, interval: '1m' })).quotes[0].candles; }
  catch (e) { const s = L.walk(375 * 3, spot || 25000, 0.0012, 0, 5), t0 = Date.UTC(2026, 10, 18, 3, 45); k = s.map((c, i) => { const d = Math.floor(i / 375), m = i % 375, p = s[i - 1] || c; return { t: t0 + d * 864e5 + m * 6e4, o: p, h: Math.max(p, c) * 1.0003, l: Math.min(p, c) * 0.9997, c }; }); }
  if (selInst) k = fnoCandles(k, selInst);
  R.days = {}; k.forEach((x) => (R.days[istDay(x.t)] ||= []).push(x));
  const names = Object.keys(R.days).filter((d) => R.days[d].length > 30);
  if (!names.length) { toast('No past session data available right now', 'err'); $('#replay').textContent = '▶ Replay a past session'; return; }
  $('#rpDay').innerHTML = names.slice().reverse().map((d) => `<option>${d}</option>`).join('');
  R.on = true; $('#rpBar').hidden = false; $('#replay').hidden = true; $('#liveDot').textContent = '';
  pickDay(names.at(-1)); R.last = performance.now(); requestAnimationFrame(rpFrame);
  toast('Replaying from the 9:15 am open at real speed. Change the speed on the right if you want it faster.');
}
function pickDay(d) { R.k = R.days[d]; R.tau = 0; R.playing = true; $('#rpPlay').textContent = '❚❚'; CH.set([], { slots: 375 }); }
function stopReplay() { R.on = false; $('#rpBar').hidden = true; $('#replay').hidden = false; $('#replay').textContent = '▶ Replay a past session'; chartKey = ''; renderChartHead(); loadChart(); }
$('#replay').onclick = () => (R.on ? stopReplay() : startReplay());
$('#rpExit').onclick = stopReplay;
$('#rpDay').onchange = () => pickDay($('#rpDay').value);
$('#rpSpd').onchange = () => (R.speed = +$('#rpSpd').value);
$('#rpPlay').onclick = () => { if (R.tau >= R.k.length * 6e4) R.tau = 0; R.playing = !R.playing; $('#rpPlay').textContent = R.playing ? '❚❚' : '▶'; };
$('#rpTrack').onclick = (e) => { const r = $('#rpTrack').getBoundingClientRect(); R.tau = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * R.k.length * 6e4; R.drawn = 0; };
function renderChain() {
  if (spot == null) { $('#oc').innerHTML = '<tr><td class="empty">Waiting for Nifty price…</td></tr>'; return; }
  const exps = weeklyExpiries(4), cur = +$('#ocExp').value || exps[0];
  if (!$('#ocExp').options.length || +$('#ocExp').options[0].value !== exps[0]) $('#ocExp').innerHTML = exps.map((e, i) => `<option value="${e}">${fmtExp(e)}${i === 0 ? ' · weekly' : ''}</option>`).join('');
  if (exps.includes(cur)) $('#ocExp').value = cur;
  const exp = +$('#ocExp').value, atm = Math.round(spot / STRIKE_STEP) * STRIKE_STEP, T = yrs(exp);
  $('#ocSpot').textContent = num(spot);
  let rows = `<tr><th colspan="3" style="color:var(--g1)">CALLS (CE)</th><th></th><th colspan="3" style="color:var(--red)">PUTS (PE)</th></tr><tr><th>Delta</th><th>Chg vs ATM</th><th>LTP</th><th>STRIKE</th><th>LTP</th><th>Chg vs ATM</th><th>Delta</th></tr>`;
  let spotDone = false;
  for (let i = -12; i <= 12; i++) {
    const K = atm + i * STRIKE_STEP;
    if (!spotDone && K > spot) { rows += `<tr class="spotrow"><td colspan="7"><div><span>Spot ${num(spot)}</span></div></td></tr>`; spotDone = true; }
    const c = price(`OPT:${exp}:${K}:CE`), p = price(`OPT:${exp}:${K}:PE`), dc = L.delta(spot, K, T, 'CE', volFor(K)), dp = L.delta(spot, K, T, 'PE', volFor(K));
    const cell = (k, v) => `<td class="c ${(k.endsWith('CE') ? K < spot : K > spot) ? 'itm' : ''}" data-k="${k}">${num(v)}<div class="bs"><button class="b-btn" data-ob="BUY">B</button><button class="s-btn" data-ob="SELL">S</button><button class="x-btn" data-och title="See chart">📈</button></div></td>`;
    rows += `<tr class="${K === atm ? 'atm' : ''}"><td class="small ${K < spot ? 'itm' : ''}">${dc.toFixed(2)}</td><td class="small ${K < spot ? 'itm' : ''}">${i ? (i > 0 ? '+' : '') + i * STRIKE_STEP : 'ATM'}</td>${cell(`OPT:${exp}:${K}:CE`, c)}<td class="k">${K}</td>${cell(`OPT:${exp}:${K}:PE`, p)}<td class="small ${K > spot ? 'itm' : ''}">${i ? (i > 0 ? '+' : '') + i * STRIKE_STEP : 'ATM'}</td><td class="small ${K > spot ? 'itm' : ''}">${dp.toFixed(2)}</td></tr>`;
  }
  $('#oc').innerHTML = rows;
}
const timeStr = (t) => new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kolkata' });
function renderOrders() {
  const open = S.orders.filter((o) => o.status === 'OPEN').length;
  $('#cOrd').textContent = open;
  $('#ordersBox').innerHTML = S.orders.length ? `<div style="overflow:auto"><table class="tbl"><thead><tr><th>Time</th><th>Type</th><th>Instrument</th><th>Product</th><th class="r">Qty</th><th class="r">Price</th><th>Status</th><th></th></tr></thead><tbody>${S.orders.map((o) => `<tr>
    <td class="mono small">${timeStr(o.time)}</td><td class="${o.side === 'BUY' ? 'up' : o.side === 'SELL' ? 'down' : ''}">${o.side}</td>
    <td>${instName(o.inst)}</td><td><span class="tag2">${o.product}</span><span class="tag2">${o.type}</span></td>
    <td class="r mono">${o.qty}</td><td class="r mono">${o.avg != null ? num(o.avg) : o.limit ? num(o.limit) : 'MKT'}</td>
    <td><span class="st-${o.status}">${o.status}</span>${o.reason ? `<div class="small" style="white-space:normal;max-width:320px">${o.reason}</div>` : ''}</td>
    <td>${o.status === 'OPEN' ? `<button class="mini" data-cancel="${o.id}">Cancel</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
    : '<div class="empty"><b>No orders yet</b>Pick a stock from your watchlist and press B to place your first trade.</div>';
}
function renderPositions() {
  const list = Object.entries(S.positions).filter(([, p]) => p.qty || p.realized);
  $('#cPos').textContent = list.filter(([, p]) => p.qty).length;
  let tot = 0;
  $('#posBox').innerHTML = list.length ? `<div style="overflow:auto"><table class="tbl"><thead><tr><th>Product</th><th>Instrument</th><th class="r">Qty</th><th class="r">Avg</th><th class="r">LTP</th><th class="r">P&amp;L</th><th></th></tr></thead><tbody>${list.map(([key, p]) => {
      const ltp = price(p.inst), pl = (p.qty ? posMtm(p) : 0) + p.realized; tot += pl;
      return `<tr><td><span class="tag2">${p.product}</span></td><td>${instName(p.inst)}</td><td class="r mono ${p.qty > 0 ? 'up' : p.qty < 0 ? 'down' : 'small'}">${p.qty}</td>
      <td class="r mono">${p.qty ? num(p.avg) : '—'}</td><td class="r mono">${ltp != null ? num(ltp) : '—'}</td><td class="r mono ${pl >= 0 ? 'up' : 'down'}">${pl >= 0 ? '+' : ''}${num(pl)}</td>
      <td>${p.qty ? `<button class="mini" data-exit="${key}">Exit</button> <button class="mini" data-add="${key}">Add</button>` : '<span class="small">Closed</span>'}</td></tr>`;
    }).join('')}</tbody></table></div><p class="small" style="margin-top:12px">P&amp;L includes booked profit from closed trades today. Brokerage of ₹20 per executed intraday/F&amp;O order is deducted from your cash.</p>`
    : '<div class="empty"><b>No open positions</b>Intraday (MIS) trades, futures and options show up here.</div>';
  $('#posTotal').innerHTML = list.length ? `<span class="${tot >= 0 ? 'up' : 'down'}">${tot >= 0 ? '+' : ''}${inr(tot, 2)}</span>` : '';
}
function renderHoldings() {
  const list = Object.entries(S.holdings);
  $('#cHold').textContent = list.length;
  const a = account(), pl = a.hv - a.hInv;
  $('#holdBox').innerHTML = list.length ? `<div class="sum"><div><span class="small">Invested</span><b>${inr(a.hInv)}</b></div><div><span class="small">Current value</span><b>${inr(a.hv)}</b></div><div><span class="small">Total P&amp;L</span><b class="${pl >= 0 ? 'up' : 'down'}">${pl >= 0 ? '+' : ''}${inr(pl)}</b></div><div><span class="small">Return</span><b class="${pl >= 0 ? 'up' : 'down'}">${a.hInv ? pct(pl / a.hInv * 100) : '—'}</b></div></div>
    <div style="overflow:auto"><table class="tbl"><thead><tr><th>Stock</th><th class="r">Qty</th><th class="r">Avg cost</th><th class="r">LTP</th><th class="r">Current value</th><th class="r">P&amp;L</th><th class="r">Day</th><th></th></tr></thead><tbody>${list.map(([s, h]) => {
      const q = Q[s], ltp = q ? q.price : h.avg, v = ltp * h.qty, p = (ltp - h.avg) * h.qty;
      return `<tr><td>${s}</td><td class="r mono">${h.qty}</td><td class="r mono">${num(h.avg)}</td><td class="r mono">${num(ltp)}</td><td class="r mono">${num(v)}</td><td class="r mono ${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '+' : ''}${num(p)}</td><td class="r mono">${q ? chg(q.change) : ''}</td><td><button class="mini" data-hsell="${s}">Sell</button> <button class="mini" data-hbuy="${s}">Buy more</button></td></tr>`;
    }).join('')}</tbody></table></div>`
    : '<div class="empty"><b>No holdings yet</b>Buy a stock with the CNC (delivery) product and it will appear here.</div>';
}
function renderFunds() {
  const a = account(), r = (l, v, c = '', help = '') => `<tr><td>${l}${help ? ` <a class="help" href="${help}">?</a>` : ''}</td><td class="r mono ${c}">${v}</td></tr>`;
  $('#fundsBox').innerHTML = `<div class="sum"><div><span class="small">Available to trade</span><b>${inr(a.available)}</b></div><div><span class="small">Used margin</span><b>${inr(a.used)}</b></div><div><span class="small">Holdings value</span><b>${inr(a.hv)}</b></div><div><span class="small">Account net worth</span><b class="${a.worth >= START_CASH ? 'up' : 'down'}">${inr(a.worth)}</b></div></div>
  <div class="glass" style="padding:8px 20px;max-width:640px"><table class="tbl">
    ${r('Cash balance', inr(S.cash, 2))}
    ${r('Margin blocked in positions', '−' + inr(a.used, 2), '', '/learn/fno.html#futures')}
    ${r('Blocked for open orders', '−' + inr(a.blockedOrders, 2))}
    ${r('Unrealised P&amp;L (positions)', (a.mtm >= 0 ? '+' : '') + inr(a.mtm, 2), a.mtm >= 0 ? 'up' : 'down')}
    ${r('Realised P&amp;L (all time)', (S.realized >= 0 ? '+' : '') + inr(S.realized, 2), S.realized >= 0 ? 'up' : 'down')}
    ${r('Brokerage paid', inr(S.charges, 2))}
    ${r('<b>Available margin</b>', '<b>' + inr(a.available, 2) + '</b>')}
  </table></div>
  <p class="small" style="margin-top:16px;max-width:640px">How margin works here: delivery (CNC) buys use the full amount. Intraday (MIS) stock trades block 20% (5× leverage). Futures and option selling block about 12% of contract value. Option buying blocks the premium. Real brokers use SEBI's SPAN + exposure margins, which vary daily.</p>`;
}
function render(dataTick) {
  renderTop(); renderWl(); renderChartHead();
  if ($('#p-chain').classList.contains('on')) renderChain();
  renderOrders(); renderPositions(); renderHoldings(); renderFunds();
  if (dataTick && range === '1d' && !R.on && (demo || marketOpen())) loadChart(true); // live: chart keeps moving
}

/* ---------- order window ---------- */
let OW = null;
function openOrder(inst, side, opts = {}) {
  const p = parse(inst);
  if (price(inst) == null) return toast('Price not loaded yet. Try again in a moment.', 'err');
  const fno = isFno(inst);
  OW = { inst, side, product: opts.product || (fno ? 'NRML' : 'CNC'), type: 'MARKET' };
  $('#omName').textContent = instName(inst);
  $('#omSub').textContent = fno ? `NFO · Lot size ${NIFTY_LOT} · expires ${fmtExp(p.exp)}` : 'NSE · ' + (UNIVERSE[p.sym] || 'Equity');
  $('#omProd').innerHTML = fno
    ? `<button data-v="NRML">Overnight <small class="small">NRML</small></button><button data-v="MIS">Intraday <small class="small">MIS</small></button><a class="help" href="/learn/fno.html#futures" title="Products" style="align-self:center">?</a>`
    : `<button data-v="CNC">Delivery <small class="small">CNC</small></button><button data-v="MIS">Intraday <small class="small">MIS</small></button><a class="help" href="/learn/sebi.html#settlement" title="Delivery vs intraday" style="align-self:center">?</a>`;
  $('#omQtyL').textContent = fno ? 'Lots (1 lot = ' + NIFTY_LOT + ')' : 'Quantity';
  $('#omQty').value = opts.qty ? (fno ? opts.qty / NIFTY_LOT : opts.qty) : 1;
  $$('#omType button').forEach((b) => b.classList.toggle('on', b.dataset.v === 'MARKET'));
  $('#omPx').value = price(inst).toFixed(2); $('#omPx').disabled = true;
  setSide(side); setProd(OW.product);
  $('#ovl').classList.add('on'); setTimeout(() => $('#omQty').focus(), 50);
}
function setSide(s) { OW.side = s; $('#om').className = 'om ' + (s === 'BUY' ? 'buy' : 'sell'); $('#omGo').textContent = s === 'BUY' ? 'Buy' : 'Sell'; omCalc(); }
function setProd(v) { OW.product = v; $$('#omProd button').forEach((b) => b.classList.toggle('on', b.dataset.v === v)); omCalc(); }
function omQty() { const n = Math.floor(+$('#omQty').value); return isFno(OW.inst) ? n * NIFTY_LOT : n; }
function omCalc() {
  if (!OW) return;
  const qty = omQty(), px = OW.type === 'LIMIT' ? +$('#omPx').value : price(OW.inst);
  const fake = { inst: OW.inst, side: OW.side, qty, product: OW.product };
  const m = qty > 0 && px > 0 ? incMargin(fake, px) : 0;
  $('#omMar').textContent = inr(m, 2);
  $('#omAvail').textContent = inr(account().available, 2);
  let w = '';
  const p = parse(OW.inst);
  if (!(qty > 0)) w = 'Enter a quantity of at least 1.';
  else if (p.t === 'EQ' && OW.product === 'CNC' && OW.side === 'SELL') { const h = S.holdings[p.sym]; if (!h || h.qty < qty) w = `You hold ${h ? h.qty : 0} shares. To short-sell, switch to Intraday (MIS).`; }
  else if (m > account().available) w = 'Not enough virtual funds for this order.';
  else if (p.t === 'OPT' && OW.side === 'SELL') w = 'Selling options carries large or unlimited risk. That\'s why margin is high.';
  else if (p.t === 'OPT' && OW.side === 'BUY') w = `Maximum loss: the premium, ${inr(px * qty)}.`;
  $('#omWarn').textContent = w;
  $('#omExplain').innerHTML = qty > 0 && px > 0 ? '<b>In plain words:</b> ' + explain(p, OW.side, qty, px, OW.product) : '';
}
function explain(p, side, qty, px, product) {
  const val = inr(qty * px), buy = side === 'BUY';
  if (p.t === 'EQ') {
    if (product === 'CNC') return buy ? `You buy <b>${qty} share${qty > 1 ? 's' : ''} of ${p.sym}</b> for about <b>${val}</b>. The money leaves your trading balance now, and the shares go to your <b>Holdings</b> (your demat). You can keep them for as long as you like.`
      : `You sell <b>${qty} share${qty > 1 ? 's' : ''} of ${p.sym}</b> from your Holdings for about <b>${val}</b>. The money comes back to your trading balance.`;
    return buy ? `<b>Intraday buy</b> of ${qty} ${p.sym} (worth ${val}) using only 20% of the money as margin. Profit if the price rises today. It shows in <b>Positions</b>, and you should close it before the market ends.`
      : `<b>Intraday short sell</b>: you sell ${qty} ${p.sym} you don't own (worth ${val}), hoping to buy them back cheaper later today. You profit if the price <b>falls</b> and lose if it rises.`;
  }
  if (p.t === 'FUT') return buy ? `You agree to <b>buy Nifty</b> at ${num(px)} on ${fmtExp(p.exp)}. Each point Nifty rises earns you ₹${qty}. Each point it falls costs you ₹${qty}. You only deposit margin (~12%) now.`
    : `You agree to <b>sell Nifty</b> at ${num(px)} on ${fmtExp(p.exp)}. You earn ₹${qty} for every point Nifty <b>falls</b>, and lose ₹${qty} for every point it rises.`;
  const be = p.type === 'CE' ? p.K + px : p.K - px, dirn = p.type === 'CE' ? 'above' : 'below';
  return buy ? `You pay <b>${val}</b> (₹${num(px)} × ${qty}) for the right to profit if Nifty ends <b>${dirn} ${num(be, 0)}</b> on ${fmtExp(p.exp)}. If it doesn't, you can lose the whole ${val}. That is also the most you can lose.`
    : `You <b>receive ${val}</b> now, but you must pay the buyer if Nifty ends ${dirn} ${p.K} on ${fmtExp(p.exp)}. You keep the full ${val} only if it doesn't. Losses can be much bigger than what you received.`;
}
function closeOrder() { $('#ovl').classList.remove('on'); OW = null; }
$('#omSide').onclick = () => setSide(OW.side === 'BUY' ? 'SELL' : 'BUY');
$('#omProd').onclick = (e) => { const b = e.target.closest('button'); if (b) setProd(b.dataset.v); };
$('#omType').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; OW.type = b.dataset.v; $$('#omType button').forEach((x) => x.classList.toggle('on', x === b)); $('#omPx').disabled = OW.type === 'MARKET'; if (OW.type === 'MARKET') $('#omPx').value = price(OW.inst).toFixed(2); omCalc(); };
$('#omQty').oninput = omCalc; $('#omPx').oninput = omCalc;
$('#omCancel').onclick = closeOrder;
$('#ovl').onclick = (e) => { if (e.target.id === 'ovl') closeOrder(); };
$('#omGo').onclick = () => {
  const o = { inst: OW.inst, side: OW.side, qty: omQty(), product: OW.product, type: OW.type, limit: OW.type === 'LIMIT' ? tick(+$('#omPx').value) : null };
  closeOrder(); newOrder(o); render();
};
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeOrder();
  if (e.key === 'Enter' && OW && document.activeElement && document.activeElement.closest('#om')) $('#omGo').click();
});

/* ---------- interactions ---------- */
function selectInst(k) { if (R.on) stopReplay(); selInst = k; sel = 'NIFTY'; tab('chart'); renderWl(); renderChartHead(); loadChart(); }
function selectSym(s) { if (R.on) stopReplay(); sel = s; selInst = null; range = '1d'; $$('#cRanges .chip').forEach((c) => c.classList.toggle('on', c.dataset.r === '1d')); tab('chart'); renderWl(); renderChartHead(); loadChart(); $('#wl').classList.remove('on'); }
function tab(t) { $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === t)); $$('.pane').forEach((p) => p.classList.toggle('on', p.id === 'p-' + t)); if (t === 'chain') renderChain(); if (t === 'chart') setTimeout(drawChart, 0); }
$('#tabs').onclick = (e) => { const b = e.target.closest('button'); if (b) tab(b.dataset.t); };
$('#list').onclick = (e) => {
  const row = e.target.closest('.wr'); if (!row) return; const s = row.dataset.s;
  if (e.target.closest('[data-x]')) { S.wl = S.wl.filter((x) => x !== s); save(); renderWl(); return; }
  if (e.target.closest('[data-chain]')) { tab('chain'); $('#wl').classList.remove('on'); return; }
  if (e.target.closest('[data-b]')) return openOrder('EQ:' + s, 'BUY');
  if (e.target.closest('[data-sl]')) return openOrder('EQ:' + s, 'SELL');
  selectSym(s);
};
const futKey = () => 'FUT:' + monthlyExpiry();
$('#cBuy').onclick = () => openOrder(selInst || (sel === 'NIFTY' ? futKey() : 'EQ:' + sel), 'BUY');
$('#cSell').onclick = () => openOrder(selInst || (sel === 'NIFTY' ? futKey() : 'EQ:' + sel), 'SELL');
$('#ocFut').onclick = () => openOrder(futKey(), 'BUY');
$('#ocExp').onchange = renderChain;
$('#oc').onclick = (e) => { const td = e.target.closest('td.c'); if (!td) return; if (e.target.closest('[data-och]')) return selectInst(td.dataset.k); const b = e.target.closest('[data-ob]'); openOrder(td.dataset.k, b ? b.dataset.ob : 'BUY'); };
$('#cRanges').onclick = (e) => { const b = e.target.closest('.chip'); if (!b) return; range = b.dataset.r; $$('#cRanges .chip').forEach((c) => c.classList.toggle('on', c === b)); loadChart(); };
$('#ordersBox').onclick = (e) => { const b = e.target.closest('[data-cancel]'); if (b) cancel(+b.dataset.cancel); };
$('#posBox').onclick = (e) => {
  const x = e.target.closest('[data-exit]'), a = e.target.closest('[data-add]');
  if (x) { const p = S.positions[x.dataset.exit]; newOrder({ inst: p.inst, side: p.qty > 0 ? 'SELL' : 'BUY', qty: Math.abs(p.qty), product: p.product, type: 'MARKET' }); render(); }
  if (a) { const p = S.positions[a.dataset.add]; openOrder(p.inst, p.qty > 0 ? 'BUY' : 'SELL', { product: p.product }); }
};
$('#holdBox').onclick = (e) => {
  const s = e.target.closest('[data-hsell]'), b = e.target.closest('[data-hbuy]');
  if (s) openOrder('EQ:' + s.dataset.hsell, 'SELL', { product: 'CNC', qty: S.holdings[s.dataset.hsell].qty });
  if (b) openOrder('EQ:' + b.dataset.hbuy, 'BUY', { product: 'CNC' });
};
$('#addFunds').onclick = () => { S.cash += 100000; save(); render(); toast('Added ₹1,00,000 of virtual money'); };
$('#resetAcct').onclick = () => {
  const b = $('#resetAcct');
  if (b.dataset.sure) { const wl = S.wl; S = fresh(); S.wl = wl; save(); render(); toast('Account reset to ₹10,00,000'); b.textContent = 'Reset account'; delete b.dataset.sure; }
  else { b.dataset.sure = 1; b.textContent = 'Click again to confirm'; setTimeout(() => { b.textContent = 'Reset account'; delete b.dataset.sure; }, 4000); }
};
$('#mobWl').onclick = () => $('#wl').classList.toggle('on');

/* search */
let si = 0;
function sugg() {
  const t = $('#q').value.trim().toUpperCase();
  if (!t) { $('#sugg').style.display = 'none'; return; }
  const hits = Object.entries({ NIFTY: 'Nifty 50 index (F&O)', ...UNIVERSE }).filter(([s, n]) => s.includes(t) || n.toUpperCase().includes(t)).slice(0, 8);
  if (!hits.some(([s]) => s === t) && /^[A-Z0-9&\-]{2,20}$/.test(t)) hits.push([t, 'Try any NSE symbol →']);
  si = Math.min(si, hits.length - 1);
  $('#sugg').innerHTML = hits.map(([s, n], i) => `<div data-add="${s}" class="${i === si ? 'on' : ''}"><b>${s}</b><span class="small">${S.wl.includes(s) ? '✓ added' : n}</span></div>`).join('');
  $('#sugg').style.display = hits.length ? 'block' : 'none';
}
async function addSym(s) {
  $('#q').value = ''; $('#sugg').style.display = 'none';
  if (S.wl.includes(s)) return selectSym(s);
  if (S.wl.length >= 20) return toast('Watchlist is full (20). Remove one first.', 'err');
  if (s !== 'NIFTY' && !UNIVERSE[s] && !demo) {
    try { const j = await L.quotes([ySym(s)]); if (!j.quotes.length) throw 0; Q[s] = j.quotes[0]; }
    catch (e) { return toast(`Couldn't find "${s}" on NSE`, 'err'); }
  }
  S.wl.unshift(s); save(); selectSym(s); refresh();
}
$('#q').oninput = () => { si = 0; sugg(); };
$('#q').onkeydown = (e) => {
  const items = $$('#sugg div');
  if (e.key === 'ArrowDown') { si = Math.min(items.length - 1, si + 1); sugg(); e.preventDefault(); }
  if (e.key === 'ArrowUp') { si = Math.max(0, si - 1); sugg(); e.preventDefault(); }
  if (e.key === 'Enter' && items[si]) addSym(items[si].dataset.add);
};
$('#sugg').onclick = (e) => { const d = e.target.closest('[data-add]'); if (d) addSym(d.dataset.add); };
document.addEventListener('click', (e) => { if (!e.target.closest('.search')) $('#sugg').style.display = 'none'; });


/* ---------- boot ---------- */
$$('[data-brand]').forEach((e) => (e.textContent = BRAND)); document.title = document.title.replace(/LEDGER/g, BRAND);
const want = new URLSearchParams(location.search).get('tab'); if (want) tab(want);
/* AI tutor sees what the learner is looking at */
window.AI_CONTEXT = () => {
  const a = account(), cur = $$('#tabs button').find((b) => b.classList.contains('on')).dataset.t;
  const pos = Object.values(S.positions).filter((p) => p.qty).map((p) => `${instName(p.inst)} qty ${p.qty} avg ${num(p.avg)} now ${num(price(p.inst) ?? 0)}`).join('; ');
  const hold = Object.entries(S.holdings).map(([s, h]) => `${s} ${h.qty} @ ${num(h.avg)}`).join('; ');
  return `Page: LEDGER live trading terminal (virtual money). Open tab: ${cur}. Chart shows: ${selInst ? instName(selInst) : sel}${R.on ? ' (replaying a past session)' : ''}. Nifty spot ${spot ? num(spot) : 'n/a'}. Market ${marketOpen() ? 'open' : 'closed'}. `
    + `Virtual account: available ${inr(a.available)}, used margin ${inr(a.used)}. Holdings: ${hold || 'none'}. Open positions: ${pos || 'none'}. `
    + (OW ? `The learner has an order window open: ${OW.side} ${instName(OW.inst)} product ${OW.product}. ` : '');
};
window.AI_SUGGEST = () => [selInst || sel === 'NIFTY' ? 'Explain what this option/future is in simple words' : `What does this ${sel} chart tell me?`, 'How do I read the option chain?', 'Explain my positions and P&L', 'What is the difference between CNC and MIS?'];
L.loadAI();
render(); refresh().then(loadChart);
setInterval(refresh, 30000);
setInterval(() => { if ($('#p-chain').classList.contains('on')) renderChain(); renderTop(); }, 15000);
})();
