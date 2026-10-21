"use strict";
/* ===================== utilidades ===================== */
const STORAGE_KEY = "bitacora-data";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad = n => String(n).padStart(2, "0");
const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mkOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const todayKey = () => fmtDate(new Date());
const parseDay = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MONTHS_S = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DAYS_S = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const DAYS_L = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const USD0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const USD2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = c => USD2.format(Math.round(c) / 100);
const moneyR = c => USD0.format(Math.round(c / 100));
function parseCents(str) {
  if (str === null || str === undefined || str === "") return null;
  const n = parseFloat(String(str).replace(",", "."));
  if (isNaN(n) || n <= 0) return null;
  return Math.round(n * 100);
}
function dayLabel(ds) {
  const t = todayKey();
  if (ds === t) return "Hoy";
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (ds === fmtDate(y)) return "Ayer";
  const d = parseDay(ds);
  return `${DAYS_S[d.getDay()]} ${d.getDate()} ${MONTHS_S[d.getMonth()]}`;
}

/* ===================== catálogo ===================== */
// colores repartidos por la rueda cromática y ordenados para que los vecinos en la grilla no se parezcan
const ENVELOPES = [
  { id: "comida", name: "Comida", short: "Comida", emoji: "🍽️", color: "#FF7A59" },
  { id: "salidas", name: "Salidas y vida social", short: "Salidas", emoji: "🎉", color: "#E17BFF" },
  { id: "transporte", name: "Transporte", short: "Transporte", emoji: "🚇", color: "#5C9DFF" },
  { id: "fijosEc", name: "Fijos de Ecuador", short: "Ecuador", emoji: "🌎", color: "#5BE16B" },
  { id: "lavanderia", name: "Lavandería", short: "Lavandería", emoji: "🧺", color: "#FFC247" },
  { id: "ropa", name: "Ropa e imprevistos", short: "Ropa", emoji: "👕", color: "#8F8BFF" },
  { id: "aseo", name: "Aseo y limpieza", short: "Aseo", emoji: "🧼", color: "#36DDB0" },
  { id: "corte", name: "Corte de pelo", short: "Pelo", emoji: "✂️", color: "#B5E048" },
  { id: "gym", name: "Gym", short: "Gym", emoji: "🏋️", color: "#FF6FB5" },
  { id: "proteina", name: "Proteína", short: "Proteína", emoji: "🥤", color: "#38C8E8" },
];
const ENV = Object.fromEntries(ENVELOPES.map(e => [e.id, e]));
const FIXED = { id: "renta", name: "Renta", short: "Renta", emoji: "🔑", color: "#A8B3C7" };

// montos en centavos
const TEMPLATE_NORMAL = { comida: 40000, salidas: 15000, transporte: 16000, fijosEc: 10000, lavanderia: 5000, ropa: 7500, aseo: 3000, corte: 2500, gym: 2500, proteina: 2500 };
const TEMPLATE_OCT26 = { comida: 18500, salidas: 6500, transporte: 8000, fijosEc: 5000, aseo: 1500, lavanderia: 2500, ropa: 3500, gym: 6500, proteina: 0, corte: 0 };

const FUNDS_DEFAULT = {
  instalacion: { name: "Gastos únicos / instalación", short: "Instalación", emoji: "🏠", color: "#7FB5FF", totalCents: 100000,
    subcats: ["Ropa de invierno", "Térmicas", "Zapatos", "Escritorio", "Mesita y silla", "Plan de celular", "Ropa normal"] },
  hermanos: { name: "Viaje con mis hermanos (junio)", short: "Hermanos", emoji: "✈️", color: "#5CE0C8", totalCents: 200000 },
  regalos: { name: "Regalos y PS5", short: "Regalos", emoji: "🎁", color: "#FF8FB8", totalCents: 100000 },
  thanksgiving: { name: "Thanksgiving", short: "Thanksgiving", emoji: "🦃", color: "#F0A35E", totalCents: 100000 },
};
const OLD_FUND_NAMES = { instalacion: "Gastos unicos / instalacion" };

const CARD = "Tarjeta de crédito";
const PAYMENTS = [
  { id: CARD, short: "Tarjeta", emoji: "💳" },
  { id: "Débito Chase", short: "Débito", emoji: "🏦" },
  { id: "Efectivo", short: "Efectivo", emoji: "💵" },
];
function normPay(p) {
  if (!p) return "";
  const s = String(p).toLowerCase();
  if (s.startsWith("tarjeta")) return CARD;
  if (s.startsWith("deb") || s.startsWith("déb")) return "Débito Chase";
  if (s.startsWith("efec")) return "Efectivo";
  return "";
}

/* ===================== estado ===================== */
function loadRaw() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; } }

function migrate(s) {
  if (!s || typeof s !== "object") s = {};
  // --- hábitos / metas / ejercicio (datos de siempre) ---
  if (!s.habits) s.habits = [{ id: "escritura", name: "Escritura diaria" }, { id: "agradecer", name: "Agradecer antes de dormir" }];
  s.habitLogs = s.habitLogs || {};
  if (s.journalLog && !s.habitLogs.escritura) s.habitLogs.escritura = s.journalLog;
  delete s.journalLog;
  s.habits.forEach(h => { s.habitLogs[h.id] = s.habitLogs[h.id] || {}; });
  s.goals = s.goals || []; s.goalsHistory = s.goalsHistory || {}; s.currentGoalsWeekKey = s.currentGoalsWeekKey || null;
  s.exerciseLog = s.exerciseLog || {};
  Object.values(s.exerciseLog).forEach(entry => {
    if (entry.entries && !entry.exercises && !entry.activity) {
      if ("actividad" in entry.entries) {
        entry.activity = { done: entry.entries.actividad.done, note: entry.entries.actividad.note || "" };
        entry.exercises = [];
      } else {
        entry.exercises = Object.entries(entry.entries).map(([name, v]) => ({ id: uid(), name, target: "", done: v.done, weight: v.weight || "", reps: "" }));
        entry.activity = null;
      }
      delete entry.entries;
    }
    if (!entry.exercises) entry.exercises = [];
    if (entry.activity === undefined) entry.activity = null;
  });

  // --- presupuesto ---
  const b = s.budget = s.budget || {};
  b.months = b.months || {};
  b.funds = b.funds || clone(FUNDS_DEFAULT);
  b.expenses = b.expenses || [];
  b.recurring = b.recurring || [];
  b.transfers = b.transfers || [];
  b.recurringDone = b.recurringDone || {};
  b.inbox = b.inbox || []; b.inboxSeen = b.inboxSeen || {};
  Object.entries(FUNDS_DEFAULT).forEach(([fid, def]) => {
    const f = b.funds[fid] = b.funds[fid] || clone(def);
    if (f.name === OLD_FUND_NAMES[fid]) f.name = def.name;
    if (fid === "instalacion" && f.subcats && f.subcats[1] === "Termicas") f.subcats = def.subcats.slice();
    f.short = f.short || def.short; f.emoji = f.emoji || def.emoji; f.color = f.color || def.color;
  });
  b.expenses.forEach(e => { e.paymentMethod = normPay(e.paymentMethod); if (e.paid === undefined) e.paid = false; });
  if (!b.months["2026-10"]) {
    const envelopes = {};
    ENVELOPES.forEach(e => { envelopes[e.id] = { topeCents: TEMPLATE_OCT26[e.id] }; });
    b.months["2026-10"] = { startDay: 16, endDay: 31, envelopes };
  }
  if (!b.rentaOctSeeded) {
    b.expenses.push({ id: uid(), amountCents: 100000, date: "2026-10-01", kind: "fixed", targetId: "renta", paymentMethod: "", note: "Renta octubre", recurringId: null, paid: false });
    b.rentaOctSeeded = true;
  }
  if (!b.recurring.some(r => r.id === "rec-renta")) {
    b.recurring.push({ id: "rec-renta", name: "Renta", amountCents: 100000, kind: "fixed", targetId: "renta", day: 1, paymentMethod: "", fromMonth: "2026-11", active: true });
  }
  b.recurringDone["rec-renta:2026-10"] = true; // octubre ya está pagado

  s.settings = Object.assign({ theme: "auto", carryOver: false, lastPayment: "" }, s.settings || {});
  s.version = 2;
  return s;
}

let state = migrate(loadRaw());
function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { console.warn("No se pudo guardar", e); } }
save();

function catOf(kind, id) {
  if (kind === "envelope") return ENV[id] || { name: id, short: id, emoji: "•", color: "#999" };
  if (kind === "fund") { const f = state.budget.funds[id]; return f ? { name: f.name, short: f.short || f.name, emoji: f.emoji, color: f.color } : { name: id, short: id, emoji: "•", color: "#999" }; }
  return FIXED;
}

/* ===================== tema ===================== */
function applyTheme() {
  const t = state.settings.theme;
  const dark = t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const m = $('meta[name="theme-color"]'); if (m) m.content = dark ? "#0D0F15" : "#EDF0F6";
}
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { if (state.settings.theme === "auto") applyTheme(); });

/* ===================== infraestructura de UI ===================== */
const ACTIONS = {}, INPUTS = {}, CHANGES = {};
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) fn(el.dataset, el, e);
});
document.addEventListener("input", e => { const k = e.target.dataset && e.target.dataset.in; if (k && INPUTS[k]) INPUTS[k](e.target, e); });
document.addEventListener("change", e => { const k = e.target.dataset && e.target.dataset.ch; if (k && CHANGES[k]) CHANGES[k](e.target, e); });
document.addEventListener("keydown", e => {
  if (e.key === "Enter") { const k = e.target.dataset && e.target.dataset.enter; if (k && ACTIONS[k]) { e.preventDefault(); ACTIONS[k](e.target.dataset, e.target, e); } }
  if (e.key === "Escape") closeSheet();
});

function refresh() { if (typeof render === "function") render(); }

/* --- sheet --- */
function openSheet(html) {
  const root = $("#sheetRoot");
  const was = root.classList.contains("open");
  root.innerHTML = `<div class="scrim" data-act="close-sheet"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  document.body.classList.add("noscroll");
  if (was) return;
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("open")));
}
function closeSheet() {
  const root = $("#sheetRoot");
  if (!root.classList.contains("open")) return;
  root.classList.remove("open");
  document.body.classList.remove("noscroll");
  setTimeout(() => { if (!root.classList.contains("open")) root.innerHTML = ""; }, 300);
}
ACTIONS["close-sheet"] = () => closeSheet();
const sheetOpen = () => $("#sheetRoot").classList.contains("open");

/* --- toast --- */
let toastTimer = null, toastFn = null;
function toast(msg, opt = {}) {
  clearTimeout(toastTimer);
  toastFn = opt.fn || null;
  $("#toastRoot").innerHTML = `<div class="toast ${opt.tone || ""}" role="status"><span>${esc(msg)}</span>${opt.action ? `<button data-act="toast-action">${esc(opt.action)}</button>` : ""}</div>`;
  toastTimer = setTimeout(hideToast, opt.ms || 5000);
}
function hideToast() { $("#toastRoot").innerHTML = ""; toastFn = null; }
ACTIONS["toast-action"] = () => { const f = toastFn; hideToast(); if (f) f(); };

/* --- gráficos: arcos de anillo/dona --- */
function arcsSVG(segs, total, R, cx, cy, gap = .5) {
  let off = 0, out = "";
  segs.forEach(s => {
    if (!(s.v > 0) || !(total > 0)) return;
    const len = s.v / total * 100, d = Math.max(0, len - gap);
    out += `<circle class="seg" cx="${cx}" cy="${cy}" r="${R}" pathLength="100" stroke="${s.color}" stroke-dasharray="${d.toFixed(3)} ${(100 - d).toFixed(3)}" stroke-dashoffset="${(-off).toFixed(3)}"/>`;
    off += len;
  });
  return out;
}

/* --- iconos --- */
const ICON = {
  home: '<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  chart: '<path d="M5 20v-6M12 20V5M19 20V10"/>',
  more: '<path d="M5 12h.01M12 12h.01M19 12h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};
const ico = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;
