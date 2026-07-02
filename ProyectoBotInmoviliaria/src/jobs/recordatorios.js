const { enviarMensaje } = require("../services/whatsapp");
const { obtenerCitasParaRecordar, marcarRecordatorioEnviado } = require("../state/citaStore");
const { obtenerPropiedad } = require("../state/propiedadStore");

const INTERVALO_MS = 15 * 60 * 1000; // revisa cada 15 minutos

async function revisarYEnviarRecordatorios() {
  try {
    const citas = await obtenerCitasParaRecordar();
    for (const cita of citas) {
      const propiedad = cita.propiedadId ? await obtenerPropiedad(cita.propiedadId) : null;
      const detalle = propiedad ? ` para la propiedad ${propiedad.id} (${propiedad.tipo} en ${propiedad.zona})` : "";
      const texto = `Hola${cita.nombre ? " " + cita.nombre : ""}! Te recordamos tu visita${detalle} mañana/hoy a las ${cita.hora} (${cita.fecha}). Si necesitas reprogramar, avísanos por este chat.`;

      await enviarMensaje(cita.whatsapp, texto);
      await marcarRecordatorioEnviado(cita.id);
      console.log(`Recordatorio enviado a ${cita.whatsapp} para la cita #${cita.id}`);
    }
  } catch (err) {
    console.error("Error revisando recordatorios de citas:", err.message);
  }
}

function iniciarJobRecordatorios() {
  revisarYEnviarRecordatorios();
  setInterval(revisarYEnviarRecordatorios, INTERVALO_MS);
}

module.exports = { iniciarJobRecordatorios };
