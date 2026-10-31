"use strict";
/* ===================== INICIO ===================== */
function viewHome() {
  const now = new Date(), mk = mkOf(now), m = getMonth(mk), p = period(mk, now), T = monthTotals(mk);
  const perDay = Math.max(0, T.left) / p.remaining;
  const expTotal = T.tope * p.fraction, diff = T.spent - expTotal;
  const st = statusOf(T.spent, T.tope, expTotal);
  const streak = paceStreak(mk, now);
  const denom = Math.max(T.tope, T.spent) || 1;
  const segs = ENVELOPES.map(e => ({ v: spentEnv(mk, e.id), color: e.color }));
  const R = 88;
  const ang = Math.min(1, p.fraction) * 2 * Math.PI;
  const tx1 = 110 + Math.sin(ang) * (R - 15), ty1 = 110 - Math.cos(ang) * (R - 15), tx2 = 110 + Math.sin(ang) * (R + 15), ty2 = 110 - Math.cos(ang) * (R + 15);
  const ring = `<svg class="ring" viewBox="0 0 220 220" role="img" aria-label="Gasto del mes por categoría">
    <g transform="rotate(-90 110 110)"><circle class="track" cx="110" cy="110" r="${R}"/>${arcsSVG(segs, denom, R, 110, 110)}</g>
    ${T.tope > 0 ? `<line class="tick" x1="${tx1.toFixed(1)}" y1="${ty1.toFixed(1)}" x2="${tx2.toFixed(1)}" y2="${ty2.toFixed(1)}"/>` : ""}</svg>`;
  const over = T.left < 0;
  const rent = exps().filter(e => e.kind === "fixed" && e.targetId === "renta" && inMonth(e, mk)).reduce((s, e) => s + e.amountCents, 0);
  const sug = suggestions(mk);
  const unpaid = cardUnpaid(), unpaidTotal = unpaid.reduce((s, e) => s + e.amountCents, 0);

  const tiles = ENVELOPES.map(e => {
    const pc = paceOf(mk, e.id, now);
    return `<button class="tile s-${pc.status}" style="--c:${e.color}" data-act="open-env" data-id="${e.id}" aria-label="${esc(e.name)}: ${pc.left >= 0 ? "restan " + money(pc.left) : "te pasaste " + money(-pc.left)}. ${pc.short}">
      <span class="tile-top"><span class="ico">${e.emoji}</span><span class="dot"></span></span>
      <span class="tile-name">${esc(e.short)}</span>
      <span class="tile-num display">${pc.left >= 0 ? moneyR(pc.left) : "−" + moneyR(-pc.left)}<small>${pc.left >= 0 ? "restan" : "de más"}</small></span>
      <span class="bar-wrap"><span class="bar"><i style="width:${pc.pct}%"></i></span>${pc.tope > 0 ? `<b class="tick" style="left:${pc.expPct}%"></b>` : ""}</span>
      <span class="tile-sub">${moneyR(pc.spent)} de ${moneyR(pc.tope)}</span>
      <span class="tile-pace">${pc.short}</span></button>`;
  }).join("");

  const funds = Object.entries(state.budget.funds).map(([fid, f]) => {
    const sp = fundSpent(fid), left = f.totalCents - sp, pct = f.totalCents > 0 ? Math.min(100, sp / f.totalCents * 100) : 0;
    return `<button class="fund" style="--c:${f.color}" data-act="open-fund" data-id="${fid}">
      <span class="ico sq">${f.emoji}</span>
      <span class="fund-body"><span class="fund-head"><b>${esc(f.name)}</b><span class="mono">${moneyR(left)}</span></span>
      <span class="bar"><i style="width:${pct}%"></i></span>
      <span class="tile-sub" style="display:block">${moneyR(sp)} gastado de ${moneyR(f.totalCents)} · ${pct.toFixed(0)}%</span></span></button>`;
  }).join("");

  return `
  <header class="top">
    <p class="eyebrow">${MONTHS[+mk.slice(5) - 1]} · día ${p.idx} de ${p.total}${m.startDay > 1 ? ` · desde el ${m.startDay}` : ""}</p>
    <h1 class="h1 display">Tus sobres</h1>
  </header>
  <section class="card hero">
    <div class="ring-wrap">${ring}
      <div class="ring-c"><div class="big display">${over ? "$0" : moneyR(perDay)}</div>
        <div class="lbl">${over ? "te pasaste del total" : `por día · ${p.remaining} ${p.remaining === 1 ? "día" : "días"} más`}</div></div></div>
    <div class="stats">
      <div class="stat"><b class="mono">${moneyR(T.spent)}</b><span>gastado</span></div>
      <div class="stat"><b class="mono" style="color:${over ? "var(--over)" : "var(--text)"}">${over ? "−" + moneyR(-T.left) : moneyR(T.left)}</b><span>${over ? "de más" : "restante"}</span></div>
      <div class="stat"><b class="mono">${moneyR(T.tope)}</b><span>presupuesto</span></div>
    </div>
    <div class="hero-foot">
      <span class="pill s-${st}">${st === "idle" ? "Sin presupuesto" : st === "over" ? `Te pasaste ${moneyR(T.spent - T.tope)}` : diff <= 0 ? `${moneyR(-diff)} por debajo del ritmo` : `${moneyR(diff)} por encima del ritmo`}</span>
      ${streak >= 2 ? `<span class="pill plain" style="--p:var(--high)">🔥 ${streak} días en ritmo</span>` : ""}
    </div>
    <p class="legend-note">El anillo se colorea según en qué gastaste. La marca blanca es dónde deberías ir hoy.</p>
  </section>
  ${rent ? `<p class="hint" style="margin:10px 4px 0;text-align:center">🔑 Renta del mes ${money(rent)} · va aparte, fuera de los sobres</p>` : ""}
  ${closeBanner()}
  ${inboxBanner()}
  ${sug.map((s, i) => `<div class="alert"><span style="font-size:22px">⚠️</span><p><b>${esc(ENV[s.to].short)}</b> se pasó ${money(s.need)}. <b>${esc(ENV[s.from].short)}</b> tiene holgura.</p>
    <button class="btn-s" data-act="do-suggest" data-i="${i}">Mover ${moneyR(s.cents)}</button></div>`).join("")}
  ${unpaidTotal > 0 ? `<button class="cardbal" data-act="open-card"><span class="ico">💳</span><div><b>Debes ${money(unpaidTotal)} en la tarjeta</b><span>${unpaid.length} ${unpaid.length === 1 ? "gasto" : "gastos"} sin pagar · toca para marcarlos</span></div><span class="chev muted">›</span></button>` : ""}
  <section class="sec"><div class="sec-h"><h2 class="display">Sobres del mes</h2><span>toca uno para ver el detalle</span></div><div class="grid2">${tiles}</div></section>
  <section class="sec"><div class="sec-h"><h2 class="display">Fondos del viaje</h2><span>no se reinician</span></div>${funds}</section>
  ${reimbSection()}`;
}

/* ===================== HISTORIAL ===================== */
const hist = { mk: "all", cat: "", pay: "", q: "" };

function monthsWithData() {
  const set = new Set([mkOf(new Date())]);
  exps().forEach(e => set.add(e.date.slice(0, 7)));
  return [...set].sort().reverse();
}
function histItems() {
  const q = hist.q.trim().toLowerCase();
  let items = exps().filter(e => {
    if (hist.mk !== "all" && !inMonth(e, hist.mk)) return false;
    if (hist.cat && (e.kind + ":" + e.targetId) !== hist.cat) return false;
    if (hist.pay && e.paymentMethod !== hist.pay) return false;
    if (q) { const c = catOf(e.kind, e.targetId); if (!((e.note || "").toLowerCase().includes(q) || c.name.toLowerCase().includes(q))) return false; }
    return true;
  }).map(e => ({ t: "e", date: e.date, id: e.id, e }));
  if (!hist.cat && !hist.pay && !q) {
    state.budget.transfers.forEach(t => { if (hist.mk === "all" || t.month === hist.mk) items.push({ t: "t", date: t.date, id: t.id, tr: t }); });
  }
  return items.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}
function histListHTML() {
  const items = histItems();
  if (!items.length) return `<div class="empty"><b>🔎</b>No hay movimientos con estos filtros.</div>`;
  const total = items.filter(i => i.t === "e").reduce((s, i) => s + i.e.amountCents, 0);
  const groups = {};
  items.forEach(i => { (groups[i.date] = groups[i.date] || []).push(i); });
  let html = `<div class="total-line"><span>${items.filter(i => i.t === "e").length} gastos</span><b class="mono">${money(total)}</b></div>`;
  Object.keys(groups).sort().reverse().forEach(d => {
    const sum = groups[d].filter(i => i.t === "e").reduce((s, i) => s + i.e.amountCents, 0);
    html += `<div class="day-h"><b>${dayLabel(d)}</b><span class="mono">${sum ? money(sum) : ""}</span></div><div class="list">${groups[d].map(i => i.t === "e" ? expRow(i.e) : tfRow(i.tr)).join("")}</div>`;
  });
  return html;
}
function viewHistory() {
  const L = chipList();
  const catOpts = `<option value="">Todas las categorías</option>
    <optgroup label="Sobres">${L.env.map(c => `<option value="envelope:${c.id}" ${hist.cat === "envelope:" + c.id ? "selected" : ""}>${c.emoji} ${esc(c.short)}</option>`).join("")}</optgroup>
    <optgroup label="Fondos">${L.fund.map(c => `<option value="fund:${c.id}" ${hist.cat === "fund:" + c.id ? "selected" : ""}>${c.emoji} ${esc(c.short)}</option>`).join("")}</optgroup>
    <option value="fixed:renta" ${hist.cat === "fixed:renta" ? "selected" : ""}>🔑 Renta</option>`;
  return `
  <header class="top"><p class="eyebrow">Todos tus movimientos</p><h1 class="h1 display">Historial</h1></header>
  <div class="filters">
    <select class="inp" data-ch="h-mk" aria-label="Mes"><option value="all">Todos los meses</option>${monthsWithData().map(k => `<option value="${k}" ${hist.mk === k ? "selected" : ""}>${MONTHS[+k.slice(5) - 1]} ${k.slice(0, 4)}</option>`).join("")}</select>
    <select class="inp" data-ch="h-pay" aria-label="Método de pago"><option value="">Todo método</option>${PAYMENTS.map(p => `<option value="${esc(p.id)}" ${hist.pay === p.id ? "selected" : ""}>${p.emoji} ${p.short}</option>`).join("")}</select>
    <select class="inp" style="grid-column:1/-1" data-ch="h-cat" aria-label="Categoría">${catOpts}</select>
    <input class="inp q" type="search" data-in="h-q" placeholder="Buscar por nota o categoría" value="${esc(hist.q)}" aria-label="Buscar">
  </div>
  <div id="histList">${histListHTML()}</div>`;
}
CHANGES["h-mk"] = t => { hist.mk = t.value; $("#histList").innerHTML = histListHTML(); };
CHANGES["h-pay"] = t => { hist.pay = t.value; $("#histList").innerHTML = histListHTML(); };
CHANGES["h-cat"] = t => { hist.cat = t.value; $("#histList").innerHTML = histListHTML(); };
INPUTS["h-q"] = t => { hist.q = t.value; $("#histList").innerHTML = histListHTML(); };

/* ===================== RESUMEN ===================== */
let sumMk = null;

function byCategory(mk) {
  const map = {};
  exps().forEach(e => { if (!inMonth(e, mk) || e.kind === "fixed" || e.kind === "reimb") return; const k = e.kind + ":" + e.targetId; map[k] = (map[k] || 0) + e.amountCents; });
  return Object.entries(map).map(([k, cents]) => { const [kind, id] = k.split(":"); return { kind, id, cents, ...catOf(kind, id) }; }).sort((a, b) => b.cents - a.cents);
}
function insightsFor(mk, T, cats) {
  const out = [], cur = mkOf(new Date()), pm = prevMk(mk), hasPrev = exps().some(e => inMonth(e, pm) && e.kind === "envelope");
  if (hasPrev) {
    const ch = ENVELOPES.map(e => ({ e, a: spentEnv(mk, e.id), b: spentEnv(pm, e.id) })).filter(x => x.b >= 2000 && x.a >= 0)
      .map(x => ({ ...x, pct: Math.round((x.a - x.b) / x.b * 100) })).sort((x, y) => Math.abs(y.pct) - Math.abs(x.pct))[0];
    if (ch && Math.abs(ch.pct) >= 5) out.push({ i: ch.pct < 0 ? "📉" : "📈", t: `Gastaste ${Math.abs(ch.pct)}% ${ch.pct < 0 ? "menos" : "más"} en ${ch.e.short} que el mes pasado.` });
  }
  const envCats = cats.filter(c => c.kind === "envelope");
  const envTotal = envCats.reduce((s, c) => s + c.cents, 0);
  if (envCats.length && envTotal > 0) out.push({ i: envCats[0].emoji, t: `${envCats[0].short} se llevó el ${Math.round(envCats[0].cents / envTotal * 100)}% de tus gastos en sobres.` });
  if (mk < cur) {
    out.push(T.left >= 0 ? { i: "🎯", t: `Cerraste el mes con ${money(T.left)} de sobra. Eso va directo a ahorro.` } : { i: "⚠️", t: `Cerraste ${money(-T.left)} por encima del presupuesto. Ajusta los topes del próximo mes.` });
  } else {
    const p = period(mk), exp = T.tope * p.fraction;
    out.push(T.spent <= exp ? { i: "✅", t: `Vas ${money(exp - T.spent)} por debajo del ritmo. Mantén esto y cierras con holgura.` } : { i: "👀", t: `Vas ${money(T.spent - exp)} por encima del ritmo. Revisa los sobres naranjas del inicio.` });
  }
  return out.slice(0, 3);
}
function lineChart(mk) {
  const m = getMonth(mk), p = period(mk), T = monthTotals(mk).tope;
  const byDay = {}; let pre = 0;
  exps().forEach(e => { if (e.kind !== "envelope" || !inMonth(e, mk)) return; const d = +e.date.slice(8); if (d < m.startDay) pre += e.amountCents; else byDay[d] = (byDay[d] || 0) + e.amountCents; });
  const days = p.total, last = Math.max(1, p.idx);
  const pts = []; let c = pre;
  for (let i = 0; i < days; i++) { c += byDay[m.startDay + i] || 0; if (i < last) pts.push(c); }
  const maxY = Math.max(T, ...pts, 1) * 1.08;
  const W = 320, H = 150, L = 36, Rr = 8, Tp = 10, B = 22;
  const x = i => L + (days > 1 ? i / (days - 1) : 0) * (W - L - Rr), y = v => H - B - v / maxY * (H - B - Tp);
  const actual = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const lastI = pts.length - 1;
  const area = `${actual} L${x(lastI).toFixed(1)} ${y(0).toFixed(1)} L${x(0).toFixed(1)} ${y(0).toFixed(1)}Z`;
  const grid = [0, .5, 1].map(f => `<line class="grid" x1="${L}" x2="${W - Rr}" y1="${y(maxY / 1.08 * f).toFixed(1)}" y2="${y(maxY / 1.08 * f).toFixed(1)}"/><text x="${L - 6}" y="${(y(maxY / 1.08 * f) + 3).toFixed(1)}" text-anchor="end">${moneyR(maxY / 1.08 * f)}</text>`).join("");
  return `<svg class="linechart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gasto acumulado contra la línea ideal">
    <defs><linearGradient id="lg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:var(--text);stop-opacity:.22"/><stop offset="1" style="stop-color:var(--text);stop-opacity:0"/></linearGradient></defs>
    ${grid}
    <line class="ideal" x1="${x(0)}" y1="${y(T / days).toFixed(1)}" x2="${x(days - 1)}" y2="${y(T).toFixed(1)}"/>
    <path d="${area}" fill="url(#lg)"/><path class="actual" d="${actual}"/><circle class="pt" cx="${x(lastI).toFixed(1)}" cy="${y(pts[lastI]).toFixed(1)}" r="4"/>
    <text x="${L}" y="${H - 5}">${m.startDay} ${MONTHS_S[+mk.slice(5) - 1]}</text><text x="${W - Rr}" y="${H - 5}" text-anchor="end">${m.endDay} ${MONTHS_S[+mk.slice(5) - 1]}</text></svg>`;
}
function viewSummary() {
  const list = monthsWithData().slice().reverse();
  const cur = mkOf(new Date());
  if (!sumMk || !list.includes(sumMk)) sumMk = cur;
  const mk = sumMk, i = list.indexOf(mk), m = getMonth(mk), p = period(mk), T = monthTotals(mk), isCur = mk === cur;
  const cats = byCategory(mk), totalCats = cats.reduce((s, c) => s + c.cents, 0);
  const pm = prevMk(mk), prevHas = exps().some(e => inMonth(e, pm) && e.kind === "envelope"), prevT = prevHas ? monthTotals(pm) : null;
  const ins = insightsFor(mk, T, cats);
  const pctSpent = T.tope > 0 ? Math.min(100, T.spent / T.tope * 100) : 0;
  const elapsed = Math.max(1, isCur ? p.idx : p.total);
  const envExp = exps().filter(e => e.kind === "envelope" && inMonth(e, mk)).sort((a, b) => b.amountCents - a.amountCents);
  const top = exps().filter(e => inMonth(e, mk) && e.kind !== "fixed" && e.kind !== "reimb").sort((a, b) => b.amountCents - a.amountCents).slice(0, 5);
  const rent = exps().filter(e => e.kind === "fixed" && inMonth(e, mk)).reduce((s, e) => s + e.amountCents, 0);
  const funds = Object.entries(state.budget.funds).map(([fid, f]) => ({ fid, f, sp: fundSpent(fid) }));

  const bvr = ENVELOPES.map(e => {
    const t = effTope(mk, e.id), s = spentEnv(mk, e.id);
    if (t <= 0 && s <= 0) return "";
    const pct = t > 0 ? Math.min(100, s / t * 100) : 100;
    return `<div class="bvr-row" style="--c:${e.color}"><div class="bvr-h"><b>${e.emoji} ${esc(e.short)}</b><span class="mono">${moneyR(s)} / ${moneyR(t)}${s > t ? ` <i class="over-flag" style="font-style:normal">+${moneyR(s - t)}</i>` : ""}</span></div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
  }).join("");

  const donut = cats.length ? `<div class="donut-box"><svg class="donut" viewBox="0 0 120 120" role="img" aria-label="Gasto por categoría"><g transform="rotate(-90 60 60)"><circle class="track" cx="60" cy="60" r="46"/>${arcsSVG(cats.map(c => ({ v: c.cents, color: c.color })), totalCats, 46, 60, 60, .8)}</g>
      <text x="60" y="58" text-anchor="middle" font-size="15" font-weight="700" fill="var(--text)" font-family="Bricolage Grotesque, sans-serif">${moneyR(totalCats)}</text><text x="60" y="73" text-anchor="middle" font-size="8.5" fill="var(--text-3)">gastado</text></svg>
      <div class="legend">${cats.slice(0, 6).map(c => `<div style="--c:${c.color}"><i></i><span>${esc(c.short)}</span><b class="mono">${Math.round(c.cents / totalCats * 100)}%</b></div>`).join("")}${cats.length > 6 ? `<div class="muted" style="font-size:12px">+ ${cats.length - 6} más</div>` : ""}</div></div>`
    : `<div class="empty"><b>📊</b>Aún no hay gastos este mes.</div>`;

  const cmp = prevT ? ENVELOPES.map(e => ({ e, a: spentEnv(mk, e.id), b: spentEnv(pm, e.id) })).filter(x => x.a || x.b).map(x => ({ ...x, d: x.a - x.b })).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 4) : [];

  return `
  <header class="top"><p class="eyebrow">Cierre de mes</p><h1 class="h1 display">Resumen</h1></header>
  <div class="mnav"><button class="x" data-act="sum-prev" aria-label="Mes anterior" ${i <= 0 ? "disabled" : ""}>‹</button><b class="display">${MONTHS[+mk.slice(5) - 1]} ${mk.slice(0, 4)}</b><button class="x" data-act="sum-next" aria-label="Mes siguiente" ${i >= list.length - 1 ? "disabled" : ""}>›</button></div>
  <section class="card">
    <div class="headline"><span class="n display">${money(T.spent)}</span><span class="of">de ${money(T.tope)} presupuestados</span></div>
    <div class="bar lg"><i style="width:${pctSpent}%;background:${T.spent > T.tope ? "var(--over)" : "var(--ok)"}"></i></div>
    <p class="hint" style="margin-top:10px">${T.left >= 0 ? `${isCur ? "Te quedan" : "Sobraron"} <b style="color:var(--text)">${money(T.left)}</b>${isCur ? "" : " → van a ahorro"}` : `Te pasaste <b style="color:var(--over)">${money(-T.left)}</b>`}${rent ? ` · renta ${money(rent)} aparte` : ""}</p>
    <div class="insights">${ins.map(x => `<div class="insight"><i>${x.i}</i><span>${esc(x.t)}</span></div>`).join("")}</div>
  </section>
  <section class="card"><h3 class="display">Dónde se fue tu plata</h3>${donut}</section>
  <section class="card"><h3 class="display">Presupuesto vs real</h3><div class="bvr">${bvr || `<p class="hint">Sin sobres con presupuesto.</p>`}</div></section>
  <section class="card"><h3 class="display">Gasto acumulado vs ritmo ideal</h3>${lineChart(mk)}<p class="hint" style="margin-top:8px">Línea sólida: lo que llevas. Línea punteada: lo que deberías llevar.</p></section>
  <section class="card"><h3 class="display">Números del mes</h3><div class="mini-stats">
    <div class="mini"><b class="mono">${money(T.spent / elapsed)}</b><span>promedio diario</span></div>
    <div class="mini"><b class="mono">${money(T.tope / p.total)}</b><span>presupuestado por día</span></div>
    <div class="mini"><b class="mono">${envExp.length}</b><span>gastos en sobres</span></div>
    <div class="mini"><b class="mono">${envExp.length ? money(T.spent / envExp.length) : "$0.00"}</b><span>gasto promedio</span></div></div></section>
  ${top.length ? `<section class="card"><h3 class="display">Los 5 gastos más grandes</h3><div class="list">${top.map(expRow).join("")}</div></section>` : ""}
  ${prevT ? `<section class="card"><h3 class="display">Contra el mes pasado</h3>
    <div class="row-b" style="margin-bottom:12px"><span class="mono" style="font-size:13px">${money(prevT.spent)} → ${money(T.spent)}</span> <span class="chg ${T.spent <= prevT.spent ? "down" : "up"}">${T.spent <= prevT.spent ? "▼" : "▲"} ${money(Math.abs(T.spent - prevT.spent))}</span></div>
    <div class="list">${cmp.map(x => `<div class="prog-row"><span>${x.e.emoji} ${esc(x.e.short)}</span><span class="chg ${x.d <= 0 ? "down" : "up"}">${x.d <= 0 ? "▼" : "▲"} ${moneyR(Math.abs(x.d))}</span></div>`).join("")}</div></section>` : ""}
  ${savingsCard()}
  <section class="card"><h3 class="display">Fondos del viaje</h3><div class="bvr">${funds.map(({ f, sp }) => `<div class="bvr-row" style="--c:${f.color}"><div class="bvr-h"><b>${f.emoji} ${esc(f.short)}</b><span class="mono">${moneyR(sp)} / ${moneyR(f.totalCents)}</span></div><div class="bar"><i style="width:${f.totalCents > 0 ? Math.min(100, sp / f.totalCents * 100) : 0}%"></i></div></div>`).join("")}</div></section>
  <div class="btn-row" style="margin-top:14px"><button class="btn ghost" data-act="csv-month">⬇ CSV de este mes</button><button class="btn ghost" data-act="csv-all">⬇ CSV de todo</button></div>
  <button class="btn" style="margin-top:10px" data-act="copy-analysis">⧉ Copiar mes para análisis</button>`;
}
ACTIONS["sum-prev"] = () => { const l = monthsWithData().slice().reverse(), i = l.indexOf(sumMk); if (i > 0) { sumMk = l[i - 1]; refresh(); } };
ACTIONS["sum-next"] = () => { const l = monthsWithData().slice().reverse(), i = l.indexOf(sumMk); if (i < l.length - 1) { sumMk = l[i + 1]; refresh(); } };

/* ===================== exportar CSV ===================== */
function csvEscape(v) { v = String(v ?? ""); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }
function exportCSV(mk) {
  const rows = [["Fecha", "Tipo", "Categoría", "Monto", "Método de pago", "Nota", "Tarjeta pagada", "Detalle"]];
  sortExp(exps().filter(e => !mk || inMonth(e, mk))).reverse().forEach(e => {
    const c = catOf(e.kind, e.targetId);
    rows.push([e.date, e.kind === "envelope" ? "Sobre" : e.kind === "fund" ? "Fondo" : e.kind === "reimb" ? (e.reimbursedOn ? "Reembolsado" : "Reembolsable") : "Fijo", c.name, (e.amountCents / 100).toFixed(2), e.paymentMethod, e.note, e.paymentMethod === CARD ? (e.paid ? "Sí" : "No") : "", (e.detail || "").replace(/\n/g, " | ")]);
  });
  download(`bitacora-gastos-${mk || "todo"}.csv`, "﻿" + rows.map(r => r.map(csvEscape).join(",")).join("\n"), "text/csv;charset=utf-8");
}
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 600);
}
ACTIONS["csv-month"] = () => { exportCSV(sumMk || mkOf(new Date())); toast("CSV descargado"); };
ACTIONS["csv-all"] = () => { exportCSV(null); toast("CSV descargado"); };

/* ===================== texto para análisis (pegar en un chat) ===================== */
function analysisText(mk) {
  const L = [], $m = c => money(c);
  L.push(`# Gastos de ${MONTHS[+mk.slice(5) - 1]} ${mk.slice(0, 4)} (Bitácora)`);
  const first = sortExp(exps().filter(e => inMonth(e, mk))).slice(-1)[0];
  if (first && mk === "2026-10") L.push("Nota: octubre es parcial, del 16 al 31 (llegué a NJ el 16).");
  L.push("", "## Sobres: presupuesto vs real");
  ENVELOPES.forEach(en => {
    const t = effTope(mk, en.id), sp = spentEnv(mk, en.id);
    if (t || sp) L.push(`- ${en.short}: gastado ${$m(sp)} de ${$m(t)} (${t - sp >= 0 ? "sobran " + $m(t - sp) : "pasé " + $m(sp - t)})`);
  });
  L.push("", "## Fondos (compras únicas del viaje)");
  Object.entries(state.budget.funds).forEach(([fid, f]) => { const sp = fundSpent(fid); if (sp) L.push(`- ${f.short}: gastado ${$m(sp)} en total de ${$m(f.totalCents)}`); });
  L.push("", "## Gastos uno por uno (fecha · categoría · monto · pago · nota)");
  sortExp(exps().filter(e => inMonth(e, mk))).reverse().forEach(e => {
    const c = catOf(e.kind, e.targetId);
    const tag = e.kind === "reimb" ? " [REEMBOLSABLE" + (e.reimbursedOn ? ", ya llegó" : "") + "]" : "";
    L.push(`- ${e.date} · ${c.short} · ${$m(e.amountCents)} · ${e.paymentMethod || "—"}${e.note ? " · " + e.note : ""}${tag}`);
    if (e.detail) e.detail.split("\n").forEach(x => { if (x.trim()) L.push("    · " + x.trim()); });
  });
  return L.join("\n");
}
ACTIONS["copy-analysis"] = async () => {
  const txt = analysisText(sumMk || mkOf(new Date()));
  try { await navigator.clipboard.writeText(txt); toast("Copiado. Pégalo en tu chat de presupuestos"); }
  catch { download(`bitacora-analisis-${sumMk || "mes"}.txt`, txt, "text/plain;charset=utf-8"); toast("No pude copiar; descargué un .txt"); }
};
