const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, "bot.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    idLead TEXT PRIMARY KEY,
    whatsapp TEXT NOT NULL,
    bot TEXT DEFAULT 'inmobiliaria',
    nombre TEXT,
    tipoOperacion TEXT,
    tipoPropiedad TEXT,
    zonaInteres TEXT,
    presupuesto TEXT,
    dormitorios TEXT,
    personas TEXT,
    tipoPedido TEXT,
    zonaDelivery TEXT,
    observaciones TEXT,
    nivelInteres TEXT DEFAULT 'frio',
    fechaVisita TEXT,
    horaVisita TEXT,
    fuente TEXT DEFAULT 'whatsapp',
    estadoLead TEXT DEFAULT 'nuevo',
    estadoConversacion TEXT DEFAULT 'inicio',
    historial TEXT DEFAULT '[]',
    fechaRegistro TEXT,
    fechaActualizacion TEXT
  );
`);

// Migracion best-effort para bases de datos creadas antes de agregar estas columnas.
const columnasNuevas = ["bot TEXT DEFAULT 'inmobiliaria'", "personas TEXT", "tipoPedido TEXT", "zonaDelivery TEXT"];
for (const definicion of columnasNuevas) {
  try {
    db.exec(`ALTER TABLE leads ADD COLUMN ${definicion}`);
  } catch (err) {
    // La columna ya existe, no hay nada que hacer.
  }
}

module.exports = db;
