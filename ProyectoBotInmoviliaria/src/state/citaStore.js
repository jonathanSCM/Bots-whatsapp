const { query } = require("./db");
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
async function verificarDisponibilidad(fecha, hora) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}$/.test(hora)) {
    return { disponible: false, motivo: "Formato de fecha u hora invalido." };
  }

  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
  if (fecha < hoy) {
    return { disponible: false, motivo: "La fecha ya paso." };
  }

  const horario = await obtenerHorarioDia(diaSemanaDe(fecha));
  if (!horario || !horario.activo) {
    return { disponible: false, motivo: "Ese dia no se atiende." };
  }

  const minutos = horaAMinutos(hora);
  if (minutos < horaAMinutos(horario.horaInicio) || minutos >= horaAMinutos(horario.horaFin)) {
    return { disponible: false, motivo: `Fuera de horario de atencion (${horario.horaInicio} a ${horario.horaFin}).` };
  }

  const { rows } = await query(
    `SELECT "id" FROM citas WHERE "fecha" = $1 AND "hora" = $2 AND "estado" != 'cancelada'`,
    [fecha, hora]
  );
  if (rows.length) {
    return { disponible: false, motivo: "Ese horario ya esta ocupado por otra cita." };
  }

  return { disponible: true, motivo: null };
}

async function crearCita({ idLead, nombre, whatsapp, propiedadId, fecha, hora }) {
  const { rows } = await query(
    `INSERT INTO citas ("idLead","nombre","whatsapp","propiedadId","fecha","hora","estado","recordatorioEnviado","fechaCreacion")
     VALUES ($1,$2,$3,$4,$5,$6,'confirmada',0,$7) RETURNING "id"`,
    [idLead, nombre, whatsapp, propiedadId, fecha, hora, ahoraLaPaz()]
  );
  return obtenerCita(rows[0].id);
}

async function obtenerCita(id) {
  const { rows } = await query(`SELECT * FROM citas WHERE "id" = $1`, [id]);
  return rows[0] || null;
}

// Para reprogramar: la cita confirmada mas reciente de ese cliente.
async function obtenerCitaActivaPorLead(idLead) {
  const { rows } = await query(
    `SELECT * FROM citas WHERE "idLead" = $1 AND "estado" = 'confirmada' ORDER BY "fecha" DESC, "hora" DESC LIMIT 1`,
    [idLead]
  );
  return rows[0] || null;
}

async function listarCitas() {
  const { rows } = await query(`SELECT * FROM citas ORDER BY "fecha" DESC, "hora" DESC`);
  return rows;
}

async function actualizarEstadoCita(id, estado) {
  await query(`UPDATE citas SET "estado" = $1 WHERE "id" = $2`, [estado, id]);
}

async function guardarGoogleEventId(id, googleEventId) {
  await query(`UPDATE citas SET "googleEventId" = $1 WHERE "id" = $2`, [googleEventId, id]);
}

// Citas que ocurren entre 11h45 y 12h15 desde ahora, confirmadas, sin recordatorio enviado.
async function obtenerCitasParaRecordar() {
  const ahora = new Date();
  const desde = new Date(ahora.getTime() + 11.75 * 60 * 60 * 1000);
  const hasta = new Date(ahora.getTime() + 12.25 * 60 * 60 * 1000);

  const citas = await listarCitas();
  return citas.filter((c) => {
    if (c.estado !== "confirmada" || c.recordatorioEnviado) return false;
    const fechaHora = new Date(`${c.fecha}T${c.hora}:00-04:00`); // offset fijo de Bolivia
    return fechaHora >= desde && fechaHora <= hasta;
  });
}

async function marcarRecordatorioEnviado(id) {
  await query(`UPDATE citas SET "recordatorioEnviado" = 1 WHERE "id" = $1`, [id]);
}

module.exports = {
  verificarDisponibilidad,
  crearCita,
  obtenerCita,
  obtenerCitaActivaPorLead,
  listarCitas,
  actualizarEstadoCita,
  guardarGoogleEventId,
  obtenerCitasParaRecordar,
  marcarRecordatorioEnviado,
};
