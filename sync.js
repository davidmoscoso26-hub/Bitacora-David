"use strict";
/* ===================== nube (Google Drive vía Apps Script) ===================== */
const SYNC_KEY = "bitacora-sync";
let cs = Object.assign({ base: null, dirty: false, at: 0, msg: "", lastSync: 0, lastSyncMsg: "" }, (() => { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch { return {}; } })());
const saveCS = () => { try { localStorage.setItem(SYNC_KEY, JSON.stringify(cs)); } catch (e) {} };
const cloudOn = () => !!(state.settings.inboxUrl || "").trim();
let pushTimer = null, applying = false, pushing = false, ver = 0, pendingRemote = null;

function cloudDirty() {
  if (applying) return;
  ver++; cs.dirty = true; saveCS();
  if (cloudOn()) { clearTimeout(pushTimer); pushTimer = setTimeout(pushState, 1800); }
}
const pristine = s => s.budget.expenses.length <= 1 && !Object.keys(s.budget.inboxSeen || {}).length && !Object.keys(s.exerciseLog || {}).length && !(s.goals || []).length
  && Object.values(s.habitLogs || {}).every(l => !Object.keys(l).length);

async function cloudGet(a) {
  const u = state.settings.inboxUrl.trim();
  const r = await fetch(u + (u.includes("?") ? "&" : "?") + "a=" + a + "&t=" + Date.now(), { cache: "no-store" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json(); if (j.error) throw new Error(j.error); return j;
}
async function cloudPost() {
  const r = await fetch(state.settings.inboxUrl.trim(), { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ baseRev: cs.base || 0, data: state }) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json(); if (j.error) throw new Error(j.error); return j;
}
function adoptRemote(rem) {
  applying = true;
  try {
    state = migrate(rem.data);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
    cs.base = rem.rev; cs.dirty = false; cs.at = rem.at || Date.now(); cs.msg = "datos descargados de la nube"; saveCS();
  } finally { applying = false; }
  applyTheme(); closeSheet(); render();
}
async function pushState() {
  if (!cloudOn() || pushing || !cs.dirty) return;
  pushing = true; const v = ver;
  try {
    const j = await cloudPost();
    if (j.conflict) { askConflict(j.remote); return; }
    cs.base = j.rev; cs.at = j.at || Date.now(); cs.dirty = ver !== v; cs.msg = "guardado en la nube"; saveCS();
    if (cs.dirty) { clearTimeout(pushTimer); pushTimer = setTimeout(pushState, 1800); }
  } catch (e) { cs.msg = "sin conexión: se guardará luego"; saveCS(); }
  finally { pushing = false; if (ui.tab === "more" && !sheetOpen()) render(); }
}
async function syncState() {
  if (!cloudOn()) return;
  const head = await cloudGet("rev"), remRev = head.rev || 0;
  if (remRev === 0) { if (!pristine(state)) { cs.base = 0; cs.dirty = true; await pushState(); } return; }          // nube vacía
  if (cs.base !== null && remRev === cs.base) { if (cs.dirty) await pushState(); else { cs.msg = "al día con la nube"; saveCS(); } return; }
  const rem = await cloudGet("state");
  if (pristine(state) || (cs.base !== null && !cs.dirty)) { adoptRemote(rem); return; }           // lo de la nube es más nuevo
  askConflict(rem);                                                                                   // cambios en ambos lados
}
function statsOf(d) {
  const ex = (d && d.budget && d.budget.expenses) || [];
  const last = ex.filter(e => e.kind !== "fixed").map(e => e.date).sort().pop();
  return `${ex.length} gastos${last ? ` · último ${dayShort(last)}` : ""}`;
}
function askConflict(rem) {
  pendingRemote = rem;
  openSheet(`<div class="sheet-h"><h3>¿Qué datos conservas?</h3></div>
    <p class="hint" style="margin:4px 0 14px">Este dispositivo y la nube tienen datos distintos. Elige cuáles usar; los otros se reemplazan.</p>
    <div class="card" style="margin:0 0 10px"><b>☁️ Nube</b><p class="hint">${statsOf(rem.data)}${rem.at ? " · guardado " + new Date(rem.at).toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</p></div>
    <div class="card" style="margin:0 0 4px"><b>📱 Este dispositivo</b><p class="hint">${statsOf(state)}</p></div>
    <button class="btn" data-act="cloud-use-remote">Usar la nube</button>
    <button class="btn ghost" data-act="cloud-use-local">Usar este dispositivo</button>`);
}
ACTIONS["cloud-use-remote"] = () => {
  if (!pendingRemote) return;
  try { localStorage.setItem("bitacora-backup-local", JSON.stringify(state)); } catch (e) {}   // red de seguridad
  const r = pendingRemote; pendingRemote = null; adoptRemote(r); toast("Datos de la nube cargados");
};
ACTIONS["cloud-use-local"] = async () => {
  if (!pendingRemote) return;
  cs.base = pendingRemote.rev; cs.dirty = true; saveCS(); pendingRemote = null; closeSheet();
  await pushState(); render(); toast("Este dispositivo es ahora la copia principal");
};

/* revisa nube y correo; automático al abrir y al volver a la app */
async function syncAll(manual) {
  if (!manual && sheetOpen()) return;
  if (manual && !cloudOn()) { toast("Primero pega el link del script.", { tone: "warn" }); return; }
  try { await syncState(); } catch (e) { cs.msg = "error: " + e.message; saveCS(); if (manual) { render(); toast("No pude conectar con la nube. Revisa el link.", { tone: "warn" }); } }
  await syncInbox(manual);
}
