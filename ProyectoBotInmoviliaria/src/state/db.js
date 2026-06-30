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

  CREATE TABLE IF NOT EXISTS propiedades (
    id TEXT PRIMARY KEY,
    tipo TEXT,
    operacion TEXT,
    zona TEXT,
    precio TEXT,
    dormitorios TEXT,
    descripcion TEXT,
    estado TEXT DEFAULT 'disponible',
    fotos TEXT DEFAULT '[]',
    fechaCreacion TEXT,
    fechaActualizacion TEXT
  );

  CREATE TABLE IF NOT EXISTS citas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    idLead TEXT,
    nombre TEXT,
    whatsapp TEXT,
    propiedadId TEXT,
    fecha TEXT NOT NULL,
    hora TEXT NOT NULL,
    estado TEXT DEFAULT 'confirmada',
    recordatorioEnviado INTEGER DEFAULT 0,
    googleEventId TEXT,
    fechaCreacion TEXT
  );

  CREATE TABLE IF NOT EXISTS disponibilidad (
    diaSemana INTEGER PRIMARY KEY,
    activo INTEGER DEFAULT 1,
    horaInicio TEXT DEFAULT '09:00',
    horaFin TEXT DEFAULT '18:00'
  );

  CREATE TABLE IF NOT EXISTS categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    fechaCreacion TEXT
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

// Semilla de horarios por defecto (lunes a viernes 9-18, sabado 9-13, domingo cerrado).
const totalDias = db.prepare("SELECT COUNT(*) AS n FROM disponibilidad").get().n;
if (totalDias === 0) {
  const insertDia = db.prepare("INSERT INTO disponibilidad (diaSemana, activo, horaInicio, horaFin) VALUES (?, ?, ?, ?)");
  const DEFAULTS = [
    [0, 0, "09:00", "18:00"], // domingo
    [1, 1, "09:00", "18:00"],
    [2, 1, "09:00", "18:00"],
    [3, 1, "09:00", "18:00"],
    [4, 1, "09:00", "18:00"],
    [5, 1, "09:00", "18:00"],
    [6, 1, "09:00", "13:00"], // sabado
  ];
  for (const fila of DEFAULTS) insertDia.run(...fila);
}

// Semilla de categorias por defecto (los tipos de propiedad que ya existian
// como texto libre antes de tener este catalogo).
const totalCategorias = db.prepare("SELECT COUNT(*) AS n FROM categorias").get().n;
if (totalCategorias === 0) {
  const insertCategoria = db.prepare("INSERT INTO categorias (nombre, fechaCreacion) VALUES (?, ?)");
  const fecha = new Date().toISOString();
  for (const nombre of ["Casa", "Departamento", "Terreno", "Local comercial", "Oficina", "Duplex"]) {
    insertCategoria.run(nombre, fecha);
  }
}

module.exports = db;
