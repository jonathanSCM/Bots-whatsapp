const business = require("../config/restaurante.json");
const { obtenerMenuDisponible } = require("../services/sheets");

const TIMEZONE_NEGOCIO = "America/La_Paz";

const TOOLS = [
  {
    type: "function",
    function: {
      name: "actualizar_datos_cliente",
      description: "Guarda o actualiza los datos del cliente a medida que se obtienen en la conversacion.",
      parameters: {
        type: "object",
        properties: {
          nombre: { type: "string" },
          personas: { type: "string", description: "Cantidad de personas para la reserva" },
          tipoPedido: { type: "string", enum: ["reserva", "delivery", "consulta"] },
          zonaDelivery: { type: "string" },
          observaciones: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agendar_reserva",
      description: "Agenda una reserva de mesa cuando el cliente confirmo fecha, hora y cantidad de personas.",
      parameters: {
        type: "object",
        properties: {
          fecha: { type: "string", description: "Formato YYYY-MM-DD" },
          hora: { type: "string", description: "Formato HH:MM 24hs" },
          personas: { type: "string" },
        },
        required: ["fecha", "hora", "personas"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "derivar_a_asesor",
      description: "Deriva la conversacion a un encargado humano cuando el cliente lo pide, esta molesto, o la consulta esta fuera de alcance (ej. reclamos, pedidos grandes/eventos).",
      parameters: { type: "object", properties: { motivo: { type: "string" } } },
    },
  },
];

function formatearMenu(menu) {
  if (!menu.length) return "No hay platos cargados actualmente en el sistema.";
  const porCategoria = {};
  for (const item of menu) {
    porCategoria[item.categoria] = porCategoria[item.categoria] || [];
    porCategoria[item.categoria].push(item);
  }
  return Object.entries(porCategoria)
    .map(
      ([categoria, items]) =>
        `${categoria}:\n` + items.map((i) => `  - [${i.idPlato}] ${i.nombre} - ${i.precio} - ${i.descripcion}`).join("\n")
    )
    .join("\n");
}

function systemPrompt(menu = []) {
  const hoy = new Date();
  const fechaHoyTexto = hoy.toLocaleDateString("es-BO", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: TIMEZONE_NEGOCIO });
  const horaActualTexto = hoy.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE_NEGOCIO });
  const fechaHoyISO = hoy.toLocaleDateString("en-CA", { timeZone: TIMEZONE_NEGOCIO });

  return `Eres el asistente virtual de "${business.nombreNegocio}", un restaurante.

IMPORTANTE: esta es una DEMOSTRACIÓN de ProShop (empresa que crea agentes de WhatsApp con IA). "${business.nombreNegocio}" y su menú son ficticios, solo existen para mostrar cómo se comportaría un bot real. Conversa con normalidad como si fueras el bot de un restaurante real (recomendando platos, tomando reservas, etc.) — el sistema se encarga de aclarar que es una demo en el momento en que el cliente confirma una reserva, tú no necesitas mencionarlo antes de eso. Si el cliente pregunta directamente si esto es real, sé honesto: dile que es una demostración de ProShop y que si quiere un bot así para su propio negocio puede pedir una cotización.

Fecha y hora actual en Bolivia (zona horaria America/La_Paz): hoy es ${fechaHoyTexto}, son las ${horaActualTexto} (${fechaHoyISO}). Usa esta fecha como referencia para calcular fechas relativas ("mañana", "este viernes", etc). Siempre calcula la fecha real en formato YYYY-MM-DD antes de llamar a agendar_reserva.

Informacion del negocio:
- Horarios de atencion: ${business.horarios}
- Direccion: ${business.direccion}
- Zonas con delivery: ${business.zonasDelivery.join(", ")}
- Metodos de pago: ${business.metodosPago}
- Estilo de comunicacion: ${business.estiloComunicacion}

Menu disponible ahora mismo (esta es la UNICA fuente real del menu, no existen otros platos):
${formatearMenu(menu)}

Reglas obligatorias:
- Solo puedes mencionar, describir u ofrecer los platos listados arriba, con sus precios exactos. No inventes platos ni precios.
- Si el cliente pide algo que no esta en el menu, dilo honestamente y sugiere alternativas del menu real.
- No pidas datos sensibles innecesarios (solo nombre, cantidad de personas y preferencias).
- Usa derivar_a_asesor SOLO si: el cliente lo pide explicitamente, esta molesto, o la consulta esta fuera de alcance (eventos grandes, reclamos).
- derivar_a_asesor es la excepcion, no la regla.
- Cuando obtengas un dato nuevo del cliente llama a actualizar_datos_cliente.
- Para agendar una reserva, primero confirma fecha, hora y cantidad de personas en lenguaje natural, y luego llama a agendar_reserva.
- Mantén las respuestas breves, cálidas y con buena onda.`;
}

async function obtenerContexto() {
  return obtenerMenuDisponible();
}

// helpers: { numero, getOrCreateLead, updateLead, ESTADOS_LEAD, notificarInteresNegocio }
async function ejecutarFuncion(toolCall, _contexto, helpers) {
  const args = JSON.parse(toolCall.function.arguments || "{}");
  const { numero, updateLead, ESTADOS_LEAD, notificarInteresNegocio } = helpers;

  if (toolCall.function.name === "actualizar_datos_cliente") {
    updateLead(numero, { ...args, estadoLead: ESTADOS_LEAD.EN_CONVERSACION });
    return null;
  }

  if (toolCall.function.name === "agendar_reserva") {
    // Es solo una demostracion: no existe un restaurante real, asi que no se
    // agenda nada. Se aclara y se registra como lead caliente para ProShop.
    updateLead(numero, { estadoLead: ESTADOS_LEAD.INTERESADO_COTIZACION });
    await notificarInteresNegocio(
      `Intento agendar una reserva en la demo (${args.fecha || "-"} ${args.hora || "-"}, ${args.personas || "-"} personas) - cliente interesado en tener su propio bot`
    );
    return "Esto que acabas de ver es una demostración del bot de Restaurante, así que no agenda reservas reales. Si te gustaría tener un asistente así para tu propio negocio, ¿agendamos una reunión breve para cotizarlo? Cuéntame tu nombre y a qué negocio representas y te contactamos.";
  }

  if (toolCall.function.name === "derivar_a_asesor") {
    updateLead(numero, { estadoLead: ESTADOS_LEAD.DERIVADO });
    await notificarInteresNegocio("Pidio hablar con un encargado durante la demo de restaurante");
    return "Perfecto, voy a derivarte con un encargado para que pueda ayudarte con mas detalle. Por favor espera unos momentos.";
  }

  return null;
}

module.exports = {
  id: "restaurante",
  nombre: "Restaurante",
  tools: TOOLS,
  systemPrompt,
  obtenerContexto,
  ejecutarFuncion,
};
