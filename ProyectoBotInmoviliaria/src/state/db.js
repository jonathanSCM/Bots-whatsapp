const { Pool } = require("pg");

// Identificadores entre comillas dobles en TODAS las queries de este proyecto
// para que Postgres preserve el camelCase exacto (idLead, tipoOperacion,
// propiedadId, etc.) — sin comillas, Postgres pliega todo a minusculas y
// rompe el acceso a esas propiedades en el resto del codigo (lead.idLead,
// cita.propiedadId, ...).

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && /sslmode=require/.test(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
});

async function query(text, params) {
  return pool.query(text, params);
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

let initPromise = null;

async function init() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await pool.query(`
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
        "fechaCreacion" TEXT,
        "fechaActualizacion" TEXT
      );

      CREATE TABLE IF NOT EXISTS citas (
        "id" SERIAL PRIMARY KEY,
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
        "id" SERIAL PRIMARY KEY,
        "nombre" TEXT NOT NULL UNIQUE,
        "fechaCreacion" TEXT
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
        await pool.query(`ALTER TABLE leads ADD COLUMN ${definicion}`);
      } catch (err) {
        // La columna ya existe, no hay nada que hacer.
      }
    }

    const { rows: filasHorario } = await pool.query(`SELECT COUNT(*)::int AS n FROM disponibilidad`);
    if (filasHorario[0].n === 0) {
      for (const [diaSemana, activo, horaInicio, horaFin] of DEFAULTS_HORARIO) {
        await pool.query(
          `INSERT INTO disponibilidad ("diaSemana","activo","horaInicio","horaFin") VALUES ($1,$2,$3,$4)`,
          [diaSemana, activo, horaInicio, horaFin]
        );
      }
    }

    const { rows: filasCategorias } = await pool.query(`SELECT COUNT(*)::int AS n FROM categorias`);
    if (filasCategorias[0].n === 0) {
      const fecha = new Date().toISOString();
      for (const nombre of DEFAULTS_CATEGORIAS) {
        await pool.query(`INSERT INTO categorias ("nombre","fechaCreacion") VALUES ($1,$2)`, [nombre, fecha]);
      }
    }
  })();
  return initPromise;
}

module.exports = { pool, query, init };
