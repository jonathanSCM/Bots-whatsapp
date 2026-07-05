const business = require("../config/gimnasio.json");
const planes = require("../config/gimnasio-planes.json");

const TIMEZONE = "America/La_Paz";
const NOMBRE_BOT = "Max";

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
          objetivo: { type: "string", description: "Objetivo del cliente: bajar de peso, ganar músculo, mantenerse activo, salud, etc." },
          observaciones: { type: "string", description: "Condiciones físicas, horarios preferidos u otras preferencias" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "inscribir_plan",
      description: "Inscribe al cliente cuando ya eligió el plan de membresía que quiere tomar.",
      parameters: {
        type: "object",
        properties: {
          idPlan: { type: "string", description: "ID exacto del plan, ej: G002" },
        },
        required: ["idPlan"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "derivar_a_asesor",
      description: "Deriva a un encargado SOLO si el cliente lo pide, está molesto, o tiene condiciones médicas que requieren evaluación especializada.",
      parameters: { type: "object", properties: { motivo: { type: "string" } } },
    },
  },
];

function formatearPlanes(lista) {
  if (!lista.length) return "No hay planes disponibles en este momento.";
  return lista.map((p) => `  • [${p.idPlan}] *${p.nombre}* — ${p.precio}\n    ${p.descripcion}`).join("\n\n");
}

function datosConocidos(lead = {}) {
  const campos = [];
  if (lead.nombre) campos.push(`• Nombre: ${lead.nombre}`);
  const datosBot = lead.datosBot || {};
  if (datosBot.objetivo) campos.push(`• Objetivo: ${datosBot.objetivo}`);
  if (datosBot.planElegido) campos.push(`• Plan visto: ${datosBot.planElegido}`);
  if (datosBot.observaciones) campos.push(`• Preferencias: ${datosBot.observaciones}`);
  if (!campos.length) return "Primera interacción — aún no hay datos del cliente.";
  return campos.join("\n");
}

function systemPrompt(catalogo = [], lead = {}) {
  const hoy = new Date();
  const fechaTexto = hoy.toLocaleDateString("es-BO", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: TIMEZONE });
  const horaTexto = hoy.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE });

  return `Eres ${NOMBRE_BOT}, el asesor de membresías de *${business.nombreNegocio}*.

CONTEXTO DE DEMO: esta conversación es una *demostración de ProShop*, empresa que crea agentes de WhatsApp con IA. *${business.nombreNegocio}* es un gimnasio ficticio para mostrar cómo funciona el bot en un negocio real. Actúa con naturalidad — el aviso de demo se muestra automáticamente cuando el cliente confirma una inscripción, no lo menciones antes. Si preguntan si es real, explica que es una demo de ProShop.

Fecha y hora actual (Bolivia): *${fechaTexto}, ${horaTexto}*.

*Datos del negocio:*
• Horarios: ${business.horarios}
• Dirección: ${business.direccion}
• Métodos de pago: ${business.metodosPago}
• Comunicación: ${business.estiloComunicacion}

*Lo que ya sabes de este cliente (NO lo vuelvas a preguntar):*
${datosConocidos(lead)}

*Planes disponibles* (únicos y reales, no inventes otros ni cambies precios):
${formatearPlanes(catalogo)}

*Cómo asesoras al cliente:*
1. Pregunta su objetivo principal (bajar de peso, ganar músculo, salud general, deporte específico).
2. Con el objetivo claro, recomienda el plan más conveniente y explica POR QUÉ le conviene a él/ella.
3. Muestra el precio y lo que incluye. Si tiene dudas, resuelve con entusiasmo y energía.
4. Cuando confirme el plan que quiere: llama a inscribir_plan con el idPlan exacto.

*Reglas importantes:*
• Usa *un solo asterisco pegado al texto* para negrita en WhatsApp.
• Solo menciona los planes de la lista de arriba con sus precios exactos.
• Llama a actualizar_datos_cliente cada vez que obtengas nombre, objetivo o preferencias.
• No pidas datos médicos sensibles; si el cliente menciona condiciones (diabetes, lesiones graves), deriva a un asesor presencial.
• Sé motivador/a, energético/a y cercano/a. 2–3 emojis por mensaje (💪 🏋️ 🔥 ✅ 🎯).
• Termina SIEMPRE con una acción concreta ("¿Lo anotamos en el Plan Full?", "¿Empezamos esta semana?").`;
}

async function obtenerContexto() {
  return planes.filter((p) => p.disponible === "si");
}

async function ejecutarFuncion(toolCall, contexto, helpers) {
  const args = JSON.parse(toolCall.function.arguments || "{}");
  const { numero, updateLead, updateDatosBot, ESTADOS_LEAD, notificarInteresNegocio } = helpers;

  if (toolCall.function.name === "actualizar_datos_cliente") {
    const cambios = { estadoLead: ESTADOS_LEAD.EN_CONVERSACION };
    if (args.nombre) cambios.nombre = args.nombre;
    await updateDatosBot(numero, { objetivo: args.objetivo, observaciones: args.observaciones });
    await updateLead(numero, cambios);
    return null;
  }

  if (toolCall.function.name === "inscribir_plan") {
    const plan = contexto.find((p) => p.idPlan === args.idPlan);
    await updateDatosBot(numero, { planElegido: plan ? plan.nombre : args.idPlan });
    await updateLead(numero, { estadoLead: ESTADOS_LEAD.INTERESADO_COTIZACION });
    await notificarInteresNegocio(
      `Eligió plan en demo de gimnasio (${plan ? plan.nombre : args.idPlan}) — interesado en tener su propio bot`
    );
    return `✅ *¡Así funciona en un bot real!*\n\nAcabas de ver el flujo de inscripción de *${business.nombreNegocio}*. En un gimnasio real, el cliente quedaría registrado en el sistema, recibiría sus accesos y un bienvenida personalizada automáticamente.\n\n¿Te gustaría tener un asistente de ventas así para tu negocio? Cuéntame tu nombre y rubro y te armo una propuesta sin costo. 🚀`;
  }

  if (toolCall.function.name === "derivar_a_asesor") {
    await updateLead(numero, { estadoLead: ESTADOS_LEAD.DERIVADO });
    await notificarInteresNegocio("Solicitó hablar con un encargado durante la demo de gimnasio");
    return "¡Claro! Te conecto con uno de nuestros asesores para darte atención personalizada. Por favor espera unos momentos. 💪";
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
