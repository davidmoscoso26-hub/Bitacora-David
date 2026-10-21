"use strict";
/* ===================== bandeja "Por clasificar" ===================== */
const inbox = () => state.budget.inbox;
const dayShort = d => `${+d.slice(8)} ${MONTHS_S[+d.slice(5, 7) - 1]}`;
const dupOf = it => it.kind && exps().find(e => e.amountCents === it.amountCents && e.date === it.date && e.kind === it.kind && e.targetId === it.targetId);
const NOCAT = { name: "Sin sobre", short: "Elegir sobre", emoji: "❔", color: "#A8B3C7" };
const catOfItem = it => it.kind ? catOf(it.kind, it.targetId) : NOCAT;

/* la app aprende: si confirmas un comercio en un sobre, la próxima vez ya llega ahí */
const merchKey = m => String(m || "").toUpperCase().replace(/[^A-ZÑ ]/g, "").trim().split(/\s+/).slice(0, 2).join(" ");
function learn(it, kind, targetId) { if (it && it.merchant && kind) { state.budget.rules[merchKey(it.merchant)] = { kind, targetId }; } }

function inboxBanner() {
  const n = inbox().length; if (!n) return "";
  const tot = inbox().reduce((s, i) => s + i.amountCents, 0);
  return `<button class="cardbal" data-act="open-inbox" style="border-color:var(--near)"><span class="ico">📥</span><div><b>${n} por clasificar · ${money(tot)}</b><span>Llegaron del banco · confirma el sobre con un toque</span></div><span class="chev muted">›</span></button>`;
}
function inboxSheetHTML() {
  const items = inbox().slice().sort((a, b) => a.date.localeCompare(b.date));
  const ready = items.filter(i => i.kind).length;
  const rows = items.map(it => {
    const c = catOfItem(it), dup = dupOf(it);
    return `<div class="row" style="--c:${c.color}">
      <button class="row-b" style="display:flex;align-items:center;gap:12px;text-align:left" data-act="edit-inbox" data-id="${esc(it.id)}">
        <span class="ico">${c.emoji}</span>
        <span class="row-b"><b>${esc(it.note || it.merchant)}</b><span>${dayShort(it.date)} · ${esc(c.short)}${dup ? " · ⚠ ¿ya lo anotaste?" : ""}</span></span></button>
      <span class="row-r">${money(it.amountCents)}</span>
      <button class="btn-s" data-act="accept-inbox" data-id="${esc(it.id)}" aria-label="Aceptar" ${it.kind ? "" : "disabled style=\"opacity:.35\""}>✓</button>
      <button class="x" data-act="dismiss-inbox" data-id="${esc(it.id)}" aria-label="Descartar">✕</button></div>`;
  }).join("");
  return `<div class="sheet-h"><h3>Por clasificar</h3><button class="x" data-act="close-sheet" aria-label="Cerrar">✕</button></div>
    <p class="hint" style="margin:4px 0 12px">Toca ✓ si el sobre sugerido está bien, toca la fila para cambiarlo, o ✕ para descartar. La app recuerda tus elecciones.</p>
    <div class="list">${rows}</div>
    ${ready ? `<button class="btn" data-act="accept-all">Aceptar ${ready} ${ready === 1 ? "sugerida" : "sugeridas"}</button>` : ""}`;
}
function repaintInbox() { if (!inbox().length) closeSheet(); else openSheet(inboxSheetHTML()); refresh(); }
function acceptItem(it) {
  const e = { id: uid(), amountCents: it.amountCents, date: it.date, kind: it.kind, targetId: it.targetId, paymentMethod: it.pay || "", note: it.note || it.merchant, recurringId: null, paid: false, fromInbox: it.id };
  exps().push(e);
  learn(it, it.kind, it.targetId);
  state.budget.inbox = inbox().filter(x => x.id !== it.id);
  return e;
}
ACTIONS["open-inbox"] = () => openSheet(inboxSheetHTML());
ACTIONS["accept-inbox"] = d => {
  const it = inbox().find(x => x.id === d.id); if (!it || !it.kind) return;
  const e = acceptItem(it); save(); repaintInbox();
  toast(`${money(e.amountCents)} en ${catOf(e.kind, e.targetId).short}`, { action: "Deshacer", fn: () => { state.budget.expenses = exps().filter(x => x.id !== e.id); inbox().push(it); save(); refresh(); } });
};
ACTIONS["accept-all"] = () => {
  const items = inbox().filter(i => i.kind); if (!items.length) return;
  const made = items.map(acceptItem); save(); repaintInbox();
  toast(`${made.length} gastos agregados`, { action: "Deshacer", fn: () => { const ids = new Set(made.map(e => e.id)); state.budget.expenses = exps().filter(x => !ids.has(x.id)); items.forEach(i => inbox().push(i)); save(); refresh(); } });
};
ACTIONS["dismiss-inbox"] = d => {
  const it = inbox().find(x => x.id === d.id); if (!it) return;
  state.budget.inbox = inbox().filter(x => x.id !== d.id); save(); repaintInbox();
  toast("Descartado", { action: "Deshacer", fn: () => { inbox().push(it); save(); refresh(); } });
};
ACTIONS["edit-inbox"] = d => openAdd({ inboxId: d.id });

/* ===================== correo → bandeja ===================== */
let syncing = false;
async function syncInbox(manual) {
  const url = (state.settings.inboxUrl || "").trim();
  if (syncing) return;
  syncing = true;
  const stamp = msg => { state.settings.lastSync = Date.now(); state.settings.lastSyncMsg = msg; save(); };
  try {
    const r = await fetch(url || "/inbox.json?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const arr = await r.json();
    if (!Array.isArray(arr)) throw new Error(arr && arr.error ? arr.error : "respuesta rara");
    let n = 0;
    arr.forEach(it => {
      if (!it || !it.id || !it.amountCents || state.budget.inboxSeen[it.id]) return;
      const rule = state.budget.rules[merchKey(it.merchant)];
      if (rule) { it.kind = rule.kind; it.targetId = rule.targetId; }
      if (!it.pay && it.card) it.pay = "";
      state.budget.inboxSeen[it.id] = 1; inbox().push(it); n++;
    });
    stamp(n ? `${n} nuevos` : "al día");
    if (n) { if (!sheetOpen()) render(); toast(`${n} ${n === 1 ? "gasto nuevo" : "gastos nuevos"} por clasificar`); }
    else if (manual) { render(); toast("Todo al día, no hay gastos nuevos"); }
    else if (ui.tab === "more") render();
  } catch (e) {
    if (url) { stamp("error: " + e.message); if (manual) { render(); toast("No pude leer el correo. Revisa el link.", { tone: "warn" }); } }
  } finally { syncing = false; }
}
ACTIONS["inbox-sync-now"] = () => syncInbox(true);
