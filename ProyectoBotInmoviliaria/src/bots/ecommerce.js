const business = require("../config/ecommerce.json");
const productos = require("../config/ecommerce-productos.json");

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
          zonaEnvio: { type: "string" },
          observaciones: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "confirmar_pedido",
      description: "Confirma un pedido cuando el cliente ya eligio que productos quiere comprar.",
      parameters: {
        type: "object",
        properties: {
          productos: { type: "string", description: "Lista de productos elegidos con cantidad, en texto, ej: '1x Audífonos Pulse, 2x Power bank'" },
          total: { type: "string", description: "Monto total estimado en bolivianos" },
        },
        required: ["productos"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "derivar_a_asesor",
      description: "Deriva la conversacion a un encargado humano cuando el cliente lo pide, esta molesto, o la consulta esta fuera de alcance (ej. reclamos, cambios/devoluciones).",
      parameters: { type: "object", properties: { motivo: { type: "string" } } },
    },
  },
];

function formatearProductos(lista) {
  if (!lista.length) return "No hay productos cargados actualmente en el sistema.";
  const porCategoria = {};
  for (const item of lista) {
    porCategoria[item.categoria] = porCategoria[item.categoria] || [];
    porCategoria[item.categoria].push(item);
  }
  return Object.entries(porCategoria)
    .map(
      ([categoria, items]) =>
        `${categoria}:\n` + items.map((i) => `  - [${i.idProducto}] ${i.nombre} - ${i.precio} - ${i.descripcion}`).join("\n")
    )
    .join("\n");
}

function systemPrompt(catalogo = []) {
  return `Eres el asistente virtual de "${business.nombreNegocio}", una tienda online.

IMPORTANTE: esta es una DEMOSTRACIÓN de ProShop (empresa que crea agentes de WhatsApp con IA). "${business.nombreNegocio}" y su catálogo son ficticios, solo existen para mostrar cómo se comportaría un bot real. Conversa con normalidad como si fueras el bot de una tienda real (recomendando productos, armando el pedido, etc.) — el sistema se encarga de aclarar que es una demo en el momento en que el cliente confirma un pedido, tú no necesitas mencionarlo antes de eso. Si el cliente pregunta directamente si esto es real, sé honesto: dile que es una demostración de ProShop y que si quiere un bot así para su propio negocio puede pedir una cotización.

Informacion del negocio:
- Horarios: ${business.horarios}
- Zonas de envio: ${business.zonasEnvio.join(", ")}
- Metodos de pago: ${business.metodosPago}
- Estilo de comunicacion: ${business.estiloComunicacion}

Catálogo disponible ahora mismo (esta es la UNICA fuente real del catálogo, no existen otros productos):
${formatearProductos(catalogo)}

Reglas obligatorias:
- Solo puedes mencionar, describir u ofrecer los productos listados arriba, con sus precios exactos. No inventes productos ni precios.
- Si el cliente pide algo que no esta en el catálogo, dilo honestamente y sugiere alternativas reales.
- No pidas datos sensibles innecesarios (solo nombre, zona de envio y preferencias).
- Usa derivar_a_asesor SOLO si: el cliente lo pide explicitamente, esta molesto, o la consulta esta fuera de alcance (reclamos, cambios o devoluciones).
- derivar_a_asesor es la excepcion, no la regla.
- Cuando obtengas un dato nuevo del cliente llama a actualizar_datos_cliente.
- Cuando el cliente confirme que productos quiere llevar, llama a confirmar_pedido con el detalle y el total estimado.
- Mantén las respuestas breves, entusiastas y orientadas a ayudar a decidir.`;
}

async function obtenerContexto() {
  return productos.filter((p) => p.disponible === "si");
}

// helpers: { numero, updateLead, updateDatosBot, ESTADOS_LEAD, notificarInteresNegocio }
async function ejecutarFuncion(toolCall, _contexto, helpers) {
  const args = JSON.parse(toolCall.function.arguments || "{}");
  const { numero, updateLead, updateDatosBot, ESTADOS_LEAD, notificarInteresNegocio } = helpers;

  if (toolCall.function.name === "actualizar_datos_cliente") {
    await updateDatosBot(numero, args);
    await updateLead(numero, { nombre: args.nombre, estadoLead: ESTADOS_LEAD.EN_CONVERSACION });
    return null;
  }

  if (toolCall.function.name === "confirmar_pedido") {
    // Es solo una demostracion: no existe una tienda real, asi que no se
    // procesa ningun pedido ni cobro. Se aclara y se registra como lead caliente.
    await updateDatosBot(numero, { ultimoPedido: args.productos, totalEstimado: args.total });
    await updateLead(numero, { estadoLead: ESTADOS_LEAD.INTERESADO_COTIZACION });
    await notificarInteresNegocio(
      `Intento confirmar un pedido en la demo (${args.productos || "-"}${args.total ? ", total " + args.total : ""}) - cliente interesado en tener su propio bot`
    );
    return "Esto que acabas de ver es una demostración del bot de Tienda Online, así que no procesa pedidos ni cobros reales. Si te gustaría tener un asistente así para tu propio negocio, ¿agendamos una reunión breve para cotizarlo? Cuéntame tu nombre y a qué negocio representas y te contactamos.";
  }

  if (toolCall.function.name === "derivar_a_asesor") {
    await updateLead(numero, { estadoLead: ESTADOS_LEAD.DERIVADO });
    await notificarInteresNegocio("Pidio hablar con un encargado durante la demo de tienda online");
    return "Perfecto, voy a derivarte con un encargado para que pueda ayudarte con mas detalle. Por favor espera unos momentos.";
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
