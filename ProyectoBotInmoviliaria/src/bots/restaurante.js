const business = require("../config/restaurante.json");
const { obtenerMenuDisponible } = require("../services/sheets");

const TIMEZONE = "America/La_Paz";
const NOMBRE_BOT = "Ramón";

const TOOLS = [
  {
    type: "function",
    function: {
      name: "actualizar_datos_cliente",
      description: "Guarda o actualiza los datos del cliente a medida que se obtienen. Llamar cada vez que el cliente dé un dato nuevo.",
      parameters: {
        type: "object",
        properties: {
          nombre: { type: "string" },
          personas: { type: "string", description: "Cantidad de personas para la reserva" },
          tipoPedido: { type: "string", enum: ["reserva", "delivery", "consulta"] },
          zonaDelivery: { type: "string", description: "Zona o dirección de delivery" },
          observaciones: { type: "string", description: "Preferencias alimentarias, alergias o pedidos especiales" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agendar_reserva",
      description: "Agenda una reserva de mesa cuando el cliente confirmó fecha, hora y cantidad de personas.",
      parameters: {
        type: "object",
        properties: {
          fecha: { type: "string", description: "Formato YYYY-MM-DD" },
          hora: { type: "string", description: "Formato HH:MM (24hs)" },
          personas: { type: "string", description: "Cantidad de personas" },
        },
        required: ["fecha", "hora", "personas"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "derivar_a_asesor",
      description: "Deriva a un encargado SOLO si el cliente lo pide, está molesto, o tiene requerimientos fuera de alcance (eventos grandes, grupos corporativos, reclamos).",
      parameters: { type: "object", properties: { motivo: { type: "string" } } },
    },
  },
];

function formatearMenu(menu) {
  if (!menu.length) return "No hay platos disponibles en este momento.";
  const porCategoria = {};
  for (const item of menu) {
    porCategoria[item.categoria] = porCategoria[item.categoria] || [];
    porCategoria[item.categoria].push(item);
  }
  return Object.entries(porCategoria)
    .map(
      ([cat, items]) =>
        `*${cat}:*\n` +
        items.map((i) => `  • [${i.idPlato}] *${i.nombre}* — ${i.precio}\n    ${i.descripcion}`).join("\n")
    )
    .join("\n\n");
}

function datosConocidos(lead = {}) {
  const campos = [];
  if (lead.nombre) campos.push(`• Nombre: ${lead.nombre}`);
  if (lead.personas) campos.push(`• Personas: ${lead.personas}`);
  if (lead.tipoPedido) campos.push(`• Tipo de pedido: ${lead.tipoPedido}`);
  if (lead.zonaDelivery) campos.push(`• Zona de delivery: ${lead.zonaDelivery}`);
  if (lead.observaciones) campos.push(`• Observaciones: ${lead.observaciones}`);
  if (!campos.length) return "Primera interacción — aún no hay datos del cliente.";
  return campos.join("\n");
}

function systemPrompt(menu = [], lead = {}) {
  const hoy = new Date();
  const fechaTexto = hoy.toLocaleDateString("es-BO", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: TIMEZONE });
  const horaTexto = hoy.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE });
  const fechaISO = hoy.toLocaleDateString("en-CA", { timeZone: TIMEZONE });

  return `Eres ${NOMBRE_BOT}, el asistente de *${business.nombreNegocio}*.

CONTEXTO DE DEMO: esta conversación es una *demostración de ProShop*, empresa que crea agentes de WhatsApp con IA. *${business.nombreNegocio}* es un restaurante ficticio para mostrar cómo funciona el bot en un restaurante real. Actúa con naturalidad — el aviso de demo se muestra automáticamente cuando el cliente confirma una reserva, no lo menciones antes. Si preguntan si es real, explica que es una demo de ProShop.

Fecha y hora actual (Bolivia): *${fechaTexto}, ${horaTexto}* (${fechaISO}). Úsala para calcular fechas relativas antes de llamar a agendar_reserva.

*Datos del negocio:*
• Horarios de atención: ${business.horarios}
• Dirección: ${business.direccion}
• Zonas con delivery: ${business.zonasDelivery.join(", ")}
• Métodos de pago: ${business.metodosPago}
• Comunicación: ${business.estiloComunicacion}

*Lo que ya sabes de este cliente (NO lo vuelvas a preguntar):*
${datosConocidos(lead)}

*Menú disponible* (únicos y reales, no inventes platos ni precios):
${formatearMenu(menu)}

*Cómo atiendes al cliente:*
1. Si quiere hacer una reserva: confirma fecha, hora y cantidad de personas, luego llama a agendar_reserva.
2. Si quiere pedir delivery: verifica que su zona tenga cobertura y guía el pedido.
3. Si tiene dudas del menú: recomienda con entusiasmo según sus preferencias.

*Reglas importantes:*
• Usa *un solo asterisco pegado al texto* para negrita en WhatsApp.
• Solo menciona los platos del menú con sus precios exactos. No inventes especiales del día ni platos que no estén en la lista.
• Llama a actualizar_datos_cliente cada vez que obtengas nombre, cantidad de personas, tipo de pedido u observaciones.
• Si menciona alergias o preferencias dietéticas: regístralas en observaciones y confirma cuáles de los platos aplica.
• Respuestas cálidas, con buena onda y entusiastas con los platos. 2–3 emojis por mensaje (🍽️ 😊 ✅ 🥘 👨‍🍳).
• Termina SIEMPRE con una acción concreta ("¿Reservamos para esa fecha?", "¿Qué más te gustaría pedir?").`;
}

async function obtenerContexto() {
  return obtenerMenuDisponible();
}

async function ejecutarFuncion(toolCall, _contexto, helpers) {
  const args = JSON.parse(toolCall.function.arguments || "{}");
  const { numero, updateLead, ESTADOS_LEAD, notificarInteresNegocio } = helpers;

  if (toolCall.function.name === "actualizar_datos_cliente") {
    const cambios = { estadoLead: ESTADOS_LEAD.EN_CONVERSACION };
    if (args.nombre) cambios.nombre = args.nombre;
    if (args.personas) cambios.personas = args.personas;
    if (args.tipoPedido) cambios.tipoPedido = args.tipoPedido;
    if (args.zonaDelivery) cambios.zonaDelivery = args.zonaDelivery;
    if (args.observaciones) cambios.observaciones = args.observaciones;
    await updateLead(numero, cambios);
    return null;
  }

  if (toolCall.function.name === "agendar_reserva") {
    await updateLead(numero, { fechaVisita: args.fecha, horaVisita: args.hora, estadoLead: ESTADOS_LEAD.INTERESADO_COTIZACION });
    await notificarInteresNegocio(
      `Reservó mesa en demo de restaurante (${args.fecha || "—"} ${args.hora || "—"}, ${args.personas || "—"} personas) — interesado en tener su propio bot`
    );
    return `✅ *¡Así funciona en un bot real!*\n\nAcabas de ver cómo *${business.nombreNegocio}* toma una reserva. En un restaurante real, la mesa quedaría bloqueada en el sistema, el cliente recibiría confirmación por WhatsApp y el encargado de sala una notificación automática.\n\n¿Te gustaría tener un asistente así para tu restaurante o negocio? Cuéntame tu nombre y rubro y te armo una propuesta sin costo. 🚀`;
  }

  if (toolCall.function.name === "derivar_a_asesor") {
    await updateLead(numero, { estadoLead: ESTADOS_LEAD.DERIVADO });
    await notificarInteresNegocio("Solicitó hablar con un encargado durante la demo de restaurante");
    return "Claro, te conecto con el encargado ahora mismo para atenderte mejor. Por favor espera unos momentos. 😊";
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
