const { query } = require("./db");

async function obtenerHorario() {
  const { rows } = await query(`SELECT * FROM disponibilidad ORDER BY "diaSemana" ASC`);
  return rows;
}

async function obtenerHorarioDia(diaSemana) {
  const { rows } = await query(`SELECT * FROM disponibilidad WHERE "diaSemana" = $1`, [diaSemana]);
  return rows[0];
}

async function actualizarHorario(dias) {
  for (const dia of dias) {
    await query(
      `UPDATE disponibilidad SET "activo"=$1,"horaInicio"=$2,"horaFin"=$3 WHERE "diaSemana"=$4`,
      [dia.activo ? 1 : 0, dia.horaInicio, dia.horaFin, dia.diaSemana]
    );
  }
  return obtenerHorario();
}

module.exports = { obtenerHorario, obtenerHorarioDia, actualizarHorario };
