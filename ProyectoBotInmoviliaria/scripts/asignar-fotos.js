// Asigna fotos reales (assets/seed-fotos, incluidas en el repo) a TODAS las
// propiedades: copia los archivos a data/uploads y guarda 2-3 URLs por
// propiedad segun su tipo (casa recibe fotos de casas, departamento de
// interiores, etc.).
//
// Uso: PUBLIC_URL=https://tu-dominio.com node scripts/asignar-fotos.js

const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
if (!PUBLIC_URL) {
  console.error("Falta PUBLIC_URL. Uso: PUBLIC_URL=https://tu-dominio.com node scripts/asignar-fotos.js");
  process.exit(1);
}

const RAIZ = path.join(__dirname, "..");
const ORIGEN = path.join(RAIZ, "assets", "seed-fotos");
const UPLOADS = path.join(RAIZ, "data", "uploads");
if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });

// Copiar las fotos del repo al directorio publico de uploads
const archivos = fs.readdirSync(ORIGEN).filter((f) => f.endsWith(".jpg"));
for (const f of archivos) {
  const destino = path.join(UPLOADS, f);
  if (!fs.existsSync(destino)) fs.copyFileSync(path.join(ORIGEN, f), destino);
}
console.log(`Fotos copiadas a data/uploads: ${archivos.length}`);

const urlDe = (f) => `${PUBLIC_URL}/admin/uploads/${f}`;
const porPrefijo = (prefijo) => archivos.filter((f) => f.startsWith(prefijo)).map(urlDe);

const GRUPOS = {
  casa: porPrefijo("casa"),
  duplex: porPrefijo("casa"),
  departamento: porPrefijo("depa"),
  oficina: porPrefijo("oficina"),
  terreno: porPrefijo("terreno"),
  "local comercial": porPrefijo("local"),
  local: porPrefijo("local"),
};

const db = new DatabaseSync(path.join(RAIZ, "data", "bot.db"));
const propiedades = db.prepare(`SELECT "id", "tipo" FROM propiedades ORDER BY "id"`).all();
const actualizar = db.prepare(`UPDATE propiedades SET "fotos" = ? WHERE "id" = ?`);

// Contador por grupo para rotar las fotos y que no todas las casas tengan
// exactamente las mismas imagenes en el mismo orden.
const offset = {};
let actualizadas = 0;

for (const p of propiedades) {
  const clave = (p.tipo || "").toLowerCase().trim();
  const grupo = GRUPOS[clave] || archivos.map(urlDe);
  if (!grupo.length) continue;

  const i = offset[clave] || 0;
  offset[clave] = i + 1;

  const cantidad = grupo.length >= 3 ? 3 : grupo.length; // 3 fotos si el grupo alcanza, si no las que haya
  const fotos = [];
  for (let k = 0; k < cantidad; k++) fotos.push(grupo[(i + k) % grupo.length]);

  actualizar.run(JSON.stringify(fotos), p.id);
  actualizadas++;
}

console.log(`Propiedades con fotos asignadas: ${actualizadas} de ${propiedades.length}.`);
