const db = require("./db");
const { ahoraLaPaz } = require("../utils/fecha");
const { obtenerHorarioDia } = require("./disponibilidadStore");

const TIMEZONE = "America/La_Paz";

function diaSemanaDe(fechaISO) {
  // fechaISO: "YYYY-MM-DD". new Date(...) en UTC, pero el dia de semana de una
  // fecha calendario no depende de zona horaria si la tratamos como fecha pura.
  const [y, m, d] = fechaISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function horaAMinutos(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Verifica que la fecha/hora solicitada caiga dentro del horario configurado
// y que no choque con otra cita ya agendada. No agenda nada, solo valida.
function verificarDisponibilidad(fecha, hora) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}$/.test(hora)) {
    return { disponible: false, motivo: "Formato de fecha u hora invalido." };
  }

  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
  if (fecha < hoy) {
    return { disponible: false, motivo: "La fecha ya paso." };
  }

  const horario = obtenerHorarioDia(diaSemanaDe(fecha));
  if (!horario || !horario.activo) {
    return { disponible: false, motivo: "Ese dia no se atiende." };
  }

  const minutos = horaAMinutos(hora);
  if (minutos < horaAMinutos(horario.horaInicio) || minutos >= horaAMinutos(horario.horaFin)) {
    return { disponible: false, motivo: `Fuera de horario de atencion (${horario.horaInicio} a ${horario.horaFin}).` };
  }

  const choque = db
    .prepare("SELECT id FROM citas WHERE fecha = ? AND hora = ? AND estado != 'cancelada'")
    .get(fecha, hora);
  if (choque) {
    return { disponible: false, motivo: "Ese horario ya esta ocupado por otra cita." };
  }

  return { disponible: true, motivo: null };
}

function crearCita({ idLead, nombre, whatsapp, propiedadId, fecha, hora }) {
  const res = db
    .prepare(
      `INSERT INTO citas (idLead, nombre, whatsapp, propiedadId, fecha, hora, estado, recordatorioEnviado, fechaCreacion)
       VALUES (?, ?, ?, ?, ?, ?, 'confirmada', 0, ?)`
    )
    .run(idLead, nombre, whatsapp, propiedadId, fecha, hora, ahoraLaPaz());
  return obtenerCita(Number(res.lastInsertRowid));
}

function obtenerCita(id) {
  return db.prepare("SELECT * FROM citas WHERE id = ?").get(id);
}

function listarCitas() {
  return db.prepare("SELECT * FROM citas ORDER BY fecha DESC, hora DESC").all();
}

function actualizarEstadoCita(id, estado) {
  db.prepare("UPDATE citas SET estado = ? WHERE id = ?").run(estado, id);
}

function guardarGoogleEventId(id, googleEventId) {
  db.prepare("UPDATE citas SET googleEventId = ? WHERE id = ?").run(googleEventId, id);
}

// Citas que ocurren entre 11h45 y 12h15 desde ahora, confirmadas, sin recordatorio enviado.
function obtenerCitasParaRecordar() {
  const ahora = new Date();
  const desde = new Date(ahora.getTime() + 11.75 * 60 * 60 * 1000);
  const hasta = new Date(ahora.getTime() + 12.25 * 60 * 60 * 1000);

  return listarCitas().filter((c) => {
    if (c.estado !== "confirmada" || c.recordatorioEnviado) return false;
    const fechaHora = new Date(`${c.fecha}T${c.hora}:00-04:00`); // offset fijo de Bolivia
    return fechaHora >= desde && fechaHora <= hasta;
  });
}

function marcarRecordatorioEnviado(id) {
  db.prepare("UPDATE citas SET recordatorioEnviado = 1 WHERE id = ?").run(id);
}

module.exports = {
  verificarDisponibilidad,
  crearCita,
  obtenerCita,
  listarCitas,
  actualizarEstadoCita,
  guardarGoogleEventId,
  obtenerCitasParaRecordar,
  marcarRecordatorioEnviado,
};
