"use strict";
/* ===================== cierre de mes y ahorros ===================== */
const BUDGET_FIRST = "2026-10";
const MODES = [["keep", "Se queda"], ["save", "Ahorros"], ["drop", "Se deja ir"]];
const DEFAULT_MODE = { comida: "save", salidas: "save", transporte: "save", gustos: "save", gym: "keep", lavanderia: "keep", aseo: "keep", fijosEc: "keep", ropa: "keep", corte: "keep", proteina: "keep" };
const modeOf = id => state.budget.envMode[id] || DEFAULT_MODE[id] || "drop";
const monthName = mk => MONTHS[+mk.slice(5) - 1];
const monthLeft = (mk, id) => effTope(mk, id) - spentEnv(mk, id);

function pendingClose() {
  const cur = mkOf(new Date());
  return Object.keys(state.budget.months).filter(k => k >= BUDGET_FIRST && k < cur && !state.budget.closes[k]).sort()[0] || null;
}
function savingsTotal() {
  let t = 0;
  Object.values(state.budget.closes).forEach(c => Object.values(c.items).forEach(i => { if (i.mode === "save") t += i.leftCents; }));
  state.budget.savingsMoves.forEach(m => { t += m.cents; });
  return t;
}

/* --- aviso en Inicio --- */
function closeBanner() {
  const mk = pendingClose(); if (!mk) return "";
  const tot = ENVELOPES.reduce((s, e) => s + Math.max(0, monthLeft(mk, e.id)), 0);
  return `<button class="cardbal" data-act="open-close" data-mk="${mk}" style="border-color:var(--ok)"><span class="ico">🧾</span><div><b>Cierra ${monthName(mk).toLowerCase()}${tot > 0 ? ` · sobraron ${money(tot)}` : ""}</b><span>Decide qué hacer con lo que sobró · toma 30 segundos</span></div><span class="chev muted">›</span></button>`;
}

/* --- hoja de cierre --- */
let cl = null;
function openClose(mk) {
  const rows = ENVELOPES.map(e => ({ e, left: monthLeft(mk, e.id) }));
  cl = { mk, modes: {} };
  rows.filter(r => r.left > 0).forEach(r => { cl.modes[r.e.id] = modeOf(r.e.id); });
  paintClose();
}
function paintClose() {
  const mk = cl.mk, rows = ENVELOPES.map(e => ({ e, left: monthLeft(mk, e.id) }));
  const pos = rows.filter(r => r.left > 0), over = rows.filter(r => r.left < 0);
  const sum = m => pos.filter(r => cl.modes[r.e.id] === m).reduce((s, r) => s + r.left, 0);
  openSheet(`<div class="sheet-h"><h3>Cierra ${monthName(mk).toLowerCase()}</h3><button class="x" data-act="close-sheet" aria-label="Cerrar">✕</button></div>
    <p class="hint" style="margin:4px 0 12px">${pos.length ? "Esto es lo que sobró en cada sobre. Ya marqué lo que sueles hacer; cambia lo que quieras." : "No sobró nada en ningún sobre."}</p>
    ${pos.map(({ e, left }) => `<div class="card" style="--c:${e.color};margin:0 0 10px;padding:12px">
      <div style="display:flex;align-items:center;gap:10px"><span class="ico" style="--c:${e.color}">${e.emoji}</span><div class="row-b"><b>${esc(e.short)}</b><span>sobró ${money(left)}</span></div></div>
      <div class="segs" style="margin-top:10px">${MODES.map(([m, l]) => `<button class="seg-b" data-act="cl-mode" data-id="${e.id}" data-m="${m}" aria-pressed="${cl.modes[e.id] === m}">${l}</button>`).join("")}</div></div>`).join("")}
    ${over.length ? `<p class="hint" style="margin:4px 0 10px">Te pasaste en ${over.map(r => esc(r.e.short) + " (" + money(-r.left) + ")").join(", ")}. Eso no se arrastra.</p>` : ""}
    <div class="card" style="margin:0 0 4px;padding:12px"><p class="hint">Pasa a ${monthName(nextMk(mk)).toLowerCase()}: <b>${money(sum("keep"))}</b> · A ahorros: <b>${money(sum("save"))}</b> · Se deja ir: <b>${money(sum("drop"))}</b></p></div>
    <button class="btn" data-act="cl-confirm">Confirmar cierre</button>`);
}
ACTIONS["open-close"] = d => openClose(d.mk);
ACTIONS["cl-mode"] = d => { cl.modes[d.id] = d.m; paintClose(); };
ACTIONS["cl-confirm"] = () => {
  if (!cl) return;
  const mk = cl.mk, items = {};
  ENVELOPES.forEach(e => { const left = monthLeft(mk, e.id); if (left > 0) items[e.id] = { leftCents: left, mode: cl.modes[e.id] || modeOf(e.id) }; });
  state.budget.closes[mk] = { at: Date.now(), items };
  cl = null; save(); closeSheet(); refresh();
  toast(`${monthName(mk)} cerrado`, { action: "Deshacer", fn: () => { delete state.budget.closes[mk]; save(); refresh(); } });
};

/* --- preferencias por sobre (Más) --- */
function prefsHTML() {
  return `<div class="sheet-h"><h3>Lo que sobra</h3><button class="x" data-act="close-sheet" aria-label="Cerrar">✕</button></div>
    <p class="hint" style="margin:4px 0 12px">Qué hacer por defecto con lo que sobra de cada sobre al cerrar el mes. En cada cierre puedes cambiarlo.</p>
    ${ENVELOPES.map(e => `<div class="card" style="--c:${e.color};margin:0 0 8px;padding:10px 12px"><div style="display:flex;align-items:center;gap:10px"><span class="ico" style="--c:${e.color}">${e.emoji}</span><b class="row-b">${esc(e.short)}</b></div>
      <div class="segs" style="margin-top:8px">${MODES.map(([m, l]) => `<button class="seg-b" data-act="mode-pick" data-id="${e.id}" data-m="${m}" aria-pressed="${modeOf(e.id) === m}">${l}</button>`).join("")}</div></div>`).join("")}`;
}
ACTIONS["open-prefs"] = () => openSheet(prefsHTML());
ACTIONS["mode-pick"] = d => { state.budget.envMode[d.id] = d.m; save(); openSheet(prefsHTML()); };

/* --- ahorros --- */
function savingsCard() {
  const t = savingsTotal(), has = t !== 0 || Object.keys(state.budget.closes).length;
  return `<section class="card"><h3 class="display">Ahorros</h3>
    <button class="menu" style="margin:6px 0 0" data-act="open-savings"><span class="ico" style="--c:#5BE16B">🌱</span><div><b>${money(t)}</b><span>${has ? "lo que has dejado sin gastar" : "aquí se acumula lo que decidas ahorrar"}</span></div><span class="chev">›</span></button></section>`;
}
function savingsHTML() {
  const cls = Object.entries(state.budget.closes).sort((a, b) => b[0].localeCompare(a[0]));
  const lines = cls.map(([mk, c]) => {
    const parts = Object.entries(c.items).filter(([, i]) => i.mode === "save");
    const tot = parts.reduce((s, [, i]) => s + i.leftCents, 0);
    return tot ? `<div class="row" style="margin-bottom:8px"><span class="row-b"><b>${monthName(mk)}</b><span>${parts.map(([id, i]) => ENV[id].short + " " + moneyR(i.leftCents)).join(" · ")}</span></span><span class="row-r">+${money(tot)}</span></div>` : "";
  }).join("");
  const moves = state.budget.savingsMoves.slice().sort((a, b) => b.date.localeCompare(a.date)).map(m => `<div class="row" style="margin-bottom:8px"><span class="row-b"><b>${esc(m.note || (m.cents > 0 ? "Mandado a ahorros" : "Retirado"))}</b><span>${dayShort(m.date)}</span></span><span class="row-r">${m.cents > 0 ? "+" : "−"}${money(Math.abs(m.cents))}</span><button class="x" data-act="sv-del" data-id="${m.id}" aria-label="Quitar">✕</button></div>`).join("");
  return `<div class="sheet-h"><h3>Ahorros</h3><button class="x" data-act="close-sheet" aria-label="Cerrar">✕</button></div>
    <div class="amt" style="justify-content:flex-start"><span>$</span><b style="font-size:44px">${(savingsTotal() / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></div>
    <p class="hint" style="margin:0 0 12px">Es un registro de lo que decidiste no gastar. El dinero sigue en tu cuenta.</p>
    ${lines || moves ? `<p class="lbl">Historial</p>${lines}${moves}` : ""}
    <div class="btn-row"><button class="btn ghost" style="margin:0" data-act="sv-open" data-s="1">＋ Mandar</button><button class="btn ghost" style="margin:0" data-act="sv-open" data-s="-1">− Retirar</button></div>`;
}
ACTIONS["open-savings"] = () => openSheet(savingsHTML());
let sv = null;
ACTIONS["sv-open"] = d => {
  sv = { sign: +d.s, str: "", note: "" };
  openSheet(`<div class="sheet-h"><h3>${sv.sign > 0 ? "Mandar a ahorros" : "Retirar de ahorros"}</h3><button class="x" data-act="close-sheet" aria-label="Cerrar">✕</button></div>
    <div class="amt"><span>$</span><input id="svAmt" inputmode="decimal" autocomplete="off" placeholder="0.00" data-in="sv-amt" aria-label="Monto"></div>
    <label class="field"><span>Nota</span><input class="inp" data-in="sv-note" placeholder="Opcional" maxlength="60"></label>
    <button class="btn" id="svSave" data-act="sv-save" disabled>Escribe el monto</button>`);
  setTimeout(() => { const a = $("#svAmt"); if (a) a.focus(); }, 60);
};
INPUTS["sv-amt"] = t => { sv.str = t.value; const c = parseCents(t.value), b = $("#svSave"); if (b) { b.disabled = !c; b.textContent = c ? (sv.sign > 0 ? `Mandar ${money(c)}` : `Retirar ${money(c)}`) : "Escribe el monto"; } };
INPUTS["sv-note"] = t => { sv.note = t.value; };
ACTIONS["sv-save"] = () => {
  const c = parseCents(sv.str); if (!c) return;
  state.budget.savingsMoves.push({ id: uid(), cents: sv.sign * c, date: todayKey(), note: sv.note.trim() });
  sv = null; save(); openSheet(savingsHTML()); refresh();
};
ACTIONS["sv-del"] = d => {
  const i = state.budget.savingsMoves.findIndex(m => m.id === d.id); if (i < 0) return;
  const [m] = state.budget.savingsMoves.splice(i, 1); save(); openSheet(savingsHTML()); refresh();
  toast("Movimiento quitado", { action: "Deshacer", fn: () => { state.budget.savingsMoves.splice(Math.min(i, state.budget.savingsMoves.length), 0, m); save(); refresh(); } });
};
