const { query } = require("./db");
const { ahoraLaPaz } = require("../utils/fecha");

function filaToPropiedad(fila) {
  if (!fila) return null;
  return { ...fila, fotos: JSON.parse(fila.fotos || "[]") };
}

async function generarId() {
  const { rows } = await query(`SELECT "id" FROM propiedades ORDER BY "fechaCreacion" DESC LIMIT 1`);
  const ultimo = rows[0];
  const n = ultimo ? parseInt(ultimo.id.replace(/\D/g, ""), 10) + 1 : 1;
  return `P${String(n).padStart(3, "0")}`;
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
    `INSERT INTO propiedades ("id","tipo","operacion","zona","precio","dormitorios","descripcion","estado","fotos","ubicacionMaps","lat","lng","fechaCreacion","fechaActualizacion")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
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
    `UPDATE propiedades SET "tipo"=$1,"operacion"=$2,"zona"=$3,"precio"=$4,"dormitorios"=$5,"descripcion"=$6,"estado"=$7,"fotos"=$8,"ubicacionMaps"=$9,"lat"=$10,"lng"=$11,"fechaActualizacion"=$12
     WHERE "id"=$13`,
    [
      fusionado.tipo,
      fusionado.operacion,
      fusionado.zona,
      fusionado.precio,
      fusionado.dormitorios,
      fusionado.descripcion,
      fusionado.estado,
      JSON.stringify(fusionado.fotos || []),
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
