const business = require("../config/delivery.json");
const pedidos = require("../config/delivery-pedidos.json");

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
          observaciones: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_estado_pedido",
      description: "Consulta el estado de un pedido cuando el cliente da su numero de pedido.",
      parameters: {
        type: "object",
        properties: { numeroPedido: { type: "string", description: "Numero exacto del pedido, ej: ND-1001" } },
        required: ["numeroPedido"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "derivar_a_asesor",
      description: "Deriva la conversacion a un encargado humano cuando el cliente lo pide, esta molesto, o hay un reclamo (pedido perdido, dañado, muy demorado).",
      parameters: { type: "object", properties: { motivo: { type: "string" } } },
    },
  },
];

function systemPrompt() {
  return `Eres el asistente virtual de "${business.nombreNegocio}", un servicio de delivery y logística.

IMPORTANTE: esta es una DEMOSTRACIÓN de ProShop (empresa que crea agentes de WhatsApp con IA). "${business.nombreNegocio}" y sus pedidos son ficticios, solo existen para mostrar cómo se comportaría un bot real de rastreo de pedidos. Conversa con normalidad como si fueras el bot de logística de un negocio real. Si el cliente pregunta directamente si esto es real, sé honesto: dile que es una demostración de ProShop y que si quiere un bot así para su propio negocio puede pedir una cotización.

Informacion del negocio:
- Horarios: ${business.horarios}
- Zonas de cobertura: ${business.zonasCobertura.join(", ")}
- Estilo de comunicacion: ${business.estiloComunicacion}

Reglas obligatorias:
- Cuando el cliente de un numero de pedido (formato ND-####), llama a consultar_estado_pedido con ese numero exacto. NUNCA inventes el estado de un pedido por tu cuenta, el sistema te lo va a dar.
- Si el cliente no sabe su numero de pedido, pideselo de forma directa (ej: "Claro, pásame tu número de pedido, empieza con ND- y lo tienes en tu comprobante de compra").
- No pidas datos sensibles innecesarios (solo nombre y numero de pedido).
- Usa derivar_a_asesor SOLO si: el cliente lo pide explicitamente, esta molesto, o reporta un problema real (pedido perdido, dañado, o muy demorado mas alla de lo informado).
- derivar_a_asesor es la excepcion, no la regla.
- Cuando obtengas un dato nuevo del cliente llama a actualizar_datos_cliente.
- Mantén las respuestas breves, directas y tranquilizadoras.`;
}

async function obtenerContexto() {
  return [];
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

  if (toolCall.function.name === "consultar_estado_pedido") {
    // Esta consulta SI es real dentro de la demo: busca en los pedidos de
    // ejemplo cargados localmente (no requiere intervencion de ProShop).
    const pedido = pedidos.find((p) => p.numeroPedido.toLowerCase() === String(args.numeroPedido || "").toLowerCase());
    await updateDatosBot(numero, { ultimaConsulta: args.numeroPedido });
    if (!pedido) {
      return `No encontré ningún pedido con el número ${args.numeroPedido}. Esta es una demostración de ProShop, así que solo existen los pedidos de ejemplo del catálogo de prueba (puedes probar con ND-1001, ND-1002, ND-1003 o ND-1004). Si quieres un bot así conectado a tu sistema real de pedidos, podemos cotizártelo.`;
    }
    return `Pedido ${pedido.numeroPedido}: *${pedido.estado}*. ${pedido.detalle} (actualizado ${pedido.ultimaActualizacion}).`;
  }

  if (toolCall.function.name === "derivar_a_asesor") {
    await updateLead(numero, { estadoLead: ESTADOS_LEAD.DERIVADO });
    await notificarInteresNegocio("Pidio hablar con un encargado durante la demo de delivery");
    return "Perfecto, voy a derivarte con un encargado para que pueda ayudarte con mas detalle. Por favor espera unos momentos.";
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
