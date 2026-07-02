const { db } = require("./db");

function listarCategorias() {
  return db.prepare("SELECT * FROM categorias ORDER BY nombre ASC").all();
}

function crearCategoria(nombre) {
  const limpio = (nombre || "").trim();
  if (!limpio) throw new Error("El nombre de la categoria no puede estar vacio");
  db.prepare("INSERT INTO categorias (nombre, fechaCreacion) VALUES (?, ?)").run(limpio, new Date().toISOString());
  return listarCategorias();
}

function eliminarCategoria(id) {
  db.prepare("DELETE FROM categorias WHERE id = ?").run(id);
  return listarCategorias();
}

module.exports = { listarCategorias, crearCategoria, eliminarCategoria };
