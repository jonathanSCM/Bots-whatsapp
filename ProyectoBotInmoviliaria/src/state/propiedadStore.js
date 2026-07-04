const { query } = require("./db");
const { ahoraLaPaz } = require("../utils/fecha");

// Acepta lista o texto separado por comas (como llega del formulario del
// panel) y devuelve siempre un array limpio de caracteristicas.
function normalizarCaracteristicas(valor) {
  if (Array.isArray(valor)) return valor.map((c) => String(c).trim()).filter(Boolean);
  if (typeof valor === "string") return valor.split(",").map((c) => c.trim()).filter(Boolean);
  return [];
}

function filaToPropiedad(fila) {
  if (!fila) return null;
  return { ...fila, fotos: JSON.parse(fila.fotos || "[]"), caracteristicas: JSON.parse(fila.caracteristicas || "[]") };
}

async function generarId() {
  // Usa el numero MAS ALTO existente (no el "ultimo creado"): con propiedades
  // seed que comparten fechaCreacion, ordenar por fecha devolvia un id viejo
  // y el nuevo id chocaba con uno existente (UNIQUE constraint).
  const { rows } = await query(`SELECT "id" FROM propiedades`);
  const maximo = rows.reduce((max, r) => Math.max(max, parseInt(r.id.replace(/\D/g, ""), 10) || 0), 0);
  return `P${String(maximo + 1).padStart(3, "0")}`;
}

async function listarPropiedades() {
  const { rows } = await query(`SELECT * FROM propiedades ORDER BY "fechaCreacion" DESC`);
  return rows.map(filaToPropiedad);
}

async function listarDisponibles() {
  const { rows } = await query(`SELECT * FROM propiedades WHERE "estado" = 'disponible' ORDER BY "fechaCreacion" DESC`);
  return rows.map(filaToPropiedad);
}

async function obtenerPropiedad(id) {
  const { rows } = await query(`SELECT * FROM propiedades WHERE "id" = $1`, [id]);
  return filaToPropiedad(rows[0]);
}

async function crearPropiedad(datos) {
  const id = await generarId();
  const ahora = ahoraLaPaz();
  await query(
    `INSERT INTO propiedades ("id","tipo","operacion","zona","precio","dormitorios","descripcion","estado","fotos","caracteristicas","ubicacionMaps","lat","lng","fechaCreacion","fechaActualizacion")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      id,
      datos.tipo || "",
      datos.operacion || "",
      datos.zona || "",
      datos.precio || "",
      datos.dormitorios || "",
      datos.descripcion || "",
      datos.estado || "disponible",
      JSON.stringify(datos.fotos || []),
      JSON.stringify(normalizarCaracteristicas(datos.caracteristicas)),
      datos.ubicacionMaps || null,
      datos.lat ?? null,
      datos.lng ?? null,
      ahora,
      ahora,
    ]
  );
  return obtenerPropiedad(id);
}

async function actualizarPropiedad(id, datos) {
  const actual = await obtenerPropiedad(id);
  if (!actual) return null;
  const fusionado = { ...actual, ...datos };
  await query(
    `UPDATE propiedades SET "tipo"=$1,"operacion"=$2,"zona"=$3,"precio"=$4,"dormitorios"=$5,"descripcion"=$6,"estado"=$7,"fotos"=$8,"caracteristicas"=$9,"ubicacionMaps"=$10,"lat"=$11,"lng"=$12,"fechaActualizacion"=$13
     WHERE "id"=$14`,
    [
      fusionado.tipo,
      fusionado.operacion,
      fusionado.zona,
      fusionado.precio,
      fusionado.dormitorios,
      fusionado.descripcion,
      fusionado.estado,
      JSON.stringify(fusionado.fotos || []),
      JSON.stringify(normalizarCaracteristicas(fusionado.caracteristicas)),
      fusionado.ubicacionMaps || null,
      fusionado.lat ?? null,
      fusionado.lng ?? null,
      ahoraLaPaz(),
      id,
    ]
  );
  return obtenerPropiedad(id);
}

async function eliminarPropiedad(id) {
  await query(`DELETE FROM propiedades WHERE "id" = $1`, [id]);
}

module.exports = {
  listarPropiedades,
  listarDisponibles,
  obtenerPropiedad,
  crearPropiedad,
  actualizarPropiedad,
  eliminarPropiedad,
};
