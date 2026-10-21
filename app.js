"use strict";
/* ===================== navegación ===================== */
const ui = { tab: "home", sub: null };

const TABS = [
  { id: "home", label: "Gastos", icon: "home" },
  { id: "history", label: "Historial", icon: "list" },
  { id: "plus" },
  { id: "summary", label: "Resumen", icon: "chart" },
  { id: "more", label: "Más", icon: "more" },
];
function paintTabbar() {
  $("#tabbar").innerHTML = `<div class="tabbar-in">${TABS.map(t => t.id === "plus"
    ? `<button class="fab" data-act="open-add" aria-label="Nuevo gasto">${ico("plus")}</button>`
    : `<button class="tab" data-act="go" data-tab="${t.id}" ${ui.tab === t.id ? 'aria-current="page"' : ""}>${ico(t.icon)}<span>${t.label}</span></button>`).join("")}</div>`;
}
ACTIONS.go = d => { ui.tab = d.tab; ui.sub = null; render(); window.scrollTo(0, 0); };
ACTIONS.back = () => { ui.sub = null; render(); window.scrollTo(0, 0); };
ACTIONS["go-sub"] = d => { ui.sub = d.sub; render(); window.scrollTo(0, 0); };

function render() {
  let html;
  if (ui.tab === "home") html = viewHome();
  else if (ui.tab === "history") html = viewHistory();
  else if (ui.tab === "summary") html = viewSummary();
  else if (ui.sub === "habits") html = viewHabits();
  else if (ui.sub === "exercise") html = viewExercise();
  else if (ui.sub === "recurring") html = viewRecurring();
  else html = viewMore();
  const y = window.scrollY;
  $("#screen").innerHTML = html;
  window.scrollTo(0, y);
  paintTabbar();
}

/* ===================== MÁS ===================== */
function viewMore() {
  const doneHabits = state.habits.filter(h => state.habitLogs[h.id][todayKey()]).length;
  const rec = state.budget.recurring.filter(r => r.active).length;
  const th = state.settings.theme;
  return `
  <header class="top"><p class="eyebrow">Tu espacio</p><h1 class="h1 display">Más</h1></header>
  <button class="menu" data-act="go-sub" data-sub="habits"><span class="ico">✍️</span><div><b>Hábitos y metas</b><span>${doneHabits}/${state.habits.length} hábitos hechos hoy</span></div><span class="chev">›</span></button>
  <button class="menu" data-act="go-sub" data-sub="exercise"><span class="ico" style="--c:#FF7A59">🏋️</span><div><b>Ejercicio</b><span>${esc(ROUTINE[new Date().getDay()].label)}</span></div><span class="chev">›</span></button>
  <button class="menu" data-act="go-sub" data-sub="recurring"><span class="ico" style="--c:#5BE16B">↻</span><div><b>Gastos recurrentes</b><span>${rec} ${rec === 1 ? "activo" : "activos"} · se agregan solos cada mes</span></div><span class="chev">›</span></button>

  <section class="sec"><div class="sec-h"><h2 class="display">Ajustes</h2></div>
  <div class="card">
    <p class="lbl" style="margin-top:0">Apariencia</p>
    <div class="segs">${[["auto", "Automático"], ["dark", "Oscuro"], ["light", "Claro"]].map(([v, l]) => `<button class="seg-b" data-act="set-theme" data-v="${v}" aria-pressed="${th === v}">${l}</button>`).join("")}</div>
    <div class="divider"></div>
    <div class="switch-row"><div><b>Acumular lo que sobra</b><span>El sobrante de cada sobre pasa al mes siguiente</span></div>
      <button class="sw" data-act="toggle-carry" aria-pressed="${state.settings.carryOver}" aria-label="Acumular sobrante"></button></div>
  </div>
  <div class="card"><h3 class="display">Respaldo de tus datos</h3>
    <p class="hint" style="margin-bottom:12px">Tus datos viven en este teléfono. Guarda un respaldo de vez en cuando, sobre todo antes de cambiar de celular o borrar datos del navegador.</p>
    <div class="btn-row"><button class="btn ghost" style="margin:0" data-act="backup-export">⬇ Descargar</button><button class="btn ghost" style="margin:0" data-act="backup-copy">⧉ Copiar</button></div>
    <button class="btn ghost" style="margin-top:10px" data-act="backup-import">⬆ Restaurar desde archivo</button>
    <input type="file" id="importFile" accept="application/json,.json" class="hide" data-ch="import-file"></div></section>`;
}
ACTIONS["set-theme"] = d => { state.settings.theme = d.v; save(); applyTheme(); refresh(); };
ACTIONS["toggle-carry"] = () => { state.settings.carryOver = !state.settings.carryOver; save(); refresh(); };

/* --- respaldo --- */
ACTIONS["backup-export"] = () => { download(`bitacora-respaldo-${todayKey()}.json`, JSON.stringify(state, null, 1), "application/json"); toast("Respaldo descargado"); };
ACTIONS["backup-copy"] = async () => {
  try { await navigator.clipboard.writeText(JSON.stringify(state)); toast("Respaldo copiado al portapapeles"); }
  catch { toast("No se pudo copiar. Usa Descargar.", { tone: "warn" }); }
};
ACTIONS["backup-import"] = () => $("#importFile").click();
CHANGES["import-file"] = async t => {
  const f = t.files && t.files[0]; if (!f) return;
  try {
    const obj = JSON.parse(await f.text());
    if (!obj || typeof obj !== "object" || (!obj.budget && !obj.habits)) throw new Error("formato");
    const n = (obj.budget && obj.budget.expenses ? obj.budget.expenses.length : 0);
    window.__pendingImport = obj;
    openSheet(`<div class="sheet-h"><h3>¿Restaurar respaldo?</h3><button class="x" data-act="close-sheet" aria-label="Cerrar">✕</button></div>
      <p class="hint" style="margin-top:8px">El archivo tiene ${n} gastos. Esto reemplaza todo lo que tienes ahora en este teléfono.</p>
      <button class="btn" data-act="backup-confirm">Sí, restaurar</button><button class="btn ghost" data-act="close-sheet">Cancelar</button>`);
  } catch { toast("Ese archivo no parece un respaldo de Bitácora.", { tone: "warn" }); }
  t.value = "";
};
ACTIONS["backup-confirm"] = () => { state = migrate(window.__pendingImport); window.__pendingImport = null; save(); applyTheme(); closeSheet(); ensureWeekReset(); render(); toast("Datos restaurados"); };

/* --- recurrentes --- */
function viewRecurring() {
  const rows = state.budget.recurring.map(r => {
    const c = catOf(r.kind, r.targetId);
    return `<div class="row" style="--c:${c.color};${r.active ? "" : "opacity:.55"}"><button class="row-b" style="display:flex;align-items:center;gap:12px" data-act="edit-recurring" data-id="${r.id}">
      <span class="ico">${c.emoji}</span><span class="row-b"><b>${esc(r.name)}</b><span>Día ${r.day} de cada mes · ${esc(c.short)}</span></span></button>
      <span class="row-r">${money(r.amountCents)}</span><button class="sw" data-act="r-toggle" data-id="${r.id}" aria-pressed="${r.active}" aria-label="Activar o pausar"></button></div>`;
  }).join("");
  return `
  <div class="page-h"><button class="back" data-act="back" aria-label="Volver">‹</button><h2 class="display">Recurrentes</h2></div>
  <p class="hint" style="margin-bottom:14px">Gastos que se repiten cada mes (renta, gym, Ecuador). Se agregan solos el día que elijas, y puedes editarlos como cualquier gasto.</p>
  <div class="list">${rows || `<div class="empty"><b>↻</b>Todavía no tienes recurrentes.</div>`}</div>
  <button class="btn" data-act="new-recurring">＋ Nuevo recurrente</button>`;
}

/* ===================== arranque ===================== */
function boot() {
  applyTheme();
  ensureWeekReset();
  const added = runRecurring();
  render();
  if (added.length) toast(`Se agregó automáticamente: ${added.join(", ")}`);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const a = runRecurring(); ensureWeekReset();
    if (!sheetOpen()) render();
    if (a.length) toast(`Se agregó automáticamente: ${a.join(", ")}`);
  });
}
boot();
