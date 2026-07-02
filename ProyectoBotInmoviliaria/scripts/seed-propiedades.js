// Carga propiedades de prueba en la base de datos (SQLite).
// Uso: node scripts/seed-propiedades.js
// Es idempotente: solo inserta las propiedades que no existan todavia (por id).
// Si hay fotos en data/uploads, las reparte entre las propiedades usando
// PUBLIC_URL como base (ej: PUBLIC_URL=https://midominio.com).

const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = path.join(__dirname, "..", "data");
const db = new DatabaseSync(path.join(DATA_DIR, "bot.db"));

const ZONAS = ["Zona Norte", "Zona Sur", "Centro", "Equipetrol", "Av. Banzer", "Cuarto Anillo", "Urubo", "Las Palmas"];
const TIPOS = ["Casa", "Departamento", "Terreno", "Local comercial", "Oficina", "Duplex"];
const OPERACIONES = ["venta", "alquiler"];

const DESCRIPCIONES = [
  "Luminoso, con excelente ubicacion y cerca de zonas comerciales.",
  "Recien refaccionado, listo para entrar a vivir.",
  "Amplio, con areas verdes y estacionamiento propio.",
  "Cocina equipada, dos baños completos y deposito.",
  "Ideal para familia, zona tranquila y segura.",
  "Excelente oportunidad de inversion, alta plusvalia.",
  "Con balcon, areas sociales y seguridad 24hs.",
  "A pasos de supermercados, colegios y transporte.",
];

function precioPara(tipo, operacion) {
  const bases = { Casa: 180000, Departamento: 110000, Terreno: 75000, "Local comercial": 95000, Oficina: 85000, Duplex: 150000 };
  const base = bases[tipo] || 100000;
  const variacion = 0.7 + Math.random() * 0.8; // ±40%
  if (operacion === "alquiler") {
    const mensual = Math.round((base * variacion) / 200 / 10) * 10;
    return `USD ${mensual.toLocaleString("en-US")}/mes`;
  }
  const monto = Math.round((base * variacion) / 500) * 500;
  return `USD ${monto.toLocaleString("en-US")}`;
}

function dormitoriosPara(tipo) {
  if (tipo === "Terreno" || tipo === "Local comercial" || tipo === "Oficina") return null;
  return String(1 + Math.floor(Math.random() * 5)); // 1 a 5
}

// Fotos disponibles en data/uploads (subidas desde el panel admin)
const PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
let fotosDisponibles = [];
const uploadsDir = path.join(DATA_DIR, "uploads");
if (PUBLIC_URL && fs.existsSync(uploadsDir)) {
  fotosDisponibles = fs
    .readdirSync(uploadsDir)
    .filter((f) => /\.(jpe?g|png)$/i.test(f) && fs.statSync(path.join(uploadsDir, f)).size > 1000)
    .map((f) => `${PUBLIC_URL}/admin/uploads/${f}`);
}

function fotosPara(indice) {
  if (!fotosDisponibles.length) return [];
  // Reparte 2 fotos por propiedad, rotando sobre las disponibles
  const a = fotosDisponibles[indice % fotosDisponibles.length];
  const b = fotosDisponibles[(indice + 1) % fotosDisponibles.length];
  return a === b ? [a] : [a, b];
}

const existe = db.prepare(`SELECT "id" FROM propiedades WHERE "id" = ?`);
const insertar = db.prepare(
  `INSERT INTO propiedades ("id","tipo","operacion","zona","precio","dormitorios","descripcion","estado","fotos","fechaCreacion","fechaActualizacion")
   VALUES (?,?,?,?,?,?,?,'disponible',?,?,?)`
);

const ahora = new Date().toISOString().slice(0, 19).replace("T", " ");
let creadas = 0;

for (let i = 1; i <= 104; i++) {
  const id = `P${String(i).padStart(3, "0")}`;
  if (existe.get(id)) continue;

  const zona = ZONAS[i % ZONAS.length];
  const tipo = TIPOS[i % TIPOS.length];
  const operacion = OPERACIONES[i % OPERACIONES.length];
  const dormitorios = dormitoriosPara(tipo);
  const descripcion = `${tipo} en ${zona}. ${DESCRIPCIONES[i % DESCRIPCIONES.length]}`;

  insertar.run(id, tipo, operacion, zona, precioPara(tipo, operacion), dormitorios, descripcion, JSON.stringify(fotosPara(i)), ahora, ahora);
  creadas++;
}

const total = db.prepare(`SELECT COUNT(*) n FROM propiedades`).get().n;
console.log(`Propiedades creadas: ${creadas}. Total en la base: ${total}.`);
if (!PUBLIC_URL) console.log("Nota: sin PUBLIC_URL definida las propiedades quedan sin fotos (puedes subirlas desde el panel admin).");
