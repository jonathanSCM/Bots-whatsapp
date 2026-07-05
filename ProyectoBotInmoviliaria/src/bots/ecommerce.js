const business = require("../config/ecommerce.json");
const productos = require("../config/ecommerce-productos.json");

const TIMEZONE = "America/La_Paz";
const NOMBRE_BOT = "Nimbo";

const TOOLS = [
  {
    type: "function",
    function: {
      name: "actualizar_datos_cliente",
      description: "Guarda o actualiza los datos del cliente a medida que se obtienen en la conversación. Llamar cada vez que el cliente dé un dato nuevo.",
      parameters: {
        type: "object",
        properties: {
          nombre: { type: "string" },
          zonaEnvio: { type: "string", description: "Zona o dirección de envío" },
          observaciones: { type: "string", description: "Preferencias o requerimientos especiales" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "confirmar_pedido",
      description: "Confirma el pedido cuando el cliente ya eligió los productos que quiere comprar y está listo para proceder.",
      parameters: {
        type: "object",
        properties: {
          productos: { type: "string", description: "Lista de productos y cantidades, ej: '1x Audífonos Pulse Pro, 2x Power bank'" },
          total: { type: "string", description: "Total estimado en bolivianos" },
        },
        required: ["productos"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "derivar_a_asesor",
      description: "Deriva a un encargado humano SOLO si el cliente lo pide, está molesto, o tiene reclamos/devoluciones complejas.",
      parameters: { type: "object", properties: { motivo: { type: "string" } } },
    },
  },
];

function formatearProductos(lista) {
  if (!lista.length) return "No hay productos disponibles en este momento.";
  const porCategoria = {};
  for (const item of lista) {
    porCategoria[item.categoria] = porCategoria[item.categoria] || [];
    porCategoria[item.categoria].push(item);
  }
  return Object.entries(porCategoria)
    .map(
      ([cat, items]) =>
        `*${cat}:*\n` +
        items.map((i) => `  • [${i.idProducto}] ${i.nombre} — ${i.precio}\n    ${i.descripcion}`).join("\n")
    )
    .join("\n\n");
}

function datosConocidos(lead = {}) {
  const campos = [];
  if (lead.nombre) campos.push(`• Nombre: ${lead.nombre}`);
  const datosBot = lead.datosBot || {};
  if (datosBot.zonaEnvio) campos.push(`• Zona de envío: ${datosBot.zonaEnvio}`);
  if (datosBot.observaciones) campos.push(`• Preferencias: ${datosBot.observaciones}`);
  if (!campos.length) return "Primera interacción — aún no hay datos del cliente.";
  return campos.join("\n");
}

function systemPrompt(catalogo = [], lead = {}) {
  const hoy = new Date();
  const fechaTexto = hoy.toLocaleDateString("es-BO", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: TIMEZONE });
  const horaTexto = hoy.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE });

  return `Eres ${NOMBRE_BOT}, el asistente de ventas de *${business.nombreNegocio}*, tienda de tecnología y accesorios.

CONTEXTO DE DEMO: esta conversación es una *demostración de ProShop*, empresa que crea agentes de WhatsApp con IA para negocios. *${business.nombreNegocio}* es un negocio ficticio creado para mostrar cómo funciona el bot en una tienda online real. Actúa con naturalidad como si fuera un bot real — el aviso de demo se muestra automáticamente cuando el cliente confirma un pedido, tú no lo menciones antes. Si preguntan si es real, sé honesto: es una demo de ProShop.

Fecha y hora actual (Bolivia): *${fechaTexto}, ${horaTexto}*.

*Datos del negocio:*
• Horarios: ${business.horarios}
• Zonas con envío: ${business.zonasEnvio.join(", ")}
• Métodos de pago: ${business.metodosPago}
• Comunicación: ${business.estiloComunicacion}

*Lo que ya sabes de este cliente (NO lo vuelvas a preguntar):*
${datosConocidos(lead)}

*Catálogo disponible* (únicos y reales, no inventes productos ni precios):
${formatearProductos(catalogo)}

*Cómo ayudas al cliente:*
1. Si no sabe qué busca: pregunta para qué necesita el producto (regalo, uso personal, trabajo, deporte) y recomienda la mejor opción del catálogo.
2. Si ya sabe qué quiere: confirma el producto, da detalles adicionales si los pide, y guía al cierre.
3. Cuando el cliente confirme qué quiere llevar: llama a confirmar_pedido con los detalles.

*Reglas importantes:*
• Usa *un solo asterisco pegado al texto* para negrita en WhatsApp.
• Solo menciona productos de la lista de arriba, con sus precios exactos. No inventes stock, variantes ni precios.
• Llama a actualizar_datos_cliente cada vez que obtengas un dato nuevo.
• Sé proactivo: si el cliente pregunta por algo que no está en el catálogo, sugiere la alternativa más cercana con entusiasmo ("No tenemos X, pero el Y hace lo mismo y cuesta menos, ¿lo vemos?").
• Mantén las respuestas cortas, entusiastas y orientadas a decidir. 2–3 emojis por mensaje (🛍️ ✅ 🎧 💡 🚀).
• Termina SIEMPRE con una acción concreta ("¿Lo agrego a tu pedido?", "¿Te mando los detalles del envío?").`;
}

async function obtenerContexto() {
  return productos.filter((p) => p.disponible === "si");
}

async function ejecutarFuncion(toolCall, _contexto, helpers) {
  const args = JSON.parse(toolCall.function.arguments || "{}");
  const { numero, updateLead, updateDatosBot, ESTADOS_LEAD, notificarInteresNegocio } = helpers;

  if (toolCall.function.name === "actualizar_datos_cliente") {
    const cambios = { estadoLead: ESTADOS_LEAD.EN_CONVERSACION };
    if (args.nombre) cambios.nombre = args.nombre;
    if (args.zonaEnvio) cambios.zonaDelivery = args.zonaEnvio;
    await updateDatosBot(numero, { zonaEnvio: args.zonaEnvio, observaciones: args.observaciones });
    await updateLead(numero, cambios);
    return null;
  }

  if (toolCall.function.name === "confirmar_pedido") {
    await updateDatosBot(numero, { ultimoPedido: args.productos, totalEstimado: args.total });
    await updateLead(numero, { estadoLead: ESTADOS_LEAD.INTERESADO_COTIZACION });
    await notificarInteresNegocio(
      `Confirmó pedido en demo de tienda online (${args.productos || "—"}${args.total ? ", total " + args.total : ""}) — interesado en tener su propio bot`
    );
    return `✅ *¡Así funciona en un bot real!*\n\nAcabas de ver el flujo de compra de *${business.nombreNegocio}*. En un bot real, este pedido se registraría en tu sistema, se confirmaría el pago y se generaría la guía de envío automáticamente.\n\n¿Te gustaría tener un asistente de ventas así para tu negocio? Cuéntame tu nombre y a qué te dedicas y te armo una propuesta sin costo. 🚀`;
  }

  if (toolCall.function.name === "derivar_a_asesor") {
    await updateLead(numero, { estadoLead: ESTADOS_LEAD.DERIVADO });
    await notificarInteresNegocio("Solicitó hablar con un encargado durante la demo de tienda online");
    return "Entendido, te conecto con un encargado ahora mismo para ayudarte mejor. Por favor espera unos momentos. 😊";
  }

  return null;
}

module.exports = {
  id: "ecommerce",
  nombre: "Tienda Online",
  tools: TOOLS,
  systemPrompt,
  obtenerContexto,
  ejecutarFuncion,
};
