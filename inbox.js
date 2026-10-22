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
      <button class="x" data-act="split-inbox" data-id="${esc(it.id)}" aria-label="Dividir" title="Dividir en varios sobres">✂</button>
      <button class="btn-s" data-act="accept-inbox" data-id="${esc(it.id)}" aria-label="Aceptar" ${it.kind ? "" : "disabled style=\"opacity:.35\""}>✓</button>
      <button class="x" data-act="dismiss-inbox" data-id="${esc(it.id)}" aria-label="Descartar">✕</button></div>`;
  }).join("");
  return `<div class="sheet-h"><h3>Por clasificar</h3><button class="x" data-act="close-sheet" aria-label="Cerrar">✕</button></div>
    <p class="hint" style="margin:4px 0 12px">Toca ✓ si el sobre sugerido está bien, la fila para cambiarlo, ✂ si el cobro fue de varias cosas, o ✕ para descartar. La app recuerda tus elecciones.</p>
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
  if (!url || syncing) return;
  syncing = true;
  const stamp = msg => { cs.lastSync = Date.now(); cs.lastSyncMsg = msg; saveCS(); };
  try {
    const r = await fetch(url || "/inbox.json?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const arr = await r.json();
    if (!Array.isArray(arr)) throw new Error(arr && arr.error ? arr.error : "respuesta rara");
    let n = 0;
    arr.forEach(it => {
      if (!it || !it.id || !it.amountCents || state.budget.inboxSeen[it.id]) return;
      if (it.date < "2026-10-16") { state.budget.inboxSeen[it.id] = 1; return; }   // antes de que empezara el presupuesto
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
ACTIONS["inbox-sync-now"] = () => syncAll(true);

/* ===================== dividir un cobro ===================== */
let split = null;
const catKey = (kind, id) => kind + ":" + id;
function splitOptions(sel) {
  const o = (k, c) => `<option value="${k}" ${sel === k ? "selected" : ""}>${c.emoji} ${esc(c.short)}</option>`;
  return `<option value="" ${sel ? "" : "selected"} disabled>Elegir sobre…</option>
    <optgroup label="Sobres del mes">${ENVELOPES.map(e => o(catKey("envelope", e.id), e)).join("")}</optgroup>
    <optgroup label="Fondos del viaje">${Object.entries(state.budget.funds).map(([id, f]) => o(catKey("fund", id), { emoji: f.emoji, short: f.short })).join("")}</optgroup>`;
}
function splitCalc() {
  const last = split.parts.length - 1;
  const used = split.parts.slice(0, last).reduce((s, p) => s + (parseCents(p.str) || 0), 0);
  split.rest = split.total - used;
  const ok = split.rest > 0 && split.parts.every((p, i) => (i === last ? true : parseCents(p.str) > 0) && p.key);
  return ok;
}
function paintSplit() {
  const ok = splitCalc(), last = split.parts.length - 1;
  openSheet(`<div class="sheet-h"><h3>Dividir ${money(split.total)}</h3><button class="x" data-act="close-sheet" aria-label="Cerrar">✕</button></div>
    <p class="hint" style="margin:4px 0 12px">${esc(split.label)}. Reparte el cobro; la última parte se calcula sola.</p>
    ${split.parts.map((p, i) => `<div class="row" style="margin-bottom:8px;gap:8px">
      ${i === last ? `<span class="row-r" id="splitRest" style="min-width:84px;text-align:left;color:${split.rest > 0 ? "" : "var(--over)"}">${money(Math.max(split.rest, 0))}</span>`
        : `<input class="inp" style="width:92px;padding:10px" inputmode="decimal" placeholder="0.00" data-in="split-amt" data-i="${i}" value="${esc(p.str)}" aria-label="Monto">`}
      <select class="inp" style="flex:1;min-width:0;padding:10px" data-ch="split-cat" data-i="${i}">${splitOptions(p.key)}</select>
      ${last > 1 && i > 0 ? `<button class="x" data-act="split-del" data-i="${i}" aria-label="Quitar">✕</button>` : ""}</div>`).join("")}
    <button class="btn ghost" data-act="split-add">＋ Otra parte</button>
    <button class="btn" id="splitSave" data-act="split-save" ${ok ? "" : "disabled"}>${ok ? "Guardar " + split.parts.length + " gastos" : split.rest <= 0 ? "Las partes superan el total" : "Completa monto y sobre"}</button>`);
}
ACTIONS["split-inbox"] = d => {
  const it = inbox().find(x => x.id === d.id); if (!it) return;
  split = { id: it.id, total: it.amountCents, label: `${it.note || it.merchant} · ${dayShort(it.date)}`, parts: [{ str: "", key: it.kind ? catKey(it.kind, it.targetId) : "" }, { str: "", key: "" }] };
  paintSplit();
};
INPUTS["split-amt"] = t => {
  split.parts[+t.dataset.i].str = t.value;
  const ok = splitCalc(), r = $("#splitRest"), b = $("#splitSave");
  if (r) { r.textContent = money(Math.max(split.rest, 0)); r.style.color = split.rest > 0 ? "" : "var(--over)"; }
  if (b) { b.disabled = !ok; b.textContent = ok ? `Guardar ${split.parts.length} gastos` : split.rest <= 0 ? "Las partes superan el total" : "Completa monto y sobre"; }
};
CHANGES["split-cat"] = t => { split.parts[+t.dataset.i].key = t.value; paintSplit(); };
ACTIONS["split-add"] = () => { split.parts.splice(split.parts.length - 1, 0, { str: "", key: "" }); paintSplit(); };
ACTIONS["split-del"] = d => { split.parts.splice(+d.i, 1); paintSplit(); };
/* dividir un gasto que ya guardaste (desde Editar gasto) */
ACTIONS["split-expense"] = d => {
  const e = exps().find(x => x.id === d.id); if (!e) return;
  split = { src: "expense", id: e.id, total: e.amountCents, label: `${e.note || catOf(e.kind, e.targetId).short} · ${dayShort(e.date)}`, parts: [{ str: "", key: catKey(e.kind, e.targetId) }, { str: "", key: "" }] };
  paintSplit();
};
ACTIONS["split-save"] = () => {
  if (!split || !splitCalc()) return;
  const fromExp = split.src === "expense";
  const it = fromExp ? exps().find(x => x.id === split.id) : inbox().find(x => x.id === split.id);
  if (!it) return;
  const base = fromExp ? (it.note || catOf(it.kind, it.targetId).short) : (it.note || it.merchant);
  const made = split.parts.map((p, i) => {
    const cents = i === split.parts.length - 1 ? split.rest : parseCents(p.str);
    const [kind, targetId] = p.key.split(":");
    const e = { id: uid(), amountCents: cents, date: it.date, kind, targetId, paymentMethod: (fromExp ? it.paymentMethod : it.pay) || "", note: `${base.replace(/ · [^·]+$/, "")} · ${catOf(kind, targetId).short}`, recurringId: null, paid: fromExp ? !!it.paid : false };
    if (!fromExp) e.fromInbox = it.id;
    return e;
  });
  const at = fromExp ? exps().findIndex(x => x.id === it.id) : -1;
  if (fromExp) exps().splice(at, 1, ...made); else { made.forEach(e => exps().push(e)); state.budget.inbox = inbox().filter(x => x.id !== it.id); }
  save(); split = null;
  if (fromExp) { closeSheet(); refresh(); } else repaintInbox();
  toast(`Dividido en ${made.length} gastos`, { action: "Deshacer", fn: () => {
    const ids = new Set(made.map(e => e.id)); state.budget.expenses = exps().filter(x => !ids.has(x.id));
    if (fromExp) exps().splice(Math.min(at, exps().length), 0, it); else inbox().push(it);
    save(); refresh(); } });
};
