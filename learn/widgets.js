/* ===== LEDGER lesson widgets: small hands-on labs. Each returns an optional cleanup function. ===== */
const W = (() => {
const { $, $$, inr, num, pct, lakh } = L;
const q = (el, s) => el.querySelector(s), qa = (el, s) => [...el.querySelectorAll(s)];
const out = (items) => `<div class="out">${items.map(([l, id, c = '']) => `<div><span class="small">${l}</span><b id="${id}" class="${c}"></b></div>`).join('')}</div>`;
const slider = (id, label, min, max, step, val) => `<label class="sl">${label} <b id="${id}V"></b></label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}">`;
const bind = (el, ids, fn) => { ids.forEach((i) => (q(el, '#' + i).oninput = fn)); fn(); };
const v = (el, id) => +q(el, '#' + id).value;
const set = (el, id, t, cls) => { const e = q(el, '#' + id); e.innerHTML = t; if (cls != null) e.className = cls; };
let SPOT = 25000; L.quotes(['^NSEI']).then((j) => (SPOT = j.quotes[0].price)).catch(() => {});

return {
inflation(el) {
  el.innerHTML = slider('iy', 'Years from now', 0, 30, 1, 10) + slider('ir', 'Inflation per year', 2, 10, 0.5, 6) + out([['Notes in your cupboard', 'i1'], ['What they can actually buy', 'i2', 'down'], ['A ₹10 samosa will cost', 'i3']]);
  bind(el, ['iy', 'ir'], () => { const y = v(el, 'iy'), r = v(el, 'ir') / 100, f = Math.pow(1 + r, y); set(el, 'iyV', y + ' years'); set(el, 'irV', v(el, 'ir') + '%'); set(el, 'i1', '₹1,00,000'); set(el, 'i2', inr(100000 / f)); set(el, 'i3', inr(10 * f, 0)); });
},
chai(el) {
  let n = 0;
  el.innerHTML = `<div class="row"><button class="pill green" id="cb">Buy 1 share (₹10,000)</button><button class="ghost" id="cr">Reset</button></div>
  <div style="display:grid;grid-template-columns:repeat(20,1fr);gap:4px;margin-top:18px" id="cg"></div>` + out([['You own', 'c1', 'up'], ['Your share of ₹1L profit', 'c2'], ['You paid', 'c3']]);
  const draw = () => { q(el, '#cg').innerHTML = Array.from({ length: 100 }, (_, i) => `<i style="aspect-ratio:1;border-radius:4px;background:${i < n ? 'var(--g1)' : '#1c1c21'};transition:background .3s"></i>`).join(''); set(el, 'c1', n + '% of the shop'); set(el, 'c2', inr(n * 1000)); set(el, 'c3', inr(n * 10000)); };
  q(el, '#cb').onclick = () => { if (n < 100) n++; draw(); }; q(el, '#cr').onclick = () => { n = 0; draw(); }; draw();
},
match(el) {
  el.innerHTML = `<button class="pill green" id="mg">Buy 1 share at ₹500</button><div class="flow" id="mf"><div class="node"><b>🙋 You</b><span>want to buy @ ₹500</span></div><div class="arrow">→</div><div class="node"><b>🏛️ NSE</b><span>looks for a seller</span></div><div class="arrow">→</div><div class="node"><b>🙋‍♂️ Ravi</b><span>wants to sell @ ₹500</span></div></div><div class="flowtxt" id="mt"></div>`;
  const msgs = ['You send your order through your broker app…', 'NSE scans everyone who wants to sell…', 'Found Ravi! He sells you 1 share for ₹500. ✓ Done in under a second.']; let t = [];
  q(el, '#mg').onclick = () => { t.forEach(clearTimeout); qa(el, '.node').forEach((n) => n.classList.remove('lit')); qa(el, '.node').forEach((n, i) => t.push(setTimeout(() => { n.classList.add('lit'); set(el, 'mt', msgs[i]); }, i * 1200))); };
  return () => t.forEach(clearTimeout);
},
scam(el) {
  const S = [['Telegram "VIP Calls 🚀"', 'Guaranteed 5% daily profit! Pay ₹4,999 to join. Limited seats!', 1, 'Guarantees + urgency + payment = scam.'], ['Your broker (email)', 'Your contract note for today\'s trades is attached. Contact support in the app if something is wrong.', 0, 'Brokers must send contract notes. It asks for nothing.'], ['Phone call', 'Sir, your demat is blocked. Tell me the OTP you just got.', 1, 'Nobody genuine ever asks for an OTP.'], ['WhatsApp link', 'Download "NSE Pro Trade" app from this link for special IPO allotment.', 1, 'Fake apps show fake profits and block withdrawals.']];
  let i = 0, s = 0;
  const draw = () => { if (i >= S.length) { el.innerHTML = `<div class="stat ${s >= 3 ? 'up' : ''}">${s}/${S.length}</div><p class="small">${s >= 3 ? 'Sharp! Hard to fool you.' : 'Scammers are clever. Re-read and try again.'}</p><button class="ghost" id="sa">Play again</button>`; q(el, '#sa').onclick = () => { i = s = 0; draw(); }; return; }
    el.innerHTML = `<div class="msg-card"><div class="small">${S[i][0]} · ${i + 1}/${S.length}</div><div style="font-size:18px;margin-top:6px">${S[i][1]}</div></div><div class="row" style="margin-top:14px"><button class="pill" style="background:var(--red);color:#fff" data-a="1">🚩 Scam</button><button class="pill green" data-a="0">✓ Real</button></div><div class="flowtxt" id="sw"></div>`;
    qa(el, '[data-a]').forEach((b) => (b.onclick = () => { const ok = +b.dataset.a === S[i][2]; if (ok) s++; qa(el, '[data-a]').forEach((x) => (x.disabled = true)); set(el, 'sw', `<b class="${ok ? 'up' : 'down'}">${ok ? 'Correct.' : 'Careful!'}</b> ${S[i][3]} <button class="ghost" id="sn" style="padding:6px 14px;margin-left:8px">Next →</button>`); q(el, '#sn').onclick = () => { i++; draw(); }; }));
  }; draw();
},
accounts(el) {
  let A = { bank: 50000, trade: 0, sh: 0 };
  el.innerHTML = `<div class="row" style="gap:8px"><button class="chip" data-x="add">1. Add ₹20,000 to trading</button><button class="chip" data-x="buy">2. Buy 5 shares @ ₹1,600</button><button class="chip" data-x="sell">3. Sell 5 @ ₹1,700</button><button class="chip" data-x="out">4. Withdraw to bank</button><button class="ghost" data-x="r">Reset</button></div>
  <div class="accts"><div class="acct" id="aB"><div style="font-size:28px">🏦</div><b>Bank</b><div class="mono" id="vB"></div></div><div class="link" id="l1">⇄</div><div class="acct" id="aT"><div style="font-size:28px">📱</div><b>Trading</b><div class="mono" id="vT"></div></div><div class="link" id="l2">⇄</div><div class="acct" id="aD"><div style="font-size:28px">🗄️</div><b>Demat</b><div class="mono" id="vD"></div></div></div><div class="flowtxt" id="at">Start with step 1.</div>`;
  const draw = (lit = []) => { set(el, 'vB', inr(A.bank)); set(el, 'vT', inr(A.trade)); set(el, 'vD', A.sh + ' shares'); ['aB', 'aT', 'aD', 'l1', 'l2'].forEach((id) => q(el, '#' + id).classList.toggle('lit', lit.includes(id))); };
  const X = { add() { if (A.bank < 20000) return 'Not enough in the bank.'; A.bank -= 20000; A.trade += 20000; draw(['aB', 'l1', 'aT']); return 'Money moved from bank → trading account. Now you can buy.'; },
    buy() { if (A.trade < 8000) return 'Add money to trading first (step 1).'; A.trade -= 8000; A.sh += 5; draw(['aT', 'l2', 'aD']); return '₹8,000 left trading. 5 shares land in your demat (next working day).'; },
    sell() { if (A.sh < 5) return 'You have no shares. Buy first.'; A.sh -= 5; A.trade += 8500; draw(['aD', 'l2', 'aT']); return 'Shares left demat. ₹8,500 came to trading: ₹500 profit!'; },
    out() { if (!A.trade) return 'Nothing to withdraw.'; A.bank += A.trade; const t = A.trade; A.trade = 0; draw(['aT', 'l1', 'aB']); return inr(t) + ' sent back to your bank. Usually arrives within a day.'; },
    r() { A = { bank: 50000, trade: 0, sh: 0 }; draw(); return 'Start with step 1.'; } };
  qa(el, '[data-x]').forEach((b) => (b.onclick = () => set(el, 'at', X[b.dataset.x]()))); draw();
},
buyflow(el) {
  let qty = 2, done = false; const P = 1500;
  el.innerHTML = `<div class="phone"><div class="small">Chai Express Ltd · NSE</div><div class="mono" style="font-size:28px;font-weight:600">₹1,500.00 <span class="up" style="font-size:14px">+1.2%</span></div>
  <div class="row" style="margin:16px 0"><button class="chip on">Delivery (CNC)</button><button class="chip" id="bi">Intraday (MIS)</button></div>
  <div class="row"><button class="ghost" id="bm">−</button><b class="mono" id="bq" style="font-size:22px;min-width:40px;text-align:center"></b><button class="ghost" id="bp">+</button><span class="small">shares</span></div>
  <div class="row" style="justify-content:space-between;margin-top:16px"><span class="small">You pay</span><b class="mono" id="bt"></b></div>
  <button class="pill green" style="width:100%;margin-top:16px" id="bg">Swipe to buy</button></div><div class="flowtxt" id="bx"></div>`;
  const draw = () => { set(el, 'bq', qty); set(el, 'bt', inr(qty * P)); };
  q(el, '#bm').onclick = () => { qty = Math.max(1, qty - 1); draw(); }; q(el, '#bp').onclick = () => { qty = Math.min(3, qty + 1); draw(); if (qty === 3) set(el, 'bx', 'Max 3: you only have ₹5,000.'); };
  q(el, '#bi').onclick = () => set(el, 'bx', 'Intraday means you MUST sell before 3:30 pm today. Stick with Delivery for now.');
  q(el, '#bg').onclick = () => { if (done) return; done = true; set(el, 'bx', `✅ Order placed: ${qty} shares for ${inr(qty * P)}. ₹${(5000 - qty * P).toLocaleString('en-IN')} left in trading. Shares reach your demat tomorrow (T+1).`); q(el, '#bg').textContent = 'Bought ✓'; };
  draw();
},
crowd(el) {
  let p = [500], shock = 0, st = 0;
  el.innerHTML = `<div class="grid2"><div>${slider('cb2', '🙋 Buyers', 0, 100, 1, 50)}${slider('cs', '🙋‍♂️ Sellers', 0, 100, 1, 50)}<div class="row" style="margin-top:18px"><button class="chip" data-n="1">📈 Great profit news</button><button class="chip" data-n="-1">📉 Fraud rumour</button></div><div class="flowtxt" id="cx">Move the sliders.</div></div>
  <div><div class="row" style="justify-content:space-between"><span class="small">Demo share</span><b class="mono" id="cp" style="font-size:24px"></b></div><canvas class="chart" id="cc"></canvas></div></div>`;
  qa(el, '[data-n]').forEach((b) => (b.onclick = () => { shock = +b.dataset.n; st = 14; set(el, 'cx', shock > 0 ? 'Good news → everyone wants to buy → price jumps.' : 'Panic → everyone sells → price falls.'); }));
  const t = setInterval(() => { const B = v(el, 'cb2'), S = v(el, 'cs'); set(el, 'cb2V', B); set(el, 'csV', S); const imb = (B - S) / 100 + (st-- > 0 ? shock : 0); p.push(Math.max(1, p.at(-1) * (1 + imb * 0.006 + (Math.random() - 0.5) * 0.004))); if (p.length > 80) p.shift(); const c = (p.at(-1) / 500 - 1) * 100; set(el, 'cp', `${inr(p.at(-1), 2)} <span class="${c >= 0 ? 'up' : 'down'}" style="font-size:13px">${pct(c)}</span>`); L.line(q(el, '#cc'), p, c >= 0 ? '#00e38c' : '#ff453a', { animate: false }); }, 300);
  return () => clearInterval(t);
},
returnsSimple(el) {
  el.innerHTML = `<div class="grid2"><div>${slider('rb', 'Bought at', 50, 500, 5, 100)}${slider('rs', 'Sold at', 20, 800, 5, 160)}${slider('rq', 'Shares', 1, 200, 1, 50)}${slider('rd', 'Dividend per share per year', 0, 20, 1, 3)}${slider('ry', 'Years held', 1, 15, 1, 3)}</div><div><div class="small">Total profit</div><div class="stat" id="rt"></div>${out([['From price', 'r1'], ['From dividends', 'r2'], ['Per year', 'r3']])}</div></div>`;
  bind(el, ['rb', 'rs', 'rq', 'rd', 'ry'], () => { const b = v(el, 'rb'), s = v(el, 'rs'), n = v(el, 'rq'), d = v(el, 'rd'), y = v(el, 'ry'); ['rb', 'rs'].forEach((k) => set(el, k + 'V', inr(v(el, k)))); set(el, 'rqV', n); set(el, 'rdV', inr(d)); set(el, 'ryV', y + ' yrs'); const cg = (s - b) * n, dv = d * n * y, inv = b * n, t = cg + dv; set(el, 'rt', (t >= 0 ? '+' : '') + inr(t), 'stat ' + (t >= 0 ? 'up' : 'down')); set(el, 'r1', inr(cg)); set(el, 'r2', inr(dv)); set(el, 'r3', ((Math.pow((inv + t) / inv, 1 / y) - 1) * 100).toFixed(1) + '%'); });
},
returns(el) {
  el.innerHTML = `<div class="grid2"><div>${slider('tb', 'Bought at', 100, 3000, 10, 1000)}${slider('ts', 'Sold at', 100, 6000, 10, 1600)}${slider('tq', 'Shares', 1, 500, 1, 100)}${slider('ty', 'Months held', 1, 60, 1, 18)}</div><div><div class="small">Profit before tax</div><div class="stat" id="tp"></div>${out([['Tax type', 't1'], ['Tax', 't2', 'down'], ['You keep', 't3', 'up']])}</div></div>`;
  bind(el, ['tb', 'ts', 'tq', 'ty'], () => { const b = v(el, 'tb'), s = v(el, 'ts'), n = v(el, 'tq'), m = v(el, 'ty'); set(el, 'tbV', inr(b)); set(el, 'tsV', inr(s)); set(el, 'tqV', n); set(el, 'tyV', m + ' months'); const g = (s - b) * n; let tax = 0, ty = 'No tax (loss)'; if (g > 0) { if (m < 12) { tax = g * 0.2; ty = 'Short-term, 20%'; } else { tax = Math.max(0, g - 125000) * 0.125; ty = 'Long-term, 12.5% above ₹1.25L'; } } set(el, 'tp', inr(g), 'stat ' + (g >= 0 ? 'up' : 'down')); set(el, 't1', ty); set(el, 't2', inr(tax)); set(el, 't3', inr(g - tax)); });
},
niftyLive(el) {
  el.innerHTML = `<div class="row" style="justify-content:space-between"><div><div class="small">NIFTY 50</div><div class="mono" style="font-size:28px;font-weight:600" id="np">—</div><div id="nc" class="mono small"></div></div><div class="row" id="nr"><button class="chip on" data-r="1d">Today</button><button class="chip" data-r="1mo">1M</button><button class="chip" data-r="1y">1Y</button><button class="chip" data-r="5y">5Y</button></div></div><div class="chartbox" id="nb"></div><div class="small" id="nn"></div>`;
  const ch = LChart.create(q(el, '#nb'), { type: 'area' });
  const load = async (r) => { try { const k = (await L.quotes(['^NSEI'], r, { candles: true })).quotes[0], c = r === '1d' ? k.change : (k.price / k.candles[0].c - 1) * 100; set(el, 'np', num(k.price)); set(el, 'nc', `<span class="${c >= 0 ? 'up' : 'down'}">${pct(c)}</span> ${r === '1d' ? 'today' : 'over this period'}`); ch.set(k.candles, { animate: true }); set(el, 'nn', 'Real data, about 15 minutes delayed. Hover to read values.'); } catch (e) { ch.set(L.walk(120, 24000, 0.01, r === '5y' ? 0.004 : 0.0005), { animate: true }); set(el, 'nn', 'Live data shows on the published site. This is an example shape.'); } };
  q(el, '#nr').onclick = (e) => { const b = e.target.closest('[data-r]'); if (!b) return; qa(el, '[data-r]').forEach((x) => x.classList.toggle('on', x === b)); load(b.dataset.r); }; load('1d');
},
pool(el) {
  el.innerHTML = `<button class="pill green" id="pg">Start the fund</button><div class="pool"><div class="box"><b>👥 Investors</b><div class="small" id="p1">0</div><div class="dots" id="d1">${'<i></i>'.repeat(40)}</div></div><div class="arrow">→</div><div class="box"><b>👩‍💼 Fund manager</b><div class="small" id="p2">₹0</div></div><div class="arrow">→</div><div class="box"><b>📊 50 companies</b><div class="small" id="p3">0</div><div class="dots st" id="d2">${'<i></i>'.repeat(30)}</div></div></div>`;
  let t = []; q(el, '#pg').onclick = () => { t.forEach(clearTimeout); qa(el, '.dots i').forEach((i) => i.classList.remove('on'));
    qa(el, '#d1 i').forEach((d, i) => t.push(setTimeout(() => { d.classList.add('on'); set(el, 'p1', (i + 1) * 25 + ' people × ₹500'); set(el, 'p2', inr((i + 1) * 25 * 500) + ' pooled'); }, i * 40)));
    qa(el, '#d2 i').forEach((d, i) => t.push(setTimeout(() => { d.classList.add('on'); set(el, 'p3', Math.round((i + 1) * 50 / 30) + ' companies bought'); }, 1800 + i * 50))); };
  return () => t.forEach(clearTimeout);
},
sip(el) {
  el.innerHTML = `<div class="grid2"><div>${slider('sa', 'Every month', 500, 50000, 500, 2000)}${slider('sy', 'For', 1, 30, 1, 15)}${slider('sr', 'Yearly return (assumed)', 4, 16, 0.5, 12)}<div class="small" style="margin-top:20px">You'll have about</div><div class="stat grad" id="sv"></div>${out([['You put in', 's1'], ['Growth', 's2', 'up'], ['Multiplied', 's3']])}</div><div class="chartbox" id="sc" style="height:300px"></div></div>`;
  const ch = LChart.create(q(el, '#sc'), { type: 'area', color: '#00b3ff', fmt: (x) => lakh(x) });
  let first = true;
  bind(el, ['sa', 'sy', 'sr'], () => { const a = v(el, 'sa'), y = v(el, 'sy'), r = v(el, 'sr') / 1200; set(el, 'saV', inr(a)); set(el, 'syV', y + ' years'); set(el, 'srV', v(el, 'sr') + '%'); let x = 0; const val = [0], put = [0]; for (let m = 1; m <= y * 12; m++) { x = (x + a) * (1 + r); val.push(x); put.push(a * m); } set(el, 'sv', lakh(x)); set(el, 's1', lakh(a * y * 12)); set(el, 's2', lakh(x - a * y * 12)); set(el, 's3', (x / (a * y * 12)).toFixed(1) + '×'); ch.set(val, { overlays: [{ values: put, label: 'put in' }], animate: first }); first = false; });
},
diversify(el) {
  let N = 1, crash = false;
  el.innerHTML = `<div class="row"><span class="small">Split ₹1,00,000 into</span><button class="chip on" data-n="1">1 stock</button><button class="chip" data-n="5">5 stocks</button><button class="chip" data-n="20">20 stocks</button><button class="pill" style="background:var(--red);color:#fff" id="dc">💥 Crash one company</button></div><div class="port" id="dp"></div><div class="row" style="justify-content:space-between;margin-top:14px"><span class="small">Your money now</span><b class="stat" id="dv" style="font-size:32px"></b></div>`;
  const draw = () => { q(el, '#dp').innerHTML = Array.from({ length: 20 }, (_, i) => `<i class="${i >= N ? 'off' : ''} ${crash && i === 0 ? 'dead' : ''}"></i>`).join(''); const val = crash ? 100000 - (100000 / N) * 0.9 : 100000; set(el, 'dv', inr(val), 'stat ' + (crash ? (val < 50000 ? 'down' : 'up') : '')); };
  qa(el, '[data-n]').forEach((b) => (b.onclick = () => { N = +b.dataset.n; crash = false; qa(el, '[data-n]').forEach((x) => x.classList.toggle('on', x === b)); draw(); }));
  q(el, '#dc').onclick = () => { crash = true; draw(); }; draw();
},
orderbook(el) {
  let book, ltp, type = 'LIMIT';
  el.innerHTML = `<div class="row"><button class="chip on" data-t="LIMIT">Limit</button><button class="chip" data-t="MARKET">Market</button><input class="inp" id="op" type="number" step="0.05" value="1499"><input class="inp" id="oq" type="number" value="150"><button class="pill green" id="ob">Buy</button><button class="pill" style="background:var(--red);color:#fff" id="os">Sell</button><button class="ghost" id="or">Reset</button></div><div class="small" style="margin-top:8px">Price · Quantity</div><div class="book"><div><h4 class="up">BIDS · buyers waiting</h4><div id="bb"></div></div><div><h4 class="down">ASKS · sellers waiting</h4><div id="ba"></div></div></div><div class="row" style="justify-content:space-between;margin-top:12px"><div>Last price <b class="mono" id="lt"></b></div><div class="small" id="sp"></div></div><div class="log" id="lg"></div>`;
  const init = () => { book = { b: [[1500, 220], [1499.5, 340], [1499, 180], [1498.5, 500]], a: [[1500.5, 150], [1501, 300], [1501.5, 90], [1502, 410]] }; ltp = 1500.25; q(el, '#lg').innerHTML = ''; draw(); };
  const draw = () => { const mx = Math.max(...book.b.map((x) => x[1]), ...book.a.map((x) => x[1]), 1); const row = (c) => ([p, n]) => `<div class="lvl ${c}"><i style="width:${(n / mx) * 100}%"></i><span>${num(p)}</span><span>${n}</span></div>`; q(el, '#bb').innerHTML = book.b.map(row('bid')).join('') || '<span class="small">none</span>'; q(el, '#ba').innerHTML = book.a.map(row('ask')).join('') || '<span class="small">none</span>'; set(el, 'lt', inr(ltp, 2)); set(el, 'sp', book.b[0] && book.a[0] ? `Spread ₹${(book.a[0][0] - book.b[0][0]).toFixed(2)}` : ''); };
  const log = (t, c = '') => q(el, '#lg').insertAdjacentHTML('afterbegin', `<div class="${c}">${t}</div>`);
  const go = (side) => { let n = Math.floor(v(el, 'oq')), px = v(el, 'op'); if (!(n > 0)) return; const opp = side === 'BUY' ? book.a : book.b, own = side === 'BUY' ? book.b : book.a, ok = (p) => type === 'MARKET' || (side === 'BUY' ? p <= px : p >= px);
    while (n > 0 && opp.length && ok(opp[0][0])) { const t = Math.min(n, opp[0][1]); n -= t; ltp = opp[0][0]; log(`✓ ${side} ${t} @ ${num(opp[0][0])}: matched!`, side === 'BUY' ? 'up' : 'down'); opp[0][1] -= t; if (!opp[0][1]) opp.shift(); }
    if (n > 0) { if (type === 'MARKET') log(`${n} unfilled: nobody left on the other side`); else { const l = own.find((x) => x[0] === px); l ? (l[1] += n) : own.push([px, n]); own.sort((a, b) => (side === 'BUY' ? b[0] - a[0] : a[0] - b[0])); log(`⏳ ${n} waiting in the book @ ${num(px)}: no match at that price yet`); } } draw(); };
  qa(el, '[data-t]').forEach((b) => (b.onclick = () => { type = b.dataset.t; qa(el, '[data-t]').forEach((x) => x.classList.toggle('on', x === b)); q(el, '#op').disabled = type === 'MARKET'; }));
  q(el, '#ob').onclick = () => go('BUY'); q(el, '#os').onclick = () => go('SELL'); q(el, '#or').onclick = init; init();
},
marketcap(el) {
  el.innerHTML = slider('mp', 'Share price', 10, 5000, 10, 1500) + slider('mn', 'Number of shares', 1, 2000, 1, 600) + `<div class="small" style="margin-top:16px">The whole company is worth</div><div class="stat" id="mc"></div><div class="small" id="mk"></div>`;
  bind(el, ['mp', 'mn'], () => { const p = v(el, 'mp'), n = v(el, 'mn') * 1e6, mc = (p * n) / 1e7; set(el, 'mpV', inr(p)); set(el, 'mnV', (n / 1e7).toFixed(1) + ' crore'); set(el, 'mc', '₹' + Math.round(mc).toLocaleString('en-IN') + ' crore'); set(el, 'mk', mc >= 100000 ? 'Roughly large-cap size' : mc >= 30000 ? 'Roughly mid-cap size' : 'Roughly small-cap size'); });
},
pe(el) {
  el.innerHTML = slider('pp', 'Share price', 50, 4000, 10, 1500) + slider('pe', 'Profit per share per year (EPS)', 1, 300, 1, 60) + `<div class="small" style="margin-top:16px">P/E</div><div class="stat" id="pv"></div><p class="small" id="pt" style="font-size:15px;color:#c7c7cc"></p>`;
  bind(el, ['pp', 'pe'], () => { const p = v(el, 'pp'), e = v(el, 'pe'), r = p / e; set(el, 'ppV', inr(p)); set(el, 'peV', inr(e)); set(el, 'pv', r.toFixed(1), 'stat ' + (r < 15 ? 'up' : r > 40 ? 'down' : '')); set(el, 'pt', `You pay ${inr(r, 1)} for each ₹1 the company earns per year. ` + (r < 15 ? 'Looks cheap, or the market expects trouble.' : r > 40 ? 'Expensive: the market expects fast growth.' : 'A middle-of-the-road price.')); });
},
risk(el) {
  const T = [['Liquid', 8, 'Very safe parking'], ['Debt', 22, 'Low to moderate'], ['Hybrid', 55, 'Moderately high'], ['Index fund', 80, 'Very high: moves with the market'], ['Equity', 88, 'Very high'], ['Small cap', 96, 'Very high: can fall 50% in a bad year']];
  el.innerHTML = `<div class="row">${T.map(([n], i) => `<button class="chip" data-i="${i}">${n}</button>`).join('')}</div><div class="risk"><i id="ri" style="left:50%"></i></div><div class="row small" style="justify-content:space-between"><span>Low</span><span>Moderate</span><span>High</span><span>Very high</span></div><p class="small" id="rx" style="font-size:15px;margin-top:10px">Tap a fund type.</p>`;
  qa(el, '[data-i]').forEach((b) => (b.onclick = () => { const t = T[+b.dataset.i]; qa(el, '[data-i]').forEach((x) => x.classList.toggle('on', x === b)); q(el, '#ri').style.left = t[1] + '%'; set(el, 'rx', `<b style="color:var(--fg)">${t[0]}:</b> ${t[2]}`); }));
},
expense(el) {
  el.innerHTML = `<div class="grid2"><div>${slider('ea', 'Every month', 1000, 50000, 500, 10000)}${slider('ey', 'Years', 5, 35, 1, 25)}${slider('ed', 'Direct plan fee', 0.1, 1.5, 0.05, 0.6)}${slider('er', 'Regular plan fee', 0.5, 2.5, 0.05, 1.6)}</div><div><div class="small">Extra money with Direct</div><div class="stat up" id="ex"></div>${out([['Direct', 'e1'], ['Regular', 'e2']])}<p class="small">Assumes 12% yearly growth before fees.</p></div></div>`;
  const fv = (m, y, r) => { let x = 0; for (let k = 0; k < y * 12; k++) x = (x + m) * (1 + r / 12); return x; };
  bind(el, ['ea', 'ey', 'ed', 'er'], () => { const a = v(el, 'ea'), y = v(el, 'ey'), d = v(el, 'ed'), r = v(el, 'er'); set(el, 'eaV', inr(a)); set(el, 'eyV', y + ' years'); set(el, 'edV', d.toFixed(2) + '%'); set(el, 'erV', r.toFixed(2) + '%'); const D = fv(a, y, (12 - d) / 100), R = fv(a, y, (12 - r) / 100); set(el, 'ex', lakh(D - R)); set(el, 'e1', lakh(D)); set(el, 'e2', lakh(R)); });
},
candleBuilder(el) {
  el.innerHTML = `<div class="grid2"><div>${slider('co', 'Open (start price)', 90, 110, 0.5, 100)}${slider('cc2', 'Close (end price)', 90, 110, 0.5, 106)}${slider('ch', 'High (highest)', 100, 115, 0.5, 109)}${slider('cl', 'Low (lowest)', 85, 100, 0.5, 97)}</div><div style="display:flex;gap:20px;align-items:center"><svg viewBox="0 0 120 240" style="height:260px;width:120px" id="cs"></svg><p class="small" id="ct" style="font-size:15px;color:#c7c7cc"></p></div></div>`;
  bind(el, ['co', 'cc2', 'ch', 'cl'], () => { let o = v(el, 'co'), c = v(el, 'cc2'), h = Math.max(v(el, 'ch'), o, c), l = Math.min(v(el, 'cl'), o, c); ['co', 'cc2', 'ch', 'cl'].forEach((k) => set(el, k + 'V', num(v(el, k)))); const Y = (x) => 230 - ((x - 85) / 30) * 220, up = c >= o, col = up ? '#00e38c' : '#ff453a';
    q(el, '#cs').innerHTML = `<line x1="60" x2="60" y1="${Y(h)}" y2="${Y(l)}" stroke="${col}" stroke-width="3"/><rect x="35" width="50" y="${Y(Math.max(o, c))}" height="${Math.max(2, Y(Math.min(o, c)) - Y(Math.max(o, c)))}" fill="${col}" rx="3"/><text x="100" y="${Y(h) + 4}" fill="#86868b" font-size="10">H</text><text x="100" y="${Y(l) + 4}" fill="#86868b" font-size="10">L</text>`;
    set(el, 'ct', `${up ? '<b class="up">Green candle.</b> Price ended higher than it started.' : '<b class="down">Red candle.</b> Price ended lower than it started.'}<br>The thick body runs from open (${num(o)}) to close (${num(c)}). The thin lines ("wicks") reach the high (${num(h)}) and low (${num(l)}) of that period.`); });
},
chartTypes(el) {
  el.innerHTML = `<div class="row" id="ts"></div><div class="chartbox" id="tb" style="height:300px"></div><div class="small" id="tn"></div>`;
  const ch = LChart.create(q(el, '#tb'), { type: 'candle' }); LChart.switcher(q(el, '#ts'), ch, 'candle');
  L.quotes(['^NSEI'], '1mo', { candles: true }).then((j) => { ch.set(j.quotes[0].candles, { animate: true }); set(el, 'tn', 'Real Nifty 50, last month, 30-minute candles.'); }).catch(() => { const w = L.walk(60, 25000, 0.01); ch.set(w.map((c, i) => ({ t: null, o: w[i - 1] || c, h: Math.max(c, w[i - 1] || c) * 1.002, l: Math.min(c, w[i - 1] || c) * 0.998, c })), { animate: true }); set(el, 'tn', 'Example data.'); });
},
lot(el) {
  el.innerHTML = slider('lm', 'Nifty moves by (points)', -500, 500, 10, 100) + slider('ll', 'Lots', 1, 10, 1, 1) + out([['Units', 'l1'], ['Profit / loss', 'l2']]);
  bind(el, ['lm', 'll'], () => { const m = v(el, 'lm'), n = v(el, 'll'); set(el, 'lmV', (m > 0 ? '+' : '') + m); set(el, 'llV', n); set(el, 'l1', n * 65 + ' units'); set(el, 'l2', (m >= 0 ? '+' : '') + inr(m * 65 * n), m >= 0 ? 'up' : 'down'); });
},
leverage(el) {
  el.innerHTML = `<div class="grid2"><div>${slider('lv', 'Nifty moves', -10, 10, 0.1, 2)}<div class="row" style="margin-top:14px"><button class="chip on" data-s="1">I bought (long)</button><button class="chip" data-s="-1">I sold (short)</button></div></div><div><div class="small">Your profit or loss</div><div class="stat" id="lp"></div>${out([['Margin deposited', 'm1'], ['Nifty moved', 'm2'], ['Your money moved', 'm3']])}<p class="small" id="lx" style="font-size:15px"></p></div></div>`;
  let s = 1; const f = () => { const m = v(el, 'lv'), val = SPOT * 65, mar = val * 0.12, p = (s * SPOT * m * 65) / 100, r = (p / mar) * 100; set(el, 'lvV', (m > 0 ? '+' : '') + m.toFixed(1) + '%'); set(el, 'lp', (p >= 0 ? '+' : '') + inr(p), 'stat ' + (p >= 0 ? 'up' : 'down')); set(el, 'm1', inr(mar)); set(el, 'm2', m.toFixed(1) + '%'); set(el, 'm3', (r > 0 ? '+' : '') + r.toFixed(0) + '%', r >= 0 ? 'up' : 'down'); set(el, 'lx', r <= -100 ? '<b class="down">Your whole deposit is gone, and you owe more.</b>' : `A ${Math.abs(m).toFixed(1)}% Nifty move = a ${Math.abs(r).toFixed(0)}% move in your money.`); };
  qa(el, '[data-s]').forEach((b) => (b.onclick = () => { s = +b.dataset.s; qa(el, '[data-s]').forEach((x) => x.classList.toggle('on', x === b)); f(); })); bind(el, ['lv'], f);
},
payoff(el) {
  el.innerHTML = `<div class="row"><button class="chip on" data-k="buy-CE">Buy call</button><button class="chip" data-k="buy-PE">Buy put</button><button class="chip" data-k="sell-CE">Sell call</button><button class="chip" data-k="sell-PE">Sell put</button></div><div class="grid2"><div>${slider('ok', 'Strike price', -1000, 1000, 50, 0)}${slider('opm', 'Premium (per unit)', 5, 600, 5, 150)}${slider('os2', 'Nifty on expiry day', -1500, 1500, 10, 300)}${out([['Profit/loss', 'o1'], ['Breakeven', 'o2'], ['Max loss', 'o3', 'down']])}<p class="small" id="ox" style="font-size:15px"></p></div><canvas class="chart" id="oc" style="height:300px"></canvas></div>`;
  let k = 'buy-CE'; const f = () => { const [side, t] = k.split('-'), atm = Math.round(SPOT / 50) * 50, K = atm + v(el, 'ok'), P = v(el, 'opm'), S = atm + v(el, 'os2'), sg = side === 'buy' ? 1 : -1, pl = (x) => sg * ((t === 'CE' ? Math.max(0, x - K) : Math.max(0, K - x)) - P) * 65;
    set(el, 'okV', num(K, 0)); set(el, 'opmV', inr(P)); set(el, 'os2V', num(S, 0)); const r = pl(S); set(el, 'o1', (r >= 0 ? '+' : '') + inr(r), r >= 0 ? 'up' : 'down'); set(el, 'o2', num(t === 'CE' ? K + P : K - P, 0)); set(el, 'o3', side === 'buy' ? inr(-P * 65) : t === 'CE' ? 'Unlimited' : inr(-(K - P) * 65), 'down');
    set(el, 'ox', side === 'buy' ? `You pay ${inr(P * 65)} today. You profit only if Nifty ends ${t === 'CE' ? 'above' : 'below'} ${num(t === 'CE' ? K + P : K - P, 0)}.` : `You receive ${inr(P * 65)} today, but lose if Nifty moves strongly ${t === 'CE' ? 'up' : 'down'}.`);
    const xs = []; for (let x = atm - 1500; x <= atm + 1500; x += 25) xs.push(pl(x)); L.line(q(el, '#oc'), xs, r >= 0 ? '#00e38c' : '#ff453a', { zero: true, fill: false, mark: (S - (atm - 1500)) / 25, animate: false }); };
  qa(el, '[data-k]').forEach((b) => (b.onclick = () => { k = b.dataset.k; qa(el, '[data-k]').forEach((x) => x.classList.toggle('on', x === b)); f(); })); bind(el, ['ok', 'opm', 'os2'], f);
},
chainExplain(el) {
  const atm = Math.round(SPOT / 50) * 50, T = 7 / 365;
  const rows = [-200, -100, 0, 100, 200].map((d) => atm + d);
  el.innerHTML = `<div class="small" style="margin-bottom:8px">Nifty is at <b class="mono" style="color:var(--fg)">${num(SPOT)}</b> · expiry in 7 days · lot 65</div><table class="oc mini-oc"><tr><th class="up">CALL price</th><th>STRIKE</th><th class="down">PUT price</th></tr>${rows.map((K) => `<tr><td class="c" data-k="${K}" data-t="CE">${num(L.bs(SPOT, K, T, 'CE'))}</td><td class="k">${K}${K === atm ? ' <small class="small">ATM</small>' : ''}</td><td class="c" data-k="${K}" data-t="PE">${num(L.bs(SPOT, K, T, 'PE'))}</td></tr>`).join('')}</table><div class="explain" id="ce">👆 Tap any price in the table.</div>`;
  qa(el, 'td.c').forEach((td) => (td.onclick = () => { qa(el, 'td.c').forEach((x) => x.classList.toggle('sel', x === td)); const K = +td.dataset.k, t = td.dataset.t, P = L.bs(SPOT, K, T, t), cost = P * 65, be = t === 'CE' ? K + P : K - P, itm = t === 'CE' ? SPOT > K : SPOT < K;
    set(el, 'ce', `<b>You'd buy: NIFTY ${K} ${t}</b> (${t === 'CE' ? 'a call' : 'a put'})<br>• You pay <b>${inr(cost)}</b> now (₹${num(P)} × 65).<br>• You win if Nifty ends ${t === 'CE' ? '<b class="up">above</b>' : '<b class="down">below</b>'} <b>${num(be, 0)}</b> in 7 days.<br>• If it doesn't, you can lose up to the full <b>${inr(cost)}</b>.<br>• It's <b>${itm ? 'in the money' : K === atm ? 'at the money' : 'out of the money'}</b>${itm ? ', so it already has real value. That\'s why it costs more.' : ', so its price is all "hope".'}`); }));
},
decay(el) {
  el.innerHTML = `<div class="grid2"><div>${slider('dd', 'Days left until expiry', 0, 30, 1, 30)}${out([['Option price', 'd1'], ['One lot is worth', 'd2']])}<p class="small" id="dx" style="font-size:15px"></p></div><canvas class="chart" id="dc"></canvas></div>`;
  bind(el, ['dd'], () => { const d = v(el, 'dd'), K = Math.round(SPOT / 50) * 50, p = L.bs(SPOT, K, d / 365, 'CE'), p0 = L.bs(SPOT, K, 30 / 365, 'CE'); set(el, 'ddV', d + ' days'); set(el, 'd1', inr(p, 2)); set(el, 'd2', inr(p * 65)); set(el, 'dx', d === 30 ? 'Drag left: time passes, Nifty stays still.' : `Nifty didn't move, yet the option lost <b class="down">${((1 - p / p0) * 100).toFixed(0)}%</b> (${inr((p0 - p) * 65)} per lot).`); const c = []; for (let k = 30; k >= 0; k -= 0.5) c.push(L.bs(SPOT, K, k / 365, 'CE')); L.line(q(el, '#dc'), c, '#ffb340', { min: 0, mark: (30 - d) * 2, animate: false }); });
},
goSim(el) { el.innerHTML = `<div class="row"><a class="pill green" href="/simulator/trade.html?tab=chain">Open F&amp;O simulator →</a><a class="ghost" href="/simulator/">All simulators</a></div>`; },
};
})();
