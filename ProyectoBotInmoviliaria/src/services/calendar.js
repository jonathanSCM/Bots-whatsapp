const { google } = require("googleapis");
const { obtenerClavePrivada } = require("./googleAuth");

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const TIMEZONE = "America/La_Paz";
const OFFSET_LA_PAZ = "-04:00"; // Bolivia no tiene horario de verano, offset fijo.

function getAuth() {
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: obtenerClavePrivada(),
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
}

// fecha: "2026-06-30", hora: "15:00"
async function crearEventoVisita({ nombre, whatsapp, propiedad, fecha, hora }) {
  const auth = getAuth();
  const calendar = google.calendar({ version: "v3", auth });

  const inicioISO = `${fecha}T${hora}:00${OFFSET_LA_PAZ}`;
  const inicio = new Date(inicioISO);
  const fin = new Date(inicio.getTime() + 30 * 60000); // 30 min de duracion

  const evento = {
    summary: `Visita - ${nombre || "Cliente"} - ${propiedad?.id || ""}`,
    description: [
      `Nombre: ${nombre || "-"}`,
      `WhatsApp: ${whatsapp}`,
      `Propiedad: ${propiedad ? `${propiedad.id} - ${propiedad.tipo} en ${propiedad.zona}` : "-"}`,
    ].join("\n"),
    start: { dateTime: inicioISO, timeZone: TIMEZONE },
    end: { dateTime: fin.toISOString(), timeZone: TIMEZONE },
  };

  const res = await calendar.events.insert({ calendarId: CALENDAR_ID, requestBody: evento });
  return res.data;
}

async function cancelarEventoVisita(googleEventId) {
  if (!googleEventId) return;
  const auth = getAuth();
  const calendar = google.calendar({ version: "v3", auth });
  await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: googleEventId });
}

module.exports = { crearEventoVisita, cancelarEventoVisita };
