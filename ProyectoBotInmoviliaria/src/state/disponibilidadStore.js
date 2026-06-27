const db = require("./db");

function obtenerHorario() {
  return db.prepare("SELECT * FROM disponibilidad ORDER BY diaSemana ASC").all();
}

function obtenerHorarioDia(diaSemana) {
  return db.prepare("SELECT * FROM disponibilidad WHERE diaSemana = ?").get(diaSemana);
}

function actualizarHorario(dias) {
  const stmt = db.prepare("UPDATE disponibilidad SET activo=?, horaInicio=?, horaFin=? WHERE diaSemana=?");
  for (const dia of dias) {
    stmt.run(dia.activo ? 1 : 0, dia.horaInicio, dia.horaFin, dia.diaSemana);
  }
  return obtenerHorario();
}

module.exports = { obtenerHorario, obtenerHorarioDia, actualizarHorario };
