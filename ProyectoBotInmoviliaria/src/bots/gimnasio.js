const business = require("../config/gimnasio.json");
const planes = require("../config/gimnasio-planes.json");

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
          objetivo: { type: "string", description: "Objetivo del cliente: bajar de peso, ganar masa, salud general, etc." },
          observaciones: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "inscribir_plan",
      description: "Inscribe al cliente cuando ya eligio el plan de membresia que quiere.",
      parameters: {
        type: "object",
        properties: { idPlan: { type: "string", description: "ID exacto del plan, ej: G001" } },
        required: ["idPlan"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "derivar_a_asesor",
      description: "Deriva la conversacion a un encargado humano cuando el cliente lo pide, esta molesto, o la consulta esta fuera de alcance.",
      parameters: { type: "object", properties: { motivo: { type: "string" } } },
    },
  },
];

function formatearPlanes(lista) {
  if (!lista.length) return "No hay planes cargados actualmente en el sistema.";
  return lista.map((p) => `  - [${p.idPlan}] ${p.nombre} - ${p.precio} - ${p.descripcion}`).join("\n");
}

function systemPrompt(catalogo = []) {
  return `Eres el asistente virtual de "${business.nombreNegocio}", un gimnasio.

IMPORTANTE: esta es una DEMOSTRACIÓN de ProShop (empresa que crea agentes de WhatsApp con IA). "${business.nombreNegocio}" y sus planes son ficticios, solo existen para mostrar cómo se comportaría un bot real. Conversa con normalidad como si fueras el bot de un gimnasio real (recomendando planes, motivando al cliente, etc.) — el sistema se encarga de aclarar que es una demo en el momento en que el cliente confirma una inscripción, tú no necesitas mencionarlo antes de eso. Si el cliente pregunta directamente si esto es real, sé honesto: dile que es una demostración de ProShop y que si quiere un bot así para su propio negocio puede pedir una cotización.

Informacion del negocio:
- Horarios: ${business.horarios}
- Direccion: ${business.direccion}
- Metodos de pago: ${business.metodosPago}
- Estilo de comunicacion: ${business.estiloComunicacion}

Planes disponibles ahora mismo (esta es la UNICA fuente real de planes y precios, no existen otros):
${formatearPlanes(catalogo)}

Reglas obligatorias:
- Solo puedes mencionar, describir u ofrecer los planes listados arriba, con sus precios exactos. No inventes planes ni precios.
- Pregunta el objetivo del cliente para recomendar el plan que mas le conviene.
- No pidas datos sensibles innecesarios (solo nombre y objetivo).
- Usa derivar_a_asesor SOLO si: el cliente lo pide explicitamente, esta molesto, o la consulta esta fuera de alcance (ej. lesiones, temas medicos).
- derivar_a_asesor es la excepcion, no la regla.
- Cuando obtengas un dato nuevo del cliente llama a actualizar_datos_cliente.
- Cuando el cliente confirme que plan quiere, llama a inscribir_plan con el idPlan exacto.
- Mantén las respuestas breves, motivadoras y con buena energía.`;
}

async function obtenerContexto() {
  return planes.filter((p) => p.disponible === "si");
}

// helpers: { numero, updateLead, updateDatosBot, ESTADOS_LEAD, notificarInteresNegocio }
async function ejecutarFuncion(toolCall, contexto, helpers) {
  const args = JSON.parse(toolCall.function.arguments || "{}");
  const { numero, updateLead, updateDatosBot, ESTADOS_LEAD, notificarInteresNegocio } = helpers;

  if (toolCall.function.name === "actualizar_datos_cliente") {
    await updateDatosBot(numero, args);
    await updateLead(numero, { nombre: args.nombre, estadoLead: ESTADOS_LEAD.EN_CONVERSACION });
    return null;
  }

  if (toolCall.function.name === "inscribir_plan") {
    const plan = contexto.find((p) => p.idPlan === args.idPlan);
    // Es solo una demostracion: no existe un gimnasio real, asi que no se
    // procesa ninguna inscripcion real. Se aclara y se registra como lead caliente.
    await updateDatosBot(numero, { planElegido: plan ? plan.nombre : args.idPlan });
    await updateLead(numero, { estadoLead: ESTADOS_LEAD.INTERESADO_COTIZACION });
    await notificarInteresNegocio(
      `Intento inscribirse a un plan en la demo (${plan ? plan.nombre : args.idPlan}) - cliente interesado en tener su propio bot`
    );
    return "Esto que acabas de ver es una demostración del bot de Gimnasio, así que no procesa inscripciones reales. Si te gustaría tener un asistente así para tu propio negocio, ¿agendamos una reunión breve para cotizarlo? Cuéntame tu nombre y a qué negocio representas y te contactamos.";
  }

  if (toolCall.function.name === "derivar_a_asesor") {
    await updateLead(numero, { estadoLead: ESTADOS_LEAD.DERIVADO });
    await notificarInteresNegocio("Pidio hablar con un encargado durante la demo de gimnasio");
    return "Perfecto, voy a derivarte con un encargado para que pueda ayudarte con mas detalle. Por favor espera unos momentos.";
  }

  return null;
}

module.exports = {
  id: "gimnasio",
  nombre: "Gimnasio",
  tools: TOOLS,
  systemPrompt,
  obtenerContexto,
  ejecutarFuncion,
};
