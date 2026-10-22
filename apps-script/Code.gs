/**
 * Bitácora · lector de correos del banco
 * Lee los avisos "Notificación de Consumos" de Banco Pichincha en tu Gmail y se los
 * entrega a la app como JSON. No guarda nada: cada vez que la app lo pide, revisa el correo.
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

function doGet(e) {
  const ok = e && e.parameter && e.parameter.k === TOKEN;
  const out = ok ? gastos_() : { error: "clave incorrecta" };
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

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
