/**
 * Bitácora · lector de correos del banco
 * 1) Lee los avisos "Notificación de Consumos" de Banco Pichincha en tu Gmail y se los entrega a la app.
 * 2) Guarda una copia de tus datos en tu Google Drive para que celular y web vean lo mismo.
 */

// 1) Cambia esto por una clave larga inventada por ti (solo letras y números).
const TOKEN = "CAMBIA-ESTA-CLAVE";

const REMITENTE = "servicios@tarjetasbancopichincha.com";
const DIAS = 30;                       // cuántos días hacia atrás revisa
const TARJETAS = { "948": "Tarjeta de crédito" };   // últimos 4 dígitos -> forma de pago en la app

// Sobre sugerido según el comercio. Lo que no coincida llega "sin sobre" y lo eliges tú
// (la app se acuerda de lo que elijas para la próxima vez).
const REGLAS = [
  [/LIDL|H MART|HMART|ALDI|TRADER JOE|SHOPRITE|WHOLE FOODS|STOP & SHOP|PATHMARK|FOOD BAZAAR/i, "envelope", "comida"],
  [/NJTRANSIT|NJ TRANSIT|MTA|OMNY|UBER|LYFT|PATH |NYCT/i, "envelope", "transporte"],
  [/H&M|ZARA|UNIQLO|OLD NAVY|GAP /i, "envelope", "ropa"],
  [/MARSHALLS|TJ MAXX|ROSS |IKEA|HOME DEPOT/i, "fund", "instalacion"],
  [/PLANET FITNESS|GYM|FITNESS/i, "envelope", "gym"],
  [/LAUNDR|LAVANDER/i, "envelope", "lavanderia"],
  [/SMOKE|TOBACCO|CIGAR|VAPE/i, "envelope", "gustos"],
];

const ARCHIVO = "Bitacora-datos.json";          // copia de tus datos en tu Google Drive
const ARCHIVO_ANTERIOR = "Bitacora-datos-anterior.json";   // versión previa, por si algo sale mal

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doGet(e) {
  if (!(e && e.parameter && e.parameter.k === TOKEN)) return json_({ error: "clave incorrecta" });
  const a = e.parameter.a;
  if (a === "rev") { const x = leer_(); return json_({ rev: x.rev || 0, at: x.at || 0 }); }
  if (a === "state") return json_(leer_());
  return json_(gastos_());
}

// Guarda los datos de la app. Si otro dispositivo guardó antes, avisa del conflicto en vez de pisarlo.
function doPost(e) {
  if (!(e && e.parameter && e.parameter.k === TOKEN)) return json_({ error: "clave incorrecta" });
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const body = JSON.parse(e.postData.contents);
    const actual = leer_();
    if ((actual.rev || 0) !== (body.baseRev || 0)) return json_({ conflict: true, remote: actual });
    if (actual.data) archivo_(ARCHIVO_ANTERIOR).setContent(JSON.stringify(actual));
    const nuevo = { rev: (actual.rev || 0) + 1, at: Date.now(), data: body.data };
    archivo_(ARCHIVO).setContent(JSON.stringify(nuevo));
    return json_({ ok: true, rev: nuevo.rev, at: nuevo.at });
  } finally { lock.releaseLock(); }
}

function archivo_(nombre) {
  const it = DriveApp.getFilesByName(nombre);
  return it.hasNext() ? it.next() : DriveApp.createFile(nombre, '{"rev":0}', "application/json");
}
function leer_() {
  try { return JSON.parse(archivo_(ARCHIVO).getBlob().getDataAsString()) || { rev: 0 }; } catch (err) { return { rev: 0 }; }
}
// Ejecútala UNA vez desde el editor para darle permiso de Drive.
function autorizar() { archivo_(ARCHIVO); Logger.log("Listo: permiso de Drive concedido"); }

function gastos_() {
  const cache = CacheService.getScriptCache();
  const hilos = GmailApp.search(`from:${REMITENTE} newer_than:${DIAS}d`, 0, 40);
  const items = [];
  hilos.forEach(h => h.getMessages().forEach(m => {
    const id = m.getId();
    let it = cache.get("m" + id);
    it = it ? JSON.parse(it) : parsear_(m);
    if (!it) return;
    cache.put("m" + id, JSON.stringify(it), 21600);
    items.push(it);
  }));
  items.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return items;
}

function parsear_(m) {
  const t = m.getPlainBody().replace(/[|\s]+/g, " ");
  const v = t.match(/Valor\s*\$?\s*([\d.,]+)/);
  const e = t.match(/Establecimiento\s*(.+?)\s+Tarjeta usada/);
  const c = t.match(/Tarjeta usada\s*(\d+)/);
  if (!v || !e) return null;                       // no es un consumo (otro tipo de aviso)
  const num = v[1].replace(/\./g, "").replace(",", ".");
  const cents = Math.round(parseFloat(num) * 100);
  if (!cents) return null;
  const merchant = e[1].trim();
  const f = m.getDate();
  const regla = REGLAS.find(r => r[0].test(merchant));
  return {
    id: m.getId(),
    amountCents: cents,
    date: Utilities.formatDate(f, "America/New_York", "yyyy-MM-dd"),
    time: Utilities.formatDate(f, "America/New_York", "HH:mm"),
    merchant: merchant,
    note: bonito_(merchant),
    kind: regla ? regla[1] : null,
    targetId: regla ? regla[2] : null,
    pay: (c && TARJETAS[c[1]]) || "",
  };
}

function bonito_(s) {
  return s.replace(/\s*Ñ?\d+$/, "").toLowerCase().replace(/(^|\s)\S/g, x => x.toUpperCase());
}

// Para probar desde el editor: ejecuta esta función y mira el registro.
function probar() { Logger.log(JSON.stringify(gastos_(), null, 1)); }
