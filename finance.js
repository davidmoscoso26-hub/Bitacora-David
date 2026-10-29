"use strict";
/* ===================== selectores ===================== */
const exps = () => state.budget.expenses;
const inMonth = (e, mk) => e.date.slice(0, 7) === mk;
const prevMk = mk => { const [y, m] = mk.split("-").map(Number); return mkOf(new Date(y, m - 2, 1)); };
const nextMk = mk => { const [y, m] = mk.split("-").map(Number); return mkOf(new Date(y, m, 1)); };

function getMonth(mk) {
  if (!state.budget.months[mk]) {
    const [y, m] = mk.split("-").map(Number);
    const envelopes = {};
    ENVELOPES.forEach(e => { envelopes[e.id] = { topeCents: TEMPLATE_NORMAL[e.id] }; });
    state.budget.months[mk] = { startDay: 1, endDay: new Date(y, m, 0).getDate(), envelopes };
    save();
  }
  return state.budget.months[mk];
}
function transferNet(mk, id) {
  let n = 0;
  state.budget.transfers.forEach(t => { if (t.month !== mk) return; if (t.to === id) n += t.amountCents; if (t.from === id) n -= t.amountCents; });
  return n;
}
function spentEnv(mk, id) {
  let s = 0;
  exps().forEach(e => { if (e.kind === "envelope" && e.targetId === id && inMonth(e, mk)) s += e.amountCents; });
  return s;
}
function carryIn(mk, id) {   // lo que "se quedó" del cierre del mes anterior
  const c = state.budget.closes[prevMk(mk)], it = c && c.items[id];
  return it && it.mode === "keep" ? Math.max(0, it.leftCents) : 0;
}
function baseTope(mk, id) { const m = getMonth(mk); return (m.envelopes[id] || {}).topeCents || 0; }
function effTope(mk, id) { return baseTope(mk, id) + transferNet(mk, id) + carryIn(mk, id); }
function fundSpent(fid) { let s = 0; exps().forEach(e => { if (e.kind === "fund" && e.targetId === fid) s += e.amountCents; }); return s; }

function period(mk, now = new Date()) {
  const m = getMonth(mk);
  const total = m.endDay - m.startDay + 1;
  const cur = mkOf(now);
  let idx;
  if (mk < cur) idx = total;
  else if (mk > cur) idx = 0;
  else idx = Math.min(Math.max(now.getDate(), m.startDay), m.endDay) - m.startDay + 1;
  return { total, idx, fraction: total > 0 ? idx / total : 1, remaining: Math.max(1, total - idx + 1), startDay: m.startDay, endDay: m.endDay };
}

// verde / amarillo / naranja / rojo, según la regla de ritmo
function statusOf(spent, tope, expected) {
  if (tope <= 0 && spent <= 0) return "idle";
  if (spent > tope) return "over";
  if (spent > expected * 1.1) return "high";
  if (spent >= expected * 0.9) return "near";
  return "ok";
}
function paceText(st, spent, tope, expected) {
  if (st === "over") return `Te pasaste ${money(spent - tope)}`;
  if (st === "high") return `Vas ${money(spent - expected)} por encima de lo esperado`;
  if (st === "near") return "Vas justo en ritmo";
  if (st === "ok") return `Vas ${money(expected - spent)} por debajo, bien`;
  return "Sin presupuesto este mes";
}
const PACE_SHORT = { ok: "Bien", near: "En ritmo", high: "Arriba del ritmo", over: "Te pasaste", idle: "Sin tope" };

function paceOf(mk, id, now = new Date()) {
  const tope = effTope(mk, id), spent = spentEnv(mk, id), p = period(mk, now);
  const expected = tope * p.fraction;
  const status = statusOf(spent, tope, expected);
  return { tope, spent, expected, left: tope - spent, status, text: paceText(status, spent, tope, expected), short: PACE_SHORT[status],
    pct: tope > 0 ? Math.min(100, spent / tope * 100) : (spent > 0 ? 100 : 0), expPct: p.fraction * 100 };
}
function monthTotals(mk) {
  let tope = 0, spent = 0;
  ENVELOPES.forEach(e => { tope += effTope(mk, e.id); spent += spentEnv(mk, e.id); });
  return { tope, spent, left: tope - spent };
}

// días seguidos (hasta hoy) en los que el gasto acumulado estuvo por debajo del ritmo ideal
function paceStreak(mk, now = new Date()) {
  const m = getMonth(mk), T = monthTotals(mk).tope, p = period(mk, now);
  if (T <= 0 || p.idx < 1) return 0;
  const byDay = {};
  let pre = 0;
  exps().forEach(e => {
    if (e.kind !== "envelope" || !inMonth(e, mk)) return;
    const d = +e.date.slice(8);
    if (d < m.startDay) pre += e.amountCents; else byDay[d] = (byDay[d] || 0) + e.amountCents;
  });
  const cum = {}; let c = pre;
  for (let d = m.startDay; d <= m.endDay; d++) { c += byDay[d] || 0; cum[d] = c; }
  const today = m.startDay + p.idx - 1;
  let n = 0;
  for (let d = today; d >= m.startDay; d--) {
    const ideal = T * (d - m.startDay + 1) / p.total;
    if (cum[d] <= ideal) n++; else break;
  }
  return n;
}

// sugerencias de transferencia: sobres pasados + sobres con holgura
function suggestions(mk) {
  const rows = ENVELOPES.map(e => ({ e, tope: effTope(mk, e.id), spent: spentEnv(mk, e.id) }));
  const used = {}, out = [];
  const slackOf = r => r.tope - r.spent - (used[r.e.id] || 0);
  rows.filter(r => r.spent > r.tope).sort((a, b) => (b.spent - b.tope) - (a.spent - a.tope)).forEach(o => {
    if (out.length >= 2) return;
    const need = o.spent - o.tope;
    const donor = rows.filter(r => r.e.id !== o.e.id && slackOf(r) >= 100).sort((a, b) => slackOf(b) - slackOf(a))[0];
    if (!donor) return;
    const amt = Math.min(need, slackOf(donor));
    used[donor.e.id] = (used[donor.e.id] || 0) + amt;
    out.push({ from: donor.e.id, to: o.e.id, cents: amt, need });
  });
  return out;
}

const cardUnpaid = () => exps().filter(e => e.paymentMethod === CARD && !e.paid);

/* ===================== gastos recurrentes ===================== */
function runRecurring(now = new Date()) {
  const cur = mkOf(now), today = fmtDate(now);
  const added = [];
  state.budget.recurring.forEach(r => {
    if (!r.active) return;
    let mk = r.fromMonth || cur, guard = 0;
    while (mk <= cur && guard++ < 24) {
      const key = `${r.id}:${mk}`;
      if (!state.budget.recurringDone[key]) {
        const [y, m] = mk.split("-").map(Number);
        const day = Math.min(r.day, new Date(y, m, 0).getDate());
        const date = `${mk}-${pad(day)}`;
        if (date <= today) {
          exps().push({ id: uid(), amountCents: r.amountCents, date, kind: r.kind, targetId: r.targetId, paymentMethod: r.paymentMethod || "", note: r.name, recurringId: r.id, paid: false });
          state.budget.recurringDone[key] = true;
          added.push(r.name);
        }
      }
      mk = nextMk(mk);
    }
  });
  if (added.length) save();
  return added;
}

/* ===================== acciones: gastos ===================== */
let draft = null;

function chipList() {
  return {
    env: ENVELOPES.map(e => ({ kind: "envelope", id: e.id, ...e })),
    fund: Object.entries(state.budget.funds).map(([id, f]) => ({ kind: "fund", id, name: f.name, short: f.short, emoji: f.emoji, color: f.color })),
    fix: [{ kind: "fixed", id: "renta", ...FIXED }],
    reimb: [{ kind: "reimb", ...REIMB }],
  };
}
function frequent() {
  const cut = new Date(); cut.setDate(cut.getDate() - 45);
  const cutS = fmtDate(cut), cnt = {};
  exps().forEach(e => { if (e.date >= cutS && e.kind !== "fixed" && e.kind !== "reimb") { const k = e.kind + ":" + e.targetId; cnt[k] = (cnt[k] || 0) + 1; } });
  return Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => { const [kind, id] = k.split(":"); return { kind, id, ...catOf(kind, id) }; });
}
const chipHTML = c => `<button class="chip" style="--c:${c.color}" aria-pressed="${!!draft && draft.kind === c.kind && draft.targetId === c.id}" data-act="pick-cat" data-kind="${c.kind}" data-id="${c.id}"><span>${c.emoji}</span>${esc(c.short)}</button>`;

function openAdd(opts = {}) {
  const ib = opts.inboxId ? inbox().find(x => x.id === opts.inboxId) : null;
  if (ib) {
    draft = { editId: null, inboxId: ib.id, str: (ib.amountCents / 100).toFixed(2), kind: ib.kind, targetId: ib.targetId, date: ib.date, pay: ib.pay || "", note: ib.note || ib.merchant || "" };
  } else if (opts.editId) {
    const e = exps().find(x => x.id === opts.editId);
    if (!e) return;
    draft = { editId: e.id, str: (e.amountCents / 100).toFixed(2), kind: e.kind, targetId: e.targetId, date: e.date, pay: e.paymentMethod, note: e.note || "" };
  } else {
    draft = { editId: null, str: "", kind: opts.kind || null, targetId: opts.targetId || null, date: todayKey(), pay: state.settings.lastPayment || "", note: "" };
  }
  const L = chipList(), fq = frequent();
  openSheet(`
    <div class="sheet-h"><h3>${draft.editId ? "Editar gasto" : "Nuevo gasto"}</h3><button class="x" data-act="close-sheet" aria-label="Cerrar">✕</button></div>
    <div class="amt"><span>$</span><input id="amt" inputmode="decimal" autocomplete="off" placeholder="0.00" data-in="amt" value="${esc(draft.str)}" aria-label="Monto"></div>
    <div id="freqBox">${fq.length && !draft.editId ? `<p class="lbl">Frecuentes</p><div class="chips" id="chFreq">${fq.map(chipHTML).join("")}</div>` : ""}</div>
    <p class="lbl">Sobres del mes</p><div class="chips" id="chEnv">${L.env.map(chipHTML).join("")}</div>
    <p class="lbl">Fondos del viaje</p><div class="chips" id="chFund">${L.fund.map(chipHTML).join("")}</div>
    <p class="lbl">Fijo</p><div class="chips" id="chFix">${L.fix.map(chipHTML).join("")}</div>
    <p class="lbl">Fuera del presupuesto</p><div class="chips" id="chReimb">${L.reimb.map(chipHTML).join("")}</div>
    <div id="subBox"></div>
    <p class="lbl">Pagado con</p>
    <div class="segs" id="pays">${PAYMENTS.map(p => `<button class="seg-b" data-act="pick-pay" data-id="${esc(p.id)}" aria-pressed="${draft.pay === p.id}"><span>${p.emoji}</span>${p.short}</button>`).join("")}</div>
    <details class="more" ${draft.editId || draft.note ? "open" : ""}><summary>Fecha y nota</summary>
      <label class="field"><span>Fecha</span><input class="inp" type="date" data-in="date" value="${draft.date}"></label>
      <label class="field"><span>Nota</span><input class="inp" data-in="note" placeholder="Opcional" value="${esc(draft.note)}" maxlength="80"></label>
    </details>
    <button class="btn" id="saveBtn" data-act="save-expense">Guardar</button>
    ${draft.editId ? `<button class="btn ghost" data-act="split-expense" data-id="${draft.editId}">✂ Dividir en varios sobres</button>` : ""}
    ${draft.editId ? `<button class="btn danger" data-act="del-expense" data-id="${draft.editId}">Eliminar gasto</button>` : ""}
  `);
  paintAdd();
  setTimeout(() => { const a = $("#amt"); if (a && !draft.editId) a.focus(); }, 60);
}
function paintAdd() {
  if (!draft) return;
  $$(".chip", $("#sheetRoot")).forEach(b => { b.setAttribute("aria-pressed", String(b.dataset.kind === draft.kind && b.dataset.id === draft.targetId)); });
  const cents = parseCents(draft.str), cat = draft.kind ? catOf(draft.kind, draft.targetId) : null;
  const btn = $("#saveBtn");
  if (btn) {
    btn.disabled = !(cents && cat);
    btn.textContent = cents && cat ? `Guardar ${money(cents)} en ${cat.short}` : (cents ? "Elige una categoría" : "Escribe el monto");
    btn.style.background = cat ? cat.color : ""; btn.style.color = cat ? "#10131B" : "";
  }
  const sb = $("#subBox");
  if (sb) {
    const f = draft.kind === "fund" ? state.budget.funds[draft.targetId] : null;
    sb.innerHTML = f && f.subcats ? `<p class="lbl">¿Qué compraste?</p><div class="chips">${f.subcats.map(s => `<button class="chip" style="--c:${f.color}" aria-pressed="${draft.note === s}" data-act="pick-sub" data-v="${esc(s)}">${esc(s)}</button>`).join("")}</div>` : "";
  }
}
INPUTS.amt = t => { draft.str = t.value; paintAdd(); };
INPUTS.date = t => { draft.date = t.value; };
INPUTS.note = t => { draft.note = t.value; };
ACTIONS["open-add"] = d => openAdd({ kind: d.kind, targetId: d.id });
ACTIONS["edit-expense"] = d => openAdd({ editId: d.id });
ACTIONS["pick-cat"] = d => { draft.kind = d.kind; draft.targetId = d.id; paintAdd(); };
ACTIONS["pick-pay"] = d => { draft.pay = draft.pay === d.id ? "" : d.id; $$("#pays .seg-b").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.id === draft.pay))); };
ACTIONS["pick-sub"] = d => { draft.note = draft.note === d.v ? "" : d.v; const n = $('[data-in="note"]'); if (n) n.value = draft.note; paintAdd(); };

ACTIONS["save-expense"] = () => {
  const cents = parseCents(draft.str);
  if (!cents || !draft.kind) return;
  const date = draft.date || todayKey();
  const cat = catOf(draft.kind, draft.targetId);
  const lastPay = draft.pay;
  if (draft.editId) {
    const e = exps().find(x => x.id === draft.editId);
    const before = clone(e);
    Object.assign(e, { amountCents: cents, date, kind: draft.kind, targetId: draft.targetId, paymentMethod: draft.pay, note: draft.note.trim() });
    if (before.paymentMethod !== CARD && e.paymentMethod === CARD) e.paid = false;
    save(); closeSheet(); refresh();
    toast("Gasto actualizado", { action: "Deshacer", fn: () => { Object.assign(e, before); save(); refresh(); } });
  } else {
    const e = { id: uid(), amountCents: cents, date, kind: draft.kind, targetId: draft.targetId, paymentMethod: draft.pay, note: draft.note.trim(), recurringId: null, paid: false };
    exps().push(e);
    const ibItem = draft.inboxId ? inbox().find(x => x.id === draft.inboxId) : null;
    if (ibItem) { learn(ibItem, draft.kind, draft.targetId); state.budget.inbox = inbox().filter(x => x.id !== ibItem.id); e.fromInbox = ibItem.id; }
    else state.settings.lastPayment = lastPay;
    save(); closeSheet(); refresh();
    let msg = `${money(cents)} en ${cat.short}`, tone = "";
    if (draft.kind === "envelope") {
      const mk = date.slice(0, 7), left = effTope(mk, draft.targetId) - spentEnv(mk, draft.targetId);
      msg += left >= 0 ? ` · te quedan ${money(left)}` : ` · te pasaste ${money(-left)}`;
      if (left < 0) tone = "warn";
    } else if (draft.kind === "fund") {
      const f = state.budget.funds[draft.targetId];
      msg += ` · quedan ${money(f.totalCents - fundSpent(draft.targetId))} del fondo`;
    }
    toast(msg, { tone, action: "Deshacer", fn: () => { state.budget.expenses = exps().filter(x => x.id !== e.id); if (ibItem) inbox().push(ibItem); save(); refresh(); } });
  }
  draft = null;
};
ACTIONS["del-expense"] = d => {
  const i = exps().findIndex(x => x.id === d.id);
  if (i < 0) return;
  const [e] = exps().splice(i, 1);
  save(); closeSheet(); refresh();
  toast("Gasto eliminado", { action: "Deshacer", fn: () => { exps().splice(Math.min(i, exps().length), 0, e); save(); refresh(); } });
};

/* ===================== detalle de sobre ===================== */
function expRow(e) {
  const c = catOf(e.kind, e.targetId);
  const meta = [dayLabel(e.date), e.paymentMethod ? PAYMENTS.find(p => p.id === e.paymentMethod)?.short : "", e.note].filter(Boolean).join(" · ");
  const unpaid = e.paymentMethod === CARD && !e.paid;
  return `<button class="row" style="--c:${c.color}" data-act="edit-expense" data-id="${e.id}">
    <span class="ico">${c.emoji}</span>
    <span class="row-b"><b>${esc(c.short)}${e.recurringId ? " ↻" : ""}</b><span>${esc(meta)}</span></span>
    <span class="row-r">${money(e.amountCents)}${unpaid ? "<small>💳 por pagar</small>" : ""}</span></button>`;
}
const sortExp = a => a.slice().sort((x, y) => y.date.localeCompare(x.date) || y.id.localeCompare(x.id));

ACTIONS["open-env"] = d => openEnv(d.id);
function openEnv(id) {
  const mk = mkOf(new Date()), e = ENV[id], pc = paceOf(mk, id), net = transferNet(mk, id), car = carryIn(mk, id), base = baseTope(mk, id);
  const list = sortExp(exps().filter(x => x.kind === "envelope" && x.targetId === id && inMonth(x, mk)));
  const tfs = state.budget.transfers.filter(t => t.month === mk && (t.from === id || t.to === id));
  openSheet(`
    <div class="sheet-h"><span></span><button class="x" data-act="close-sheet" aria-label="Cerrar">✕</button></div>
    <div class="sheet-big" style="--c:${e.color}"><span class="ico">${e.emoji}</span><div><h3 class="display">${esc(e.name)}</h3><span class="pill s-${pc.status}">${pc.short}</span></div></div>
    <p class="sheet-num display">${pc.left >= 0 ? money(pc.left) : "−" + money(-pc.left)}<small>${pc.left >= 0 ? "restantes" : "de más"}</small></p>
    <div class="bar-wrap" style="--c:${e.color}"><div class="bar"><i style="width:${pc.pct}%"></i></div>${pc.tope > 0 ? `<b class="tick" style="left:${pc.expPct}%"></b>` : ""}</div>
    <p class="hint" style="margin-top:10px">${esc(pc.text)} · llevas ${money(pc.spent)} de ${money(pc.tope)}</p>
    <label class="field"><span>Tope base de este mes ($)</span><input class="inp mono" inputmode="decimal" data-in="tope" data-id="${id}" value="${(base / 100).toFixed(2)}"></label>
    ${net || car ? `<p class="hint" style="margin-top:8px">${net ? `Transferencias: ${net > 0 ? "+" : "−"}${money(Math.abs(net))}` : ""}${net && car ? " · " : ""}${car ? `Sobrante del mes pasado: +${money(car)}` : ""}</p>` : ""}
    <div class="btn-row" style="margin-top:16px">
      <button class="btn" style="background:${e.color};color:#10131B;margin:0" data-act="open-add" data-kind="envelope" data-id="${id}">＋ Gasto aquí</button>
      <button class="btn ghost" style="margin:0" data-act="open-transfer" data-to="${id}">↔ Mover dinero</button>
    </div>
    <p class="lbl">Este mes</p>
    <div class="list">${list.length ? list.map(expRow).join("") : `<p class="hint">Todavía no hay gastos en este sobre.</p>`}
    ${tfs.map(t => tfRow(t)).join("")}</div>
  `);
}
INPUTS.tope = t => {
  const mk = mkOf(new Date()), c = t.value === "" ? 0 : parseCents(t.value);
  if (c === null && t.value !== "0") return;
  getMonth(mk).envelopes[t.dataset.id].topeCents = c || 0;
  save(); refresh();
};

/* ===================== detalle de fondo ===================== */
ACTIONS["open-fund"] = d => openFund(d.id);
function openFund(fid) {
  const f = state.budget.funds[fid], spent = fundSpent(fid), left = f.totalCents - spent;
  const pct = f.totalCents > 0 ? Math.min(100, spent / f.totalCents * 100) : 0;
  const list = sortExp(exps().filter(x => x.kind === "fund" && x.targetId === fid));
  openSheet(`
    <div class="sheet-h"><span></span><button class="x" data-act="close-sheet" aria-label="Cerrar">✕</button></div>
    <div class="sheet-big" style="--c:${f.color}"><span class="ico sq">${f.emoji}</span><div><h3 class="display">${esc(f.name)}</h3><span class="hint">No se reinicia: es para todo el viaje</span></div></div>
    <p class="sheet-num display">${money(left)}<small>restantes</small></p>
    <div class="bar-wrap" style="--c:${f.color}"><div class="bar"><i style="width:${pct}%"></i></div></div>
    <p class="hint" style="margin-top:10px">${money(spent)} gastado de ${money(f.totalCents)} · ${pct.toFixed(0)}%</p>
    <label class="field"><span>Total del fondo ($)</span><input class="inp mono" inputmode="decimal" data-in="fundTotal" data-id="${fid}" value="${(f.totalCents / 100).toFixed(2)}"></label>
    <button class="btn" style="background:${f.color};color:#10131B" data-act="open-add" data-kind="fund" data-id="${fid}">＋ Gasto en este fondo</button>
    <p class="lbl">Movimientos</p>
    <div class="list">${list.length ? list.map(expRow).join("") : `<p class="hint">Todavía no hay gastos en este fondo.</p>`}</div>
  `);
}
INPUTS.fundTotal = t => { const c = t.value === "" ? 0 : parseCents(t.value); if (c === null && t.value !== "0") return; state.budget.funds[t.dataset.id].totalCents = c || 0; save(); refresh(); };

/* ===================== transferencias ===================== */
let tdraft = null;
const slack = (mk, id) => Math.max(0, effTope(mk, id) - spentEnv(mk, id));
function tfRow(t) {
  const a = ENV[t.from], b = ENV[t.to];
  return `<button class="row" data-act="open-tf" data-id="${t.id}"><span class="ico tf-ico">↔</span>
    <span class="row-b"><b>${esc(a.short)} → ${esc(b.short)}</b><span>${dayLabel(t.date)} · transferencia</span></span><span class="row-r">${money(t.amountCents)}</span></button>`;
}
ACTIONS["open-transfer"] = d => openTransfer(d.from, d.to, d.cents);
function openTransfer(from, to, cents) {
  const mk = mkOf(new Date());
  if (!from) from = ENVELOPES.filter(e => e.id !== to).sort((a, b) => slack(mk, b.id) - slack(mk, a.id))[0].id;
  if (!to) to = ENVELOPES.find(e => e.id !== from).id;
  tdraft = { from, to, str: cents ? (cents / 100).toFixed(2) : "" };
  const opts = sel => ENVELOPES.map(e => `<option value="${e.id}" ${e.id === sel ? "selected" : ""}>${e.emoji} ${esc(e.name)} — disponible ${moneyR(slack(mk, e.id))}</option>`).join("");
  openSheet(`
    <div class="sheet-h"><h3>Mover dinero</h3><button class="x" data-act="close-sheet" aria-label="Cerrar">✕</button></div>
    <p class="hint">Cambia los topes solo de este mes. El total del mes no cambia.</p>
    <label class="field"><span>De</span><select class="inp" data-ch="tf-from">${opts(from)}</select></label>
    <label class="field"><span>A</span><select class="inp" data-ch="tf-to">${opts(to)}</select></label>
    <label class="field"><span>Monto ($)</span><input class="inp mono" id="tfAmt" inputmode="decimal" placeholder="0.00" data-in="tf-amt" value="${esc(tdraft.str)}"></label>
    <p class="err" id="tfErr"></p>
    <button class="btn" id="tfBtn" data-act="do-transfer">Mover</button>
  `);
  paintTf();
}
function paintTf() {
  const mk = mkOf(new Date()), c = parseCents(tdraft.str), av = slack(mk, tdraft.from);
  let err = "";
  if (tdraft.from === tdraft.to) err = "Elige dos sobres distintos.";
  else if (c && c > av) err = `Solo hay ${money(av)} disponibles en ${ENV[tdraft.from].short}.`;
  $("#tfErr").textContent = err;
  const b = $("#tfBtn"); b.disabled = !c || !!err;
  b.textContent = c && !err ? `Mover ${money(c)} a ${ENV[tdraft.to].short}` : "Mover";
}
INPUTS["tf-amt"] = t => { tdraft.str = t.value; paintTf(); };
CHANGES["tf-from"] = t => { tdraft.from = t.value; paintTf(); };
CHANGES["tf-to"] = t => { tdraft.to = t.value; paintTf(); };
ACTIONS["do-transfer"] = () => {
  const mk = mkOf(new Date()), c = parseCents(tdraft.str);
  if (!c || tdraft.from === tdraft.to || c > slack(mk, tdraft.from)) return;
  const t = { id: uid(), from: tdraft.from, to: tdraft.to, amountCents: c, month: mk, date: todayKey() };
  state.budget.transfers.push(t); save(); closeSheet(); refresh();
  toast(`${money(c)} movidos de ${ENV[t.from].short} a ${ENV[t.to].short}`, { action: "Deshacer", fn: () => { state.budget.transfers = state.budget.transfers.filter(x => x.id !== t.id); save(); refresh(); } });
};
ACTIONS["open-tf"] = d => {
  const t = state.budget.transfers.find(x => x.id === d.id); if (!t) return;
  openSheet(`
    <div class="sheet-h"><h3>Transferencia</h3><button class="x" data-act="close-sheet" aria-label="Cerrar">✕</button></div>
    <p class="sheet-num display" style="margin-top:12px">${money(t.amountCents)}</p>
    <p class="hint" style="margin-top:8px">${ENV[t.from].emoji} ${esc(ENV[t.from].name)} → ${ENV[t.to].emoji} ${esc(ENV[t.to].name)} · ${dayLabel(t.date)}</p>
    <button class="btn danger" data-act="undo-tf" data-id="${t.id}">Revertir transferencia</button>`);
};
ACTIONS["undo-tf"] = d => { state.budget.transfers = state.budget.transfers.filter(x => x.id !== d.id); save(); closeSheet(); refresh(); toast("Transferencia revertida"); };

/* ===================== tarjeta de crédito ===================== */
ACTIONS["open-card"] = () => {
  const list = sortExp(cardUnpaid()), total = list.reduce((s, e) => s + e.amountCents, 0);
  openSheet(`
    <div class="sheet-h"><h3>Tarjeta de crédito</h3><button class="x" data-act="close-sheet" aria-label="Cerrar">✕</button></div>
    <p class="sheet-num display" style="margin-top:10px">${money(total)}<small>por pagar</small></p>
    <p class="hint" style="margin-top:8px">Suma de lo que pagaste con tarjeta y aún no marcaste como pagado.</p>
    <div class="list" style="margin-top:14px">${list.length ? list.map(expRow).join("") : `<p class="empty"><b>✅</b>No debes nada en la tarjeta.</p>`}</div>
    ${list.length ? `<button class="btn" data-act="pay-card">Marcar todo como pagado</button>` : ""}`);
};
ACTIONS["pay-card"] = () => {
  const ids = cardUnpaid().map(e => e.id), today = todayKey();
  exps().forEach(e => { if (ids.includes(e.id)) { e.paid = true; e.paidDate = today; } });
  save(); closeSheet(); refresh();
  toast(`Tarjeta pagada (${ids.length} ${ids.length === 1 ? "gasto" : "gastos"})`, { action: "Deshacer", fn: () => { exps().forEach(e => { if (ids.includes(e.id)) { e.paid = false; delete e.paidDate; } }); save(); refresh(); } });
};
ACTIONS["do-suggest"] = d => {
  const mk = mkOf(new Date()), s = suggestions(mk)[+d.i];
  if (!s) return;
  const t = { id: uid(), from: s.from, to: s.to, amountCents: s.cents, month: mk, date: todayKey() };
  state.budget.transfers.push(t); save(); refresh();
  toast(`${money(s.cents)} movidos de ${ENV[s.from].short} a ${ENV[s.to].short}`, { action: "Deshacer", fn: () => { state.budget.transfers = state.budget.transfers.filter(x => x.id !== t.id); save(); refresh(); } });
};

/* ===================== recurrentes ===================== */
let rdraft = null;
function openRecurring(id) {
  const r = id ? state.budget.recurring.find(x => x.id === id) : null;
  const now = new Date();
  rdraft = r ? { id: r.id, name: r.name, str: (r.amountCents / 100).toFixed(2), kind: r.kind, targetId: r.targetId, day: r.day, pay: r.paymentMethod }
             : { id: null, name: "", str: "", kind: "envelope", targetId: "gym", day: Math.min(28, now.getDate()), pay: "" };
  const L = chipList();
  openSheet(`
    <div class="sheet-h"><h3>${r ? "Editar recurrente" : "Gasto recurrente"}</h3><button class="x" data-act="close-sheet" aria-label="Cerrar">✕</button></div>
    <p class="hint">Se agrega solo cada mes, en el día que elijas.</p>
    <label class="field"><span>Nombre</span><input class="inp" data-in="r-name" placeholder="Ej: Membresía del gym" value="${esc(rdraft.name)}" maxlength="40"></label>
    <label class="field"><span>Monto ($)</span><input class="inp mono" inputmode="decimal" placeholder="0.00" data-in="r-amt" value="${esc(rdraft.str)}"></label>
    <p class="lbl">Categoría</p>
    <div class="chips" id="rChips">${[...L.env, ...L.fix].map(c => `<button class="chip" style="--c:${c.color}" aria-pressed="${rdraft.kind === c.kind && rdraft.targetId === c.id}" data-act="r-cat" data-kind="${c.kind}" data-id="${c.id}"><span>${c.emoji}</span>${esc(c.short)}</button>`).join("")}</div>
    <label class="field"><span>Día del mes (1–28)</span><input class="inp mono" type="number" min="1" max="28" data-in="r-day" value="${rdraft.day}"></label>
    <p class="lbl">Pagado con</p>
    <div class="segs" id="rPays">${PAYMENTS.map(p => `<button class="seg-b" data-act="r-pay" data-id="${esc(p.id)}" aria-pressed="${rdraft.pay === p.id}"><span>${p.emoji}</span>${p.short}</button>`).join("")}</div>
    <button class="btn" id="rSave" data-act="r-save">Guardar</button>
    ${r ? `<button class="btn danger" data-act="r-del" data-id="${r.id}">Eliminar recurrente</button>` : ""}`);
  paintR();
}
function paintR() {
  const ok = rdraft.name.trim() && parseCents(rdraft.str) && rdraft.day >= 1 && rdraft.day <= 28;
  const b = $("#rSave"); if (b) b.disabled = !ok;
}
INPUTS["r-name"] = t => { rdraft.name = t.value; paintR(); };
INPUTS["r-amt"] = t => { rdraft.str = t.value; paintR(); };
INPUTS["r-day"] = t => { rdraft.day = parseInt(t.value, 10) || 0; paintR(); };
ACTIONS["r-cat"] = d => { rdraft.kind = d.kind; rdraft.targetId = d.id; $$("#rChips .chip").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.kind === d.kind && b.dataset.id === d.id))); };
ACTIONS["r-pay"] = d => { rdraft.pay = rdraft.pay === d.id ? "" : d.id; $$("#rPays .seg-b").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.id === rdraft.pay))); };
ACTIONS["new-recurring"] = () => openRecurring(null);
ACTIONS["edit-recurring"] = d => openRecurring(d.id);
ACTIONS["r-save"] = () => {
  const cents = parseCents(rdraft.str); if (!cents) return;
  const now = new Date(), cur = mkOf(now);
  if (rdraft.id) {
    Object.assign(state.budget.recurring.find(x => x.id === rdraft.id), { name: rdraft.name.trim(), amountCents: cents, kind: rdraft.kind, targetId: rdraft.targetId, day: rdraft.day, paymentMethod: rdraft.pay });
  } else {
    state.budget.recurring.push({ id: uid(), name: rdraft.name.trim(), amountCents: cents, kind: rdraft.kind, targetId: rdraft.targetId, day: rdraft.day, paymentMethod: rdraft.pay,
      fromMonth: rdraft.day > now.getDate() ? cur : nextMk(cur), active: true });
  }
  save(); runRecurring(); closeSheet(); refresh(); toast("Recurrente guardado");
};
ACTIONS["r-del"] = d => {
  const i = state.budget.recurring.findIndex(x => x.id === d.id); if (i < 0) return;
  const [r] = state.budget.recurring.splice(i, 1);
  save(); closeSheet(); refresh();
  toast("Recurrente eliminado", { action: "Deshacer", fn: () => { state.budget.recurring.splice(Math.min(i, state.budget.recurring.length), 0, r); save(); refresh(); } });
};
ACTIONS["r-toggle"] = d => { const r = state.budget.recurring.find(x => x.id === d.id); r.active = !r.active; save(); refresh(); };

/* ===================== reembolsables (la empresa te devuelve) ===================== */
const reimbDue = () => exps().filter(e => e.kind === "reimb" && !e.reimbursedOn);
function reimbBanner() {
  const L = reimbDue(); if (!L.length) return "";
  const tot = L.reduce((s, e) => s + e.amountCents, 0);
  return `<button class="cardbal" data-act="open-reimb"><span class="ico">🔄</span><div><b>${money(tot)} por reembolsar</b><span>${L.length} ${L.length === 1 ? "gasto" : "gastos"} que te devuelve la empresa · no cuentan en tu presupuesto</span></div><span class="chev muted">›</span></button>`;
}
function reimbSheetHTML() {
  const L = reimbDue().sort((a, b) => a.date.localeCompare(b.date));
  const done = exps().filter(e => e.kind === "reimb" && e.reimbursedOn).length;
  return `<div class="sheet-h"><h3>Por reembolsar</h3><button class="x" data-act="close-sheet" aria-label="Cerrar">✕</button></div>
    <p class="hint" style="margin:4px 0 12px">Estos gastos salieron de tu tarjeta pero no cuentan en tu presupuesto. Cuando te los devuelvan, márcalos. Si al final no te los pagan, toca el gasto y muévelo a un sobre.</p>
    <div class="list">${L.map(e => `<div class="row" style="--c:${REIMB.color}">
      <button class="row-b" style="display:flex;align-items:center;gap:12px;text-align:left" data-act="edit-expense" data-id="${e.id}"><span class="ico">${REIMB.emoji}</span><span class="row-b"><b>${esc(e.note || "Reembolsable")}</b><span>${dayShort(e.date)}</span></span></button>
      <span class="row-r">${money(e.amountCents)}</span>
      <button class="btn-s" data-act="reimb-done" data-id="${e.id}">Ya llegó</button></div>`).join("") || `<div class="empty"><b>✓</b>Nada pendiente.</div>`}</div>
    ${done ? `<p class="hint" style="margin-top:12px">${done} ya ${done === 1 ? "reembolsado" : "reembolsados"} (siguen en el historial).</p>` : ""}`;
}
ACTIONS["open-reimb"] = () => openSheet(reimbSheetHTML());
ACTIONS["reimb-done"] = d => {
  const e = exps().find(x => x.id === d.id); if (!e) return;
  e.reimbursedOn = todayKey(); save();
  if (reimbDue().length) openSheet(reimbSheetHTML()); else closeSheet();
  refresh();
  toast(`${money(e.amountCents)} reembolsado`, { action: "Deshacer", fn: () => { delete e.reimbursedOn; save(); refresh(); } });
};
