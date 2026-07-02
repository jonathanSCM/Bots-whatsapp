// Replica las fotos ya subidas hacia las propiedades que no tienen ninguna.
// Uso: node scripts/replicar-fotos.js
// Toma todas las fotos de las propiedades que SI tienen fotos cargadas (desde
// el panel admin) y las reparte rotando entre las que estan vacias (2 por
// propiedad). No toca las propiedades que ya tienen fotos propias.

const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const db = new DatabaseSync(path.join(__dirname, "..", "data", "bot.db"));

const propiedades = db.prepare(`SELECT "id", "fotos" FROM propiedades`).all();

const conFotos = [];
const sinFotos = [];
for (const p of propiedades) {
  let fotos = [];
  try {
    fotos = JSON.parse(p.fotos || "[]");
  } catch (e) {
    fotos = [];
  }
  if (fotos.length) conFotos.push({ id: p.id, fotos });
  else sinFotos.push(p.id);
}

const todas = conFotos.flatMap((p) => p.fotos);
if (!todas.length) {
  console.log("Ninguna propiedad tiene fotos todavia. Sube fotos a algunas desde el panel admin y vuelve a correr este script.");
  process.exit(0);
}

console.log(`Fotos encontradas: ${todas.length} (en ${conFotos.length} propiedades). Propiedades sin fotos: ${sinFotos.length}.`);

const actualizar = db.prepare(`UPDATE propiedades SET "fotos" = ? WHERE "id" = ?`);
sinFotos.forEach((id, i) => {
  const a = todas[i % todas.length];
  const b = todas[(i + 1) % todas.length];
  const fotos = a === b ? [a] : [a, b];
  actualizar.run(JSON.stringify(fotos), id);
});

console.log(`Listo: ${sinFotos.length} propiedades ahora tienen fotos replicadas.`);
