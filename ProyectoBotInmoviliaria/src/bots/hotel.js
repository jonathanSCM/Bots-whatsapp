const business = require("../config/hotel.json");
const habitaciones = require("../config/hotel-habitaciones.json");

const TOOLS = [
  {
    type: "function",
    function: {
      name: "actualizar_datos_cliente",
      description: "Guarda o actualiza los datos del huesped a medida que se obtienen en la conversacion.",
      parameters: {
        type: "object",
        properties: {
          nombre: { type: "string" },
          huespedes: { type: "string", description: "Cantidad de huespedes" },
          observaciones: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agendar_reserva",
      description: "Agenda una reserva cuando el huesped confirmo tipo de habitacion, fecha de entrada y fecha de salida.",
      parameters: {
        type: "object",
        properties: {
          idHabitacion: { type: "string", description: "ID exacto de la habitacion, ej: H001" },
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
      description: "Deriva la conversacion a un encargado humano cuando el cliente lo pide, esta molesto, o la consulta esta fuera de alcance (ej. eventos grandes, grupos corporativos).",
      parameters: { type: "object", properties: { motivo: { type: "string" } } },
    },
  },
];

function formatearHabitaciones(lista) {
  if (!lista.length) return "No hay habitaciones cargadas actualmente en el sistema.";
  return lista.map((h) => `  - [${h.idHabitacion}] ${h.nombre} - ${h.precio} - ${h.capacidad} - ${h.descripcion}`).join("\n");
}

function systemPrompt(catalogo = []) {
  const hoy = new Date();
  const fechaHoyTexto = hoy.toLocaleDateString("es-BO", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/La_Paz" });
  const fechaHoyISO = hoy.toLocaleDateString("en-CA", { timeZone: "America/La_Paz" });

  return `Eres el asistente virtual de "${business.nombreNegocio}", un hotel.

IMPORTANTE: esta es una DEMOSTRACIÓN de ProShop (empresa que crea agentes de WhatsApp con IA). "${business.nombreNegocio}" y sus habitaciones son ficticios, solo existen para mostrar cómo se comportaría un bot real. Conversa con normalidad como si fueras el bot de un hotel real (cotizando estadías, agendando reservas, etc.) — el sistema se encarga de aclarar que es una demo en el momento en que el huésped confirma una reserva, tú no necesitas mencionarlo antes de eso. Si el huésped pregunta directamente si esto es real, sé honesto: dile que es una demostración de ProShop y que si quiere un bot así para su propio negocio puede pedir una cotización.

Hoy es ${fechaHoyTexto} (${fechaHoyISO}). Usa esta fecha como referencia para calcular fechas relativas y siempre calcula las fechas reales en formato YYYY-MM-DD antes de llamar a agendar_reserva.

Informacion del negocio:
- Recepcion / horarios: ${business.horarios}
- Direccion: ${business.direccion}
- Politica de cancelacion: ${business.politicaCancelacion}
- Estilo de comunicacion: ${business.estiloComunicacion}

Habitaciones disponibles ahora mismo (esta es la UNICA fuente real, no inventes tipos ni precios):
${formatearHabitaciones(catalogo)}

Reglas obligatorias:
- Solo puedes mencionar, describir u ofrecer las habitaciones listadas arriba, con sus precios exactos.
- Pregunta la cantidad de huespedes para recomendar la habitacion adecuada por capacidad.
- No pidas datos sensibles innecesarios (solo nombre y cantidad de huespedes).
- Usa derivar_a_asesor SOLO si: el cliente lo pide explicitamente, esta molesto, o pide algo fuera de alcance (eventos grandes, grupos corporativos).
- derivar_a_asesor es la excepcion, no la regla.
- Cuando obtengas un dato nuevo del cliente llama a actualizar_datos_cliente.
- Para agendar la reserva, confirma habitacion, fecha de entrada y fecha de salida, y luego llama a agendar_reserva.
- Mantén las respuestas breves, cálidas y elegantes.`;
}

async function obtenerContexto() {
  return habitaciones.filter((h) => h.disponible === "si");
}

// helpers: { numero, updateLead, updateDatosBot, ESTADOS_LEAD, notificarInteresNegocio }
async function ejecutarFuncion(toolCall, contexto, helpers) {
  const args = JSON.parse(toolCall.function.arguments || "{}");
  const { numero, updateLead, updateDatosBot, ESTADOS_LEAD, notificarInteresNegocio } = helpers;

  if (toolCall.function.name === "actualizar_datos_cliente") {
    await updateDatosBot(numero, args);
    await updateLead(numero, { nombre: args.nombre, personas: args.huespedes, estadoLead: ESTADOS_LEAD.EN_CONVERSACION });
    return null;
  }

  if (toolCall.function.name === "agendar_reserva") {
    const habitacion = contexto.find((h) => h.idHabitacion === args.idHabitacion);
    // Es solo una demostracion: no existe un hotel real, asi que no se agenda
    // ninguna reserva real. Se aclara y se registra como lead caliente.
    await updateLead(numero, {
      fechaVisita: args.fechaEntrada,
      horaVisita: args.fechaSalida,
      estadoLead: ESTADOS_LEAD.INTERESADO_COTIZACION,
    });
    await notificarInteresNegocio(
      `Intento agendar una reserva en la demo (${habitacion ? habitacion.nombre : args.idHabitacion}, ${args.fechaEntrada || "-"} a ${args.fechaSalida || "-"}) - cliente interesado en tener su propio bot`
    );
    return "Esto que acabas de ver es una demostración del bot de Hotel, así que no procesa reservas reales. Si te gustaría tener un asistente así para tu propio negocio, ¿agendamos una reunión breve para cotizarlo? Cuéntame tu nombre y a qué negocio representas y te contactamos.";
  }

  if (toolCall.function.name === "derivar_a_asesor") {
    await updateLead(numero, { estadoLead: ESTADOS_LEAD.DERIVADO });
    await notificarInteresNegocio("Pidio hablar con un encargado durante la demo de hotel");
    return "Perfecto, voy a derivarte con un encargado para que pueda ayudarte con mas detalle. Por favor espera unos momentos.";
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
