const business = require("../config/delivery.json");
const pedidos = require("../config/delivery-pedidos.json");

const TIMEZONE = "America/La_Paz";
const NOMBRE_BOT = "Track";

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
          observaciones: { type: "string", description: "Detalles adicionales del problema o consulta" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_estado_pedido",
      description: "Consulta el estado de un pedido cuando el cliente proporciona su número de pedido (formato ND-####).",
      parameters: {
        type: "object",
        properties: {
          numeroPedido: { type: "string", description: "Número exacto del pedido, ej: ND-1001" },
        },
        required: ["numeroPedido"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "derivar_a_asesor",
      description: "Deriva a un encargado SOLO si el cliente lo pide, está molesto, o reporta un problema grave (pedido perdido, dañado, muy demorado o incorrecto).",
      parameters: { type: "object", properties: { motivo: { type: "string" } } },
    },
  },
];

function datosConocidos(lead = {}) {
  const campos = [];
  if (lead.nombre) campos.push(`• Nombre: ${lead.nombre}`);
  const datosBot = lead.datosBot || {};
  if (datosBot.ultimaConsulta) campos.push(`• Último pedido consultado: ${datosBot.ultimaConsulta}`);
  if (!campos.length) return "Primera interacción — aún no hay datos del cliente.";
  return campos.join("\n");
}

function systemPrompt(_catalogo, lead = {}) {
  const hoy = new Date();
  const fechaTexto = hoy.toLocaleDateString("es-BO", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: TIMEZONE });
  const horaTexto = hoy.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE });

  return `Eres ${NOMBRE_BOT}, el asistente de rastreo de *${business.nombreNegocio}*, servicio de delivery y logística.

CONTEXTO DE DEMO: esta conversación es una *demostración de ProShop*, empresa que crea agentes de WhatsApp con IA. *${business.nombreNegocio}* es un servicio ficticio para mostrar cómo funciona el bot de rastreo en un negocio real de delivery. Actúa con naturalidad. Si preguntan si es real, explica que es una demo de ProShop y que los pedidos de ejemplo son ND-1001 a ND-1007.

Fecha y hora actual (Bolivia): *${fechaTexto}, ${horaTexto}*.

*Datos del negocio:*
• Horarios de operación: ${business.horarios}
• Zonas de cobertura: ${business.zonasCobertura.join(", ")}
• Comunicación: ${business.estiloComunicacion}

*Lo que ya sabes de este cliente (NO lo vuelvas a preguntar):*
${datosConocidos(lead)}

*Cómo atiendes al cliente:*
1. Si consulta por un pedido: pídele el número (formato ND-####, que está en su comprobante de compra) y llama a consultar_estado_pedido.
2. Si tiene un reclamo o problema grave (pedido perdido, dañado, muy demorado): usa derivar_a_asesor.
3. Si tiene otras consultas (zonas de cobertura, horarios, costos): responde con la información del negocio.

*Reglas importantes:*
• Usa *un solo asterisco pegado al texto* para negrita en WhatsApp.
• NUNCA inventes el estado de un pedido. Siempre llama a consultar_estado_pedido para obtener la información real.
• Si el cliente no sabe su número de pedido, indícale cómo encontrarlo: "Tu número de pedido empieza con ND- y lo tienes en el comprobante que te llegó por correo o en la app."
• Llama a actualizar_datos_cliente cuando obtengas el nombre del cliente.
• Respuestas breves, directas y tranquilizadoras. 2–3 emojis por mensaje (🚚 📦 ✅ 📍 ⏱️).
• Termina SIEMPRE con una acción concreta ("¿Tienes el número de pedido a mano?", "¿Hay algo más en lo que te pueda ayudar?").`;
}

async function obtenerContexto() {
  return [];
}

async function ejecutarFuncion(toolCall, _contexto, helpers) {
  const args = JSON.parse(toolCall.function.arguments || "{}");
  const { numero, updateLead, updateDatosBot, ESTADOS_LEAD, notificarInteresNegocio } = helpers;

  if (toolCall.function.name === "actualizar_datos_cliente") {
    const cambios = { estadoLead: ESTADOS_LEAD.EN_CONVERSACION };
    if (args.nombre) cambios.nombre = args.nombre;
    if (args.observaciones) await updateDatosBot(numero, { observaciones: args.observaciones });
    await updateLead(numero, cambios);
    return null;
  }

  if (toolCall.function.name === "consultar_estado_pedido") {
    const numPedido = String(args.numeroPedido || "").trim();
    const pedido = pedidos.find((p) => p.numeroPedido.toLowerCase() === numPedido.toLowerCase());
    await updateDatosBot(numero, { ultimaConsulta: numPedido });

    if (!pedido) {
      await notificarInteresNegocio(
        `Consultó pedido no encontrado (${numPedido}) en demo de delivery — interesado en tener su propio bot`
      );
      return `No encontré ningún pedido con el número *${numPedido}*. Esta es una demostración de ProShop — los pedidos de ejemplo son *ND-1001* al *ND-1007*. Prueba con alguno de esos.\n\n¿Te gustaría tener un bot de rastreo conectado al sistema real de tu negocio? 🚀`;
    }

    return `*Pedido ${pedido.numeroPedido}* — ${pedido.estado}\n\n${pedido.detalle}\n\n_(Actualizado: ${pedido.ultimaActualizacion})_`;
  }

  if (toolCall.function.name === "derivar_a_asesor") {
    await updateLead(numero, { estadoLead: ESTADOS_LEAD.DERIVADO });
    await notificarInteresNegocio("Solicitó hablar con un encargado durante la demo de delivery");
    return "Entendido, te conecto con un encargado para resolver esto personalmente. Por favor espera unos momentos. 📦";
  }

  return null;
}

module.exports = {
  id: "delivery",
  nombre: "Delivery / Logística",
  tools: TOOLS,
  systemPrompt,
  obtenerContexto,
  ejecutarFuncion,
};
