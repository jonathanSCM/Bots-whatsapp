const db = require("./db");
const { ahoraLaPaz } = require("../utils/fecha");

const selectStmt = db.prepare("SELECT * FROM propiedades WHERE id = ?");
const insertStmt = db.prepare(`
  INSERT INTO propiedades (id, tipo, operacion, zona, precio, dormitorios, descripcion, estado, fotos, fechaCreacion, fechaActualizacion)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const updateStmt = db.prepare(`
  UPDATE propiedades SET tipo=?, operacion=?, zona=?, precio=?, dormitorios=?, descripcion=?, estado=?, fotos=?, fechaActualizacion=?
  WHERE id=?
`);

function filaToPropiedad(fila) {
  if (!fila) return null;
  return { ...fila, fotos: JSON.parse(fila.fotos || "[]") };
}

function generarId() {
  const ultimo = db.prepare("SELECT id FROM propiedades ORDER BY rowid DESC LIMIT 1").get();
  const n = ultimo ? parseInt(ultimo.id.replace(/\D/g, ""), 10) + 1 : 1;
  return `P${String(n).padStart(3, "0")}`;
}

function listarPropiedades() {
  return db.prepare("SELECT * FROM propiedades ORDER BY fechaCreacion DESC").all().map(filaToPropiedad);
}

function listarDisponibles() {
  return db
    .prepare("SELECT * FROM propiedades WHERE estado = 'disponible' ORDER BY fechaCreacion DESC")
    .all()
    .map(filaToPropiedad);
}

function obtenerPropiedad(id) {
  return filaToPropiedad(selectStmt.get(id));
}

function crearPropiedad(datos) {
  const id = generarId();
  const ahora = ahoraLaPaz();
  insertStmt.run(
    id,
    datos.tipo || "",
    datos.operacion || "",
    datos.zona || "",
    datos.precio || "",
    datos.dormitorios || "",
    datos.descripcion || "",
    datos.estado || "disponible",
    JSON.stringify(datos.fotos || []),
    ahora,
    ahora
  );
  return obtenerPropiedad(id);
}

function actualizarPropiedad(id, datos) {
  const actual = obtenerPropiedad(id);
  if (!actual) return null;
  const fusionado = { ...actual, ...datos };
  updateStmt.run(
    fusionado.tipo,
    fusionado.operacion,
    fusionado.zona,
    fusionado.precio,
    fusionado.dormitorios,
    fusionado.descripcion,
    fusionado.estado,
    JSON.stringify(fusionado.fotos || []),
    ahoraLaPaz(),
    id
  );
  return obtenerPropiedad(id);
}

function eliminarPropiedad(id) {
  db.prepare("DELETE FROM propiedades WHERE id = ?").run(id);
}

module.exports = {
  listarPropiedades,
  listarDisponibles,
  obtenerPropiedad,
  crearPropiedad,
  actualizarPropiedad,
  eliminarPropiedad,
};
