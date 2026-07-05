const business = require("../config/hotel.json");
const habitaciones = require("../config/hotel-habitaciones.json");

const TIMEZONE = "America/La_Paz";
const NOMBRE_BOT = "Sofía";

const TOOLS = [
  {
    type: "function",
    function: {
      name: "actualizar_datos_cliente",
      description: "Guarda o actualiza los datos del huésped a medida que se obtienen. Llamar cada vez que el huésped dé un dato nuevo.",
      parameters: {
        type: "object",
        properties: {
          nombre: { type: "string" },
          huespedes: { type: "string", description: "Cantidad de huéspedes" },
          motivoViaje: { type: "string", description: "Motivo del viaje: turismo, trabajo, familia, celebración especial, etc." },
          observaciones: { type: "string", description: "Preferencias especiales: vista, planta, dieta, etc." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agendar_reserva",
      description: "Agenda la reserva cuando el huésped confirmó tipo de habitación, fecha de entrada y fecha de salida.",
      parameters: {
        type: "object",
        properties: {
          idHabitacion: { type: "string", description: "ID exacto de la habitación, ej: H002" },
          fechaEntrada: { type: "string", description: "Formato YYYY-MM-DD" },
          fechaSalida: { type: "string", description: "Formato YYYY-MM-DD" },
        },
        required: ["idHabitacion", "fechaEntrada", "fechaSalida"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "derivar_a_asesor",
      description: "Deriva a recepción SOLO si el huésped lo pide, está molesto, o tiene requerimientos especiales fuera de alcance (bodas, grupos grandes, tarifas corporativas).",
      parameters: { type: "object", properties: { motivo: { type: "string" } } },
    },
  },
];

function formatearHabitaciones(lista) {
  if (!lista.length) return "No hay habitaciones disponibles en este momento.";
  return lista.map(
    (h) =>
      `  • [${h.idHabitacion}] *${h.nombre}* — ${h.precio} — Cap: ${h.capacidad}\n    ${h.descripcion}`
  ).join("\n\n");
}

function datosConocidos(lead = {}) {
  const campos = [];
  if (lead.nombre) campos.push(`• Nombre: ${lead.nombre}`);
  if (lead.personas) campos.push(`• Huéspedes: ${lead.personas}`);
  const datosBot = lead.datosBot || {};
  if (datosBot.motivoViaje) campos.push(`• Motivo del viaje: ${datosBot.motivoViaje}`);
  if (datosBot.observaciones) campos.push(`• Preferencias: ${datosBot.observaciones}`);
  if (!campos.length) return "Primera interacción — aún no hay datos del huésped.";
  return campos.join("\n");
}

function systemPrompt(catalogo = [], lead = {}) {
  const hoy = new Date();
  const fechaTexto = hoy.toLocaleDateString("es-BO", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: TIMEZONE });
  const horaTexto = hoy.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE });
  const fechaISO = hoy.toLocaleDateString("en-CA", { timeZone: TIMEZONE });

  return `Eres ${NOMBRE_BOT}, la asistente de reservas de *${business.nombreNegocio}*.

CONTEXTO DE DEMO: esta conversación es una *demostración de ProShop*, empresa que crea agentes de WhatsApp con IA. *${business.nombreNegocio}* es un hotel ficticio para mostrar cómo funciona el bot en un hotel real. Actúa con naturalidad — el aviso de demo se muestra automáticamente cuando el huésped confirma una reserva, no lo menciones antes. Si preguntan si es real, explica que es una demo de ProShop.

Fecha y hora actual (Bolivia): *${fechaTexto}, ${horaTexto}* (${fechaISO}). Úsala para calcular fechas relativas antes de llamar a agendar_reserva.

*Datos del negocio:*
• Horarios de recepción: ${business.horarios}
• Dirección: ${business.direccion}
• Política de cancelación: ${business.politicaCancelacion}
• Comunicación: ${business.estiloComunicacion}

*Lo que ya sabes de este huésped (NO lo vuelvas a preguntar):*
${datosConocidos(lead)}

*Habitaciones disponibles* (únicas y reales, no inventes tipos ni precios):
${formatearHabitaciones(catalogo)}

*Cómo asesoras al huésped:*
1. Pregunta cuántas personas son y el motivo del viaje (turismo, trabajo, celebración, etc.).
2. Con esa información, recomienda la habitación más conveniente explicando POR QUÉ le conviene.
3. Calcula el total aproximado de la estadía (precio × noches) cuando pregunten por el costo total.
4. Confirma habitación, fecha de entrada y fecha de salida, luego llama a agendar_reserva.

*Reglas importantes:*
• Usa *un solo asterisco pegado al texto* para negrita en WhatsApp.
• Solo menciona las habitaciones de la lista con sus precios exactos. No inventes disponibilidad, upgrades ni descuentos.
• Llama a actualizar_datos_cliente cuando obtengas nombre, cantidad de huéspedes, motivo o preferencias.
• Si el huésped pide algo especial (despertador, decoración, dieta especial): registra en observaciones y confirma que lo transmitirás a recepción.
• No pidas datos de tarjeta de crédito ni pagos en este chat.
• Respuestas cálidas, elegantes y serviciables. 2–3 emojis por mensaje (🏨 🌅 ✅ 🛎️ 😊).
• Termina SIEMPRE con una acción concreta ("¿Reservamos esas fechas?", "¿Confirmamos la Suite para el viernes?").`;
}

async function obtenerContexto() {
  return habitaciones.filter((h) => h.disponible === "si");
}

async function ejecutarFuncion(toolCall, contexto, helpers) {
  const args = JSON.parse(toolCall.function.arguments || "{}");
  const { numero, updateLead, updateDatosBot, ESTADOS_LEAD, notificarInteresNegocio } = helpers;

  if (toolCall.function.name === "actualizar_datos_cliente") {
    const cambios = { estadoLead: ESTADOS_LEAD.EN_CONVERSACION };
    if (args.nombre) cambios.nombre = args.nombre;
    if (args.huespedes) cambios.personas = args.huespedes;
    await updateDatosBot(numero, { motivoViaje: args.motivoViaje, observaciones: args.observaciones });
    await updateLead(numero, cambios);
    return null;
  }

  if (toolCall.function.name === "agendar_reserva") {
    const habitacion = contexto.find((h) => h.idHabitacion === args.idHabitacion);
    await updateLead(numero, {
      fechaVisita: args.fechaEntrada,
      horaVisita: args.fechaSalida,
      estadoLead: ESTADOS_LEAD.INTERESADO_COTIZACION,
    });
    await notificarInteresNegocio(
      `Reservó en demo de hotel (${habitacion ? habitacion.nombre : args.idHabitacion}, entrada: ${args.fechaEntrada || "—"}, salida: ${args.fechaSalida || "—"}) — interesado en tener su propio bot`
    );
    return `✅ *¡Así funciona en un bot real!*\n\nAcabas de ver el flujo de reservas de *${business.nombreNegocio}*. En un hotel real, esta reserva quedaría bloqueada en el sistema de gestión hotelera, el huésped recibiría una confirmación por WhatsApp y el equipo de recepción una notificación automática.\n\n¿Te gustaría tener un asistente de reservas así para tu negocio? Cuéntame tu nombre y rubro y te armo una propuesta sin costo. 🚀`;
  }

  if (toolCall.function.name === "derivar_a_asesor") {
    await updateLead(numero, { estadoLead: ESTADOS_LEAD.DERIVADO });
    await notificarInteresNegocio("Solicitó hablar con recepción durante la demo de hotel");
    return "Por supuesto, te conecto con nuestro equipo de recepción para atenderte personalmente. Por favor espera un momento. 🛎️";
  }

  return null;
}

module.exports = {
  id: "hotel",
  nombre: "Hotel / Turismo",
  tools: TOOLS,
  systemPrompt,
  obtenerContexto,
  ejecutarFuncion,
};
