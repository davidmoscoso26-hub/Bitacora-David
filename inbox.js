"use strict";
/* ===================== bandeja "Por clasificar" ===================== */
const inbox = () => state.budget.inbox;
const dayShort = d => `${+d.slice(8)} ${MONTHS_S[+d.slice(5, 7) - 1]}`;
const dupOf = it => exps().find(e => e.amountCents === it.amountCents && e.date === it.date && e.kind === it.kind && e.targetId === it.targetId);

function inboxBanner() {
  const n = inbox().length; if (!n) return "";
  const tot = inbox().reduce((s, i) => s + i.amountCents, 0);
  return `<button class="cardbal" data-act="open-inbox" style="border-color:var(--near)"><span class="ico">📥</span><div><b>${n} por clasificar · ${money(tot)}</b><span>Llegaron del banco · confirma el sobre con un toque</span></div><span class="chev muted">›</span></button>`;
}
function inboxSheetHTML() {
  const items = inbox().slice().sort((a, b) => a.date.localeCompare(b.date));
  const rows = items.map(it => {
    const c = catOf(it.kind, it.targetId), dup = dupOf(it);
    return `<div class="row" style="--c:${c.color}">
      <button class="row-b" style="display:flex;align-items:center;gap:12px;text-align:left" data-act="edit-inbox" data-id="${esc(it.id)}">
        <span class="ico">${c.emoji}</span>
        <span class="row-b"><b>${esc(it.note || it.merchant)}</b><span>${dayShort(it.date)} · ${esc(c.short)}${dup ? " · ⚠ ¿ya lo anotaste?" : ""}</span></span></button>
      <span class="row-r">${money(it.amountCents)}</span>
      <button class="btn-s" data-act="accept-inbox" data-id="${esc(it.id)}" aria-label="Aceptar">✓</button>
      <button class="x" data-act="dismiss-inbox" data-id="${esc(it.id)}" aria-label="Descartar">✕</button></div>`;
  }).join("");
  return `<div class="sheet-h"><h3>Por clasificar</h3><button class="x" data-act="close-sheet" aria-label="Cerrar">✕</button></div>
    <p class="hint" style="margin:4px 0 12px">Toca ✓ si el sobre sugerido está bien, toca la fila para cambiarlo, o ✕ para descartar.</p>
    <div class="list">${rows}</div>
    <button class="btn" data-act="accept-all">Aceptar todas las sugeridas</button>`;
}
function repaintInbox() { if (!inbox().length) { closeSheet(); } else openSheet(inboxSheetHTML()); refresh(); }
function acceptItem(it) {
  const e = { id: uid(), amountCents: it.amountCents, date: it.date, kind: it.kind, targetId: it.targetId, paymentMethod: it.pay || "", note: it.note || it.merchant, recurringId: null, paid: false, fromInbox: it.id };
  exps().push(e);
  state.budget.inbox = inbox().filter(x => x.id !== it.id);
  return e;
}
ACTIONS["open-inbox"] = () => openSheet(inboxSheetHTML());
ACTIONS["accept-inbox"] = d => {
  const it = inbox().find(x => x.id === d.id); if (!it) return;
  const e = acceptItem(it); save(); repaintInbox();
  toast(`${money(e.amountCents)} en ${catOf(e.kind, e.targetId).short}`, { action: "Deshacer", fn: () => { state.budget.expenses = exps().filter(x => x.id !== e.id); inbox().push(it); save(); refresh(); } });
};
ACTIONS["accept-all"] = () => {
  const items = inbox().slice(); if (!items.length) return;
  const made = items.map(acceptItem); save(); closeSheet(); refresh();
  toast(`${made.length} gastos agregados`, { action: "Deshacer", fn: () => { const ids = new Set(made.map(e => e.id)); state.budget.expenses = exps().filter(x => !ids.has(x.id)); items.forEach(i => inbox().push(i)); save(); refresh(); } });
};
ACTIONS["dismiss-inbox"] = d => {
  const it = inbox().find(x => x.id === d.id); if (!it) return;
  state.budget.inbox = inbox().filter(x => x.id !== d.id); save(); repaintInbox();
  toast("Descartado", { action: "Deshacer", fn: () => { inbox().push(it); save(); refresh(); } });
};
ACTIONS["edit-inbox"] = d => openAdd({ inboxId: d.id });

/* trae los gastos nuevos de inbox.json (luego lo reemplazará el correo automático) */
async function syncInbox() {
  try {
    const r = await fetch("/inbox.json?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) return;
    const arr = await r.json(); let n = 0;
    arr.forEach(it => { if (!it || !it.id || state.budget.inboxSeen[it.id]) return; state.budget.inboxSeen[it.id] = 1; inbox().push(it); n++; });
    if (n) { save(); if (!sheetOpen()) render(); toast(`${n} ${n === 1 ? "gasto nuevo" : "gastos nuevos"} por clasificar`); }
  } catch (e) { /* sin conexión: no pasa nada */ }
}
