"use strict";
/* ===================== semana / rachas ===================== */
function mondayOf(date) {
  const d = new Date(date), day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return fmtDate(d);
}
function ensureWeekReset() {
  const wk = mondayOf(new Date());
  if (state.currentGoalsWeekKey !== wk) {
    if (state.currentGoalsWeekKey && state.goals.length) state.goalsHistory[state.currentGoalsWeekKey] = state.goals;
    state.goals = []; state.currentGoalsWeekKey = wk; save();
  }
}
function calcStreak(log) {
  let n = 0; const d = new Date();
  if (!log[todayKey()]) d.setDate(d.getDate() - 1);
  while (log[fmtDate(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function calcBestStreak(log) {
  const dates = Object.keys(log).filter(k => log[k]).sort();
  let best = 0, run = 0, prev = null;
  for (const ds of dates) {
    run = prev && (parseDay(ds) - parseDay(prev)) / 86400000 === 1 ? run + 1 : 1;
    best = Math.max(best, run); prev = ds;
  }
  return best;
}

/* ===================== hábitos y metas ===================== */
function habitCard(h) {
  const log = state.habitLogs[h.id] || (state.habitLogs[h.id] = {});
  const done = !!log[todayKey()], streak = calcStreak(log), best = calcBestStreak(log);
  const note = streak === 0 && best > 0 ? `Racha reiniciada · tu mejor: ${best}` : (best > streak ? `Tu mejor racha: ${best}` : "");
  let strip = "";
  for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); strip += `<i class="${log[fmtDate(d)] ? "on" : ""}"></i>`; }
  return `<div class="habit">
    <div class="habit-h"><b>${esc(h.name)}</b><span style="display:flex;align-items:center;gap:10px"><span class="streak">🔥 ${streak}</span><button class="x" data-act="habit-del" data-id="${h.id}" aria-label="Quitar hábito">✕</button></span></div>
    <button class="big-toggle ${done ? "on" : ""}" data-act="habit-toggle" data-id="${h.id}"><span class="check ${done ? "on" : ""}">✓</span>${done ? "Hecho hoy" : "Marcar como hecho"}</button>
    <div class="strip" aria-label="Últimos 14 días">${strip}</div>${note ? `<p class="hint" style="margin-top:8px">${note}</p>` : ""}</div>`;
}
function viewHabits() {
  const wk = parseDay(state.currentGoalsWeekKey), we = new Date(wk); we.setDate(we.getDate() + 6);
  const fm = d => `${d.getDate()} ${MONTHS_S[d.getMonth()]}`;
  const done = state.goals.filter(g => g.done).length;
  return `
  <div class="page-h"><button class="back" data-act="back" aria-label="Volver">‹</button><h2 class="display">Hábitos y metas</h2></div>
  <section><div class="sec-h"><h2 class="display">Hábitos</h2><span>${state.habits.length} activos</span></div>
    ${state.habits.map(habitCard).join("")}
    <div class="add-line"><input class="inp" id="newHabit" data-enter="habit-add" placeholder="Nuevo hábito, ej: leer 10 minutos" maxlength="40"><button class="btn-s" data-act="habit-add" aria-label="Agregar hábito">＋</button></div></section>
  <section class="sec"><div class="sec-h"><h2 class="display">Metas de la semana</h2><span class="mono">${done}/${state.goals.length}</span></div>
    <div class="card"><p class="hint" style="margin-bottom:12px">Semana del ${fm(wk)} al ${fm(we)} · se reinicia cada lunes</p>
    ${state.goals.length ? state.goals.map(g => `<div class="goal ${g.done ? "done" : ""}"><button class="check ${g.done ? "on" : ""}" data-act="goal-toggle" data-id="${g.id}" aria-label="Marcar meta">✓</button><span>${esc(g.text)}</span><button class="x" data-act="goal-del" data-id="${g.id}" aria-label="Quitar meta">✕</button></div>`).join("") : `<p class="hint">Sin metas todavía. Agrega la primera abajo.</p>`}
    <div class="add-line"><input class="inp" id="newGoal" data-enter="goal-add" placeholder="Ej: escribir carta a mi mamá" maxlength="80"><button class="btn-s" data-act="goal-add" aria-label="Agregar meta">＋</button></div></div></section>`;
}
ACTIONS["habit-toggle"] = d => { const l = state.habitLogs[d.id], k = todayKey(); l[k] = !l[k]; save(); refresh(); };
ACTIONS["habit-add"] = () => {
  const i = $("#newHabit"), name = i.value.trim(); if (!name) return;
  const h = { id: uid(), name }; state.habits.push(h); state.habitLogs[h.id] = {}; save(); refresh();
};
ACTIONS["habit-del"] = d => {
  const idx = state.habits.findIndex(h => h.id === d.id); if (idx < 0) return;
  const [h] = state.habits.splice(idx, 1); save(); refresh();
  toast(`Hábito "${h.name}" quitado`, { action: "Deshacer", fn: () => { state.habits.splice(Math.min(idx, state.habits.length), 0, h); save(); refresh(); } });
};
ACTIONS["goal-add"] = () => { const i = $("#newGoal"), t = i.value.trim(); if (!t) return; state.goals.push({ id: uid(), text: t, done: false }); save(); refresh(); };
ACTIONS["goal-toggle"] = d => { const g = state.goals.find(x => x.id === d.id); g.done = !g.done; save(); refresh(); };
ACTIONS["goal-del"] = d => { state.goals = state.goals.filter(x => x.id !== d.id); save(); refresh(); };

/* ===================== ejercicio ===================== */
const ROUTINE = {
  1: { label: "Push · Pecho, hombro, tríceps", type: "fixed", core: true, exercises: [
    { name: "Press banca", target: "4x8" }, { name: "Press militar", target: "3x10" }, { name: "Press inclinado mancuernas", target: "3x10" },
    { name: "Elevaciones laterales", target: "3x15" }, { name: "Fondos en paralelas", target: "3x12" }] },
  2: { label: "Pull · Espalda, bíceps", type: "fixed", core: true, exercises: [
    { name: "Dominadas", target: "4x8" }, { name: "Remo con barra", target: "3x10" }, { name: "Jalón al pecho", target: "3x12" },
    { name: "Curl bíceps barra Z", target: "3x12" }, { name: "Face pull", target: "3x15" }] },
  3: { label: "Piernas · Cuádriceps, isquios, glúteos", type: "fixed", core: true, exercises: [
    { name: "Sentadilla", target: "4x8" }, { name: "Peso muerto rumano", target: "3x10" }, { name: "Prensa", target: "3x12" },
    { name: "Curl femoral", target: "3x12" }, { name: "Elevación de talones", target: "3x15" }] },
  4: { label: "Piscina o bailoterapia", type: "flexible" },
  5: { label: "Brazos · Bíceps, tríceps, hombro", type: "fixed", core: false, exercises: [
    { name: "Curl de barra", target: "4x10" }, { name: "Curl martillo", target: "3x12" }, { name: "Extensión tríceps polea", target: "3x12" },
    { name: "Fondos en banco", target: "3x15" }, { name: "Elevaciones laterales", target: "3x15" }, { name: "Elevaciones frontales", target: "3x12" }] },
  6: { label: "Rugby o gym", type: "flexible" },
  0: { label: "Fútbol", type: "flexible" },
};
function getDayEntry(dk) {
  if (!state.exerciseLog[dk]) {
    const r = ROUTINE[parseDay(dk).getDay()];
    state.exerciseLog[dk] = {
      exercises: r.type === "fixed" ? r.exercises.map(x => ({ id: uid(), name: x.name, target: x.target, done: false, weight: "", reps: "" })) : [],
      activity: r.type === "flexible" ? { done: false, note: "" } : null,
    };
    save();
  }
  return state.exerciseLog[dk];
}
const dayDone = en => !!en && ((en.exercises || []).some(x => x.done) || (en.activity && en.activity.done));

function exProgressHTML() {
  const series = {};
  Object.keys(state.exerciseLog).sort().forEach(dk => (state.exerciseLog[dk].exercises || []).forEach(ex => {
    const w = parseFloat(ex.weight); if (!isNaN(w) && w > 0) (series[ex.name] = series[ex.name] || []).push(w);
  }));
  const names = Object.keys(series);
  if (!names.length) return `<p class="hint">Todavía no hay pesos registrados.</p>`;
  return names.map(n => {
    const s = series[n], a = s[0], b = s[s.length - 1], dlt = b - a;
    return `<div class="prog-row"><span>${esc(n)}</span><span class="mono ${dlt > 0 ? "up" : dlt < 0 ? "dn" : ""}">${a}kg → ${b}kg ${dlt ? (dlt > 0 ? "▲" : "▼") + Math.abs(dlt) : ""}</span></div>`;
  }).join("");
}
function exMonthHTML() {
  const now = new Date(); let trained = 0, fixT = 0, fixD = 0; const cnt = {};
  for (let d = 1; d <= now.getDate(); d++) {
    const dt = new Date(now.getFullYear(), now.getMonth(), d), en = state.exerciseLog[fmtDate(dt)], r = ROUTINE[dt.getDay()], done = dayDone(en);
    if (r.core) { fixT++; if (done) fixD++; }
    if (done) { trained++; (en.exercises || []).forEach(x => { if (x.done) cnt[x.name] = (cnt[x.name] || 0) + 1; }); }
  }
  return `<div class="grid2"><div class="mini"><b class="mono" style="color:var(--high)">${trained}/${now.getDate()}</b><span>días activos</span></div><div class="mini"><b class="mono" style="color:var(--ok)">${fixD}/${fixT}</b><span>días fijos cumplidos</span></div></div>
    ${Object.keys(cnt).length ? `<div class="chips" style="margin-top:12px">${Object.entries(cnt).map(([n, c]) => `<span class="badge">${esc(n)} ×${c}</span>`).join("")}</div>` : ""}`;
}
function viewExercise() {
  const now = new Date(), r = ROUTINE[now.getDay()], en = getDayEntry(todayKey());
  const ws = parseDay(mondayOf(now)); let fixD = 0, act = 0;
  for (let i = 0; i < 7; i++) { const d = new Date(ws); d.setDate(d.getDate() + i); const e = state.exerciseLog[fmtDate(d)]; if (dayDone(e)) { act++; if (ROUTINE[d.getDay()].core) fixD++; } }
  let body;
  if (r.type === "fixed") {
    body = en.exercises.map(x => `<div class="ex">
      <div class="ex-l1"><button class="check ${x.done ? "on" : ""}" data-act="ex-toggle" data-id="${x.id}" aria-label="Marcar ejercicio">✓</button>
        <input class="inp" data-in="ex" data-f="name" data-id="${x.id}" value="${esc(x.name)}" aria-label="Nombre del ejercicio"><button class="x" data-act="ex-del" data-id="${x.id}" aria-label="Quitar ejercicio">✕</button></div>
      <div class="ex-l2"><input class="inp mono" data-in="ex" data-f="target" data-id="${x.id}" value="${esc(x.target || "")}" placeholder="series×reps" aria-label="Series por repeticiones">
        <input class="inp mono" data-in="ex" data-f="reps" data-id="${x.id}" value="${esc(x.reps || "")}" placeholder="reps reales" aria-label="Repeticiones reales">
        <input class="inp mono kg" inputmode="decimal" data-in="ex" data-ch="ex-ch" data-f="weight" data-id="${x.id}" value="${esc(x.weight || "")}" placeholder="kg" aria-label="Peso en kilos"></div></div>`).join("")
      + `<button class="dash" data-act="ex-add">＋ Agregar ejercicio</button>`;
  } else {
    const a = en.activity || (en.activity = { done: false, note: "" });
    body = `<button class="big-toggle ${a.done ? "on" : ""}" data-act="act-toggle"><span class="check ${a.done ? "on" : ""}">✓</span>${a.done ? "Hecho hoy" : "Marcar como hecho"}</button>
      <input class="inp" style="margin-top:10px" data-in="act-note" placeholder="Ej: piscina 30 min" value="${esc(a.note || "")}" aria-label="Nota de la actividad">`;
  }
  return `
  <div class="page-h"><button class="back" data-act="back" aria-label="Volver">‹</button><h2 class="display">Ejercicio</h2></div>
  <section class="card"><div style="display:flex;justify-content:space-between;align-items:center"><span class="badge ${r.core ? "core" : ""}">${r.type === "fixed" ? (r.core ? "Día fijo" : "Día de gym") : "Día flexible"}</span><span class="hint mono">fijos ${fixD}/3 · semana ${act}/7</span></div>
    <h3 class="display" style="font-size:20px;margin:12px 0 4px">${esc(r.label)}</h3><p class="hint" style="margin-bottom:12px">Edita nombre, series y repeticiones, o agrega y quita ejercicios de hoy.</p>${body}</section>
  <section class="card"><h3 class="display">Resumen del mes</h3><div id="exMonth">${exMonthHTML()}</div></section>
  <section class="card"><h3 class="display">Progreso de pesos</h3><p class="hint" style="margin-bottom:10px">Primer registro → último registro</p><div id="exProg">${exProgressHTML()}</div></section>`;
}
const exById = id => getDayEntry(todayKey()).exercises.find(x => x.id === id);
INPUTS.ex = t => { const x = exById(t.dataset.id); if (x) { x[t.dataset.f] = t.value; save(); } };
CHANGES["ex-ch"] = () => { const a = $("#exProg"), b = $("#exMonth"); if (a) a.innerHTML = exProgressHTML(); if (b) b.innerHTML = exMonthHTML(); };
INPUTS["act-note"] = t => { getDayEntry(todayKey()).activity.note = t.value; save(); };
ACTIONS["ex-toggle"] = d => { const x = exById(d.id); x.done = !x.done; save(); refresh(); };
ACTIONS["ex-add"] = () => { getDayEntry(todayKey()).exercises.push({ id: uid(), name: "Nuevo ejercicio", target: "", done: false, weight: "", reps: "" }); save(); refresh(); };
ACTIONS["ex-del"] = d => {
  const en = getDayEntry(todayKey()), i = en.exercises.findIndex(x => x.id === d.id); if (i < 0) return;
  const [x] = en.exercises.splice(i, 1); save(); refresh();
  toast(`"${x.name}" quitado de hoy`, { action: "Deshacer", fn: () => { en.exercises.splice(Math.min(i, en.exercises.length), 0, x); save(); refresh(); } });
};
ACTIONS["act-toggle"] = () => { const a = getDayEntry(todayKey()).activity; a.done = !a.done; save(); refresh(); };
