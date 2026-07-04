const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, "bot.db"));

// Shim de compatibilidad: los stores escriben sus queries en estilo Postgres
// (placeholders $1, $2, ... y resultado { rows }). Aqui se traducen a SQLite
// (placeholders ? posicionales) para no tener que tocar ningun store.
function traducir(text, params = []) {
  const orden = [];
  const sql = text.replace(/\$(\d+)/g, (_, n) => {
    orden.push(params[Number(n) - 1]);
    return "?";
  });
  // SQLite no acepta undefined como parametro; se normaliza a null.
  return { sql, args: orden.map((v) => (v === undefined ? null : v)) };
}

async function query(text, params = []) {
  const { sql, args } = traducir(text, params);
  const stmt = db.prepare(sql);
  if (/^\s*(SELECT|WITH)/i.test(sql) || /RETURNING/i.test(sql)) {
    return { rows: stmt.all(...args) };
  }
  stmt.run(...args);
  return { rows: [] };
}

const DEFAULTS_HORARIO = [
  [0, 0, "09:00", "18:00"], // domingo
  [1, 1, "09:00", "18:00"],
  [2, 1, "09:00", "18:00"],
  [3, 1, "09:00", "18:00"],
  [4, 1, "09:00", "18:00"],
  [5, 1, "09:00", "18:00"],
  [6, 1, "09:00", "13:00"], // sabado
];

const DEFAULTS_CATEGORIAS = ["Casa", "Departamento", "Terreno", "Local comercial", "Oficina", "Duplex"];

let inicializada = false;

async function init() {
  if (inicializada) return;
  inicializada = true;

  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      "idLead" TEXT PRIMARY KEY,
      "whatsapp" TEXT NOT NULL,
      "bot" TEXT DEFAULT 'inmobiliaria',
      "nombre" TEXT,
      "tipoOperacion" TEXT,
      "tipoPropiedad" TEXT,
      "zonaInteres" TEXT,
      "presupuesto" TEXT,
      "dormitorios" TEXT,
      "personas" TEXT,
      "tipoPedido" TEXT,
      "zonaDelivery" TEXT,
      "observaciones" TEXT,
      "datosBot" TEXT DEFAULT '{}',
      "nivelInteres" TEXT DEFAULT 'frio',
      "fechaVisita" TEXT,
      "horaVisita" TEXT,
      "fuente" TEXT DEFAULT 'whatsapp',
      "estadoLead" TEXT DEFAULT 'nuevo',
      "estadoConversacion" TEXT DEFAULT 'inicio',
      "historial" TEXT DEFAULT '[]',
      "fechaRegistro" TEXT,
      "fechaActualizacion" TEXT
    );

    CREATE TABLE IF NOT EXISTS propiedades (
      "id" TEXT PRIMARY KEY,
      "tipo" TEXT,
      "operacion" TEXT,
      "zona" TEXT,
      "precio" TEXT,
      "dormitorios" TEXT,
      "descripcion" TEXT,
      "estado" TEXT DEFAULT 'disponible',
      "fotos" TEXT DEFAULT '[]',
      "caracteristicas" TEXT DEFAULT '[]',
      "ubicacionMaps" TEXT,
      "lat" REAL,
      "lng" REAL,
      "fechaCreacion" TEXT,
      "fechaActualizacion" TEXT
    );

    CREATE TABLE IF NOT EXISTS citas (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "idLead" TEXT,
      "nombre" TEXT,
      "whatsapp" TEXT,
      "propiedadId" TEXT,
      "fecha" TEXT NOT NULL,
      "hora" TEXT NOT NULL,
      "estado" TEXT DEFAULT 'confirmada',
      "recordatorioEnviado" INTEGER DEFAULT 0,
      "googleEventId" TEXT,
      "fechaCreacion" TEXT
    );

    CREATE TABLE IF NOT EXISTS disponibilidad (
      "diaSemana" INTEGER PRIMARY KEY,
      "activo" INTEGER DEFAULT 1,
      "horaInicio" TEXT DEFAULT '09:00',
      "horaFin" TEXT DEFAULT '18:00'
    );

    CREATE TABLE IF NOT EXISTS categorias (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "nombre" TEXT NOT NULL UNIQUE,
      "fechaCreacion" TEXT
    );

    CREATE TABLE IF NOT EXISTS geocache (
      "consulta" TEXT PRIMARY KEY,
      "lat" REAL,
      "lng" REAL,
      "encontrado" INTEGER DEFAULT 0,
      "fecha" TEXT
    );
  `);

  // Migracion best-effort para bases creadas antes de agregar estas columnas.
  const columnasNuevas = [
    `"bot" TEXT DEFAULT 'inmobiliaria'`,
    `"personas" TEXT`,
    `"tipoPedido" TEXT`,
    `"zonaDelivery" TEXT`,
    `"datosBot" TEXT DEFAULT '{}'`,
  ];
  for (const definicion of columnasNuevas) {
    try {
      db.exec(`ALTER TABLE leads ADD COLUMN ${definicion}`);
    } catch (err) {
      // La columna ya existe, no hay nada que hacer.
    }
  }

  const columnasPropiedades = [`"ubicacionMaps" TEXT`, `"lat" REAL`, `"lng" REAL`, `"caracteristicas" TEXT DEFAULT '[]'`];
  for (const definicion of columnasPropiedades) {
    try {
      db.exec(`ALTER TABLE propiedades ADD COLUMN ${definicion}`);
    } catch (err) {
      // La columna ya existe, no hay nada que hacer.
    }
  }

  const filasHorario = db.prepare(`SELECT COUNT(*) AS n FROM disponibilidad`).get();
  if (filasHorario.n === 0) {
    const insertar = db.prepare(
      `INSERT INTO disponibilidad ("diaSemana","activo","horaInicio","horaFin") VALUES (?,?,?,?)`
    );
    for (const fila of DEFAULTS_HORARIO) insertar.run(...fila);
  }

  const filasCategorias = db.prepare(`SELECT COUNT(*) AS n FROM categorias`).get();
  if (filasCategorias.n === 0) {
    const fecha = new Date().toISOString();
    const insertar = db.prepare(`INSERT INTO categorias ("nombre","fechaCreacion") VALUES (?,?)`);
    for (const nombre of DEFAULTS_CATEGORIAS) insertar.run(nombre, fecha);
  }
}

module.exports = { db, query, init };
