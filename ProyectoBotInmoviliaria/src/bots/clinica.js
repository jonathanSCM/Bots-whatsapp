const business = require("../config/clinica.json");
const servicios = require("../config/clinica-servicios.json");

const TIMEZONE = "America/La_Paz";
const NOMBRE_BOT = "Valeria";

const TOOLS = [
  {
    type: "function",
    function: {
      name: "actualizar_datos_cliente",
      description: "Guarda o actualiza los datos del paciente a medida que se obtienen en la conversación. Llamar cada vez que el paciente entregue un dato nuevo.",
      parameters: {
        type: "object",
        properties: {
          nombre: { type: "string" },
          especialidad: { type: "string", description: "Especialidad o servicio de interés" },
          motivoConsulta: { type: "string", description: "Motivo general de la consulta, sin detalles clínicos sensibles" },
          observaciones: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agendar_cita",
      description: "Agenda una cita médica cuando el paciente confirmó especialidad, fecha y hora deseadas.",
      parameters: {
        type: "object",
        properties: {
          especialidad: { type: "string" },
          fecha: { type: "string", description: "Formato YYYY-MM-DD" },
          hora: { type: "string", description: "Formato HH:MM (24hs)" },
        },
        required: ["especialidad", "fecha", "hora"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "derivar_a_asesor",
      description: "Deriva a un encargado humano SOLO cuando el paciente lo pide explícitamente, está molesto, o hay una urgencia/emergencia médica real.",
      parameters: { type: "object", properties: { motivo: { type: "string" } } },
    },
  },
];

function formatearServicios(lista) {
  if (!lista.length) return "No hay servicios disponibles en este momento.";
  const porEspecialidad = {};
  for (const item of lista) {
    porEspecialidad[item.especialidad] = porEspecialidad[item.especialidad] || [];
    porEspecialidad[item.especialidad].push(item);
  }
  return Object.entries(porEspecialidad)
    .map(
      ([esp, items]) =>
        `*${esp}:*\n` +
        items.map((i) => `  • [${i.idServicio}] ${i.nombre} — ${i.precio} (${i.duracion}) — ${i.descripcion}`).join("\n")
    )
    .join("\n\n");
}

function datosConocidos(lead = {}) {
  const campos = [];
  if (lead.nombre) campos.push(`• Nombre: ${lead.nombre}`);
  const datosBot = lead.datosBot || {};
  if (datosBot.especialidad) campos.push(`• Especialidad consultada: ${datosBot.especialidad}`);
  if (datosBot.motivoConsulta) campos.push(`• Motivo: ${datosBot.motivoConsulta}`);
  if (!campos.length) return "Primera interacción — aún no hay datos del paciente.";
  return campos.join("\n");
}

function systemPrompt(catalogo = [], lead = {}) {
  const hoy = new Date();
  const fechaTexto = hoy.toLocaleDateString("es-BO", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: TIMEZONE });
  const horaTexto = hoy.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE });
  const fechaISO = hoy.toLocaleDateString("en-CA", { timeZone: TIMEZONE });

  return `Eres ${NOMBRE_BOT}, la asistente virtual de *${business.nombreNegocio}*.

CONTEXTO DE DEMO: esta conversación es una *demostración de ProShop*, empresa que desarrolla agentes de WhatsApp con IA para negocios. *${business.nombreNegocio}* es un negocio ficticio creado para mostrar cómo funciona el bot en una clínica real. Actúa con total naturalidad como si fuera un bot real — el sistema muestra el aviso de demo automáticamente cuando el paciente confirma una cita, tú no lo menciones antes. Si alguien pregunta directamente si es real, sé honesto/a: explica que es una demo de ProShop y que pueden cotizar su propio bot.

Fecha y hora actual (Bolivia, America/La_Paz): *${fechaTexto}, ${horaTexto}* (${fechaISO}). Úsala para calcular fechas relativas ("mañana", "el viernes", etc.) antes de llamar a agendar_cita.

*Datos del negocio:*
• Horarios de atención: ${business.horarios}
• Dirección: ${business.direccion}
• Métodos de pago: ${business.metodosPago}
• Comunicación: ${business.estiloComunicacion}

*Lo que ya sabes de este paciente (NO lo vuelvas a preguntar):*
${datosConocidos(lead)}

*Especialidades y servicios disponibles* (únicos y reales, no inventes otros):
${formatearServicios(catalogo)}

*Tu flujo de atención:*
1. Saludo cálido con presentación breve si es primer contacto.
2. Pregunta por qué consulta hoy (motivo general, sin pedir detalles clínicos sensibles).
3. Identifica qué especialidad/servicio le conviene y presenta las opciones disponibles con precio y duración.
4. Confirma especialidad, fecha y hora, y agenda la cita.

*Reglas importantes:*
• Usa *un solo asterisco pegado al texto* para negrita en WhatsApp. Nunca doble asterisco ni # titulos.
• Solo menciona servicios y precios de la lista de arriba. Si no existe lo que pide, dilo con amabilidad y sugiere la alternativa más cercana.
• Llama a actualizar_datos_cliente cada vez que el paciente dé un dato nuevo (nombre, especialidad, motivo).
• Para agendar cita, confirma especialidad + fecha + hora en lenguaje natural y LUEGO llama a agendar_cita con la fecha en formato YYYY-MM-DD.
• NO pidas datos sensibles innecesarios (historial médico completo, diagnósticos previos, etc.). Solo nombre, especialidad y motivo general.
• Si detectas una emergencia médica real, deriva de inmediato y recomienda acudir a urgencias.
• Usa derivar_a_asesor solo si el paciente lo pide, está molesto, o es una urgencia fuera de tu alcance.
• Respuestas breves, cálidas y tranquilizadoras. 2–3 emojis por mensaje (🏥 😊 📅 ✅ 💊).
• Termina SIEMPRE con una acción concreta ("¿Agendamos para el [día]?", "¿Qué fecha te viene bien?").`;
}

async function obtenerContexto() {
  return servicios.filter((s) => s.disponible === "si");
}

async function ejecutarFuncion(toolCall, _contexto, helpers) {
  const args = JSON.parse(toolCall.function.arguments || "{}");
  const { numero, updateLead, updateDatosBot, ESTADOS_LEAD, notificarInteresNegocio } = helpers;

  if (toolCall.function.name === "actualizar_datos_cliente") {
    const cambios = { estadoLead: ESTADOS_LEAD.EN_CONVERSACION };
    if (args.nombre) cambios.nombre = args.nombre;
    await updateDatosBot(numero, { especialidad: args.especialidad, motivoConsulta: args.motivoConsulta, observaciones: args.observaciones });
    await updateLead(numero, cambios);
    return null;
  }

  if (toolCall.function.name === "agendar_cita") {
    await updateLead(numero, { estadoLead: ESTADOS_LEAD.INTERESADO_COTIZACION });
    await notificarInteresNegocio(
      `Agendó cita en demo de clínica (${args.especialidad || "—"}, ${args.fecha || "—"} ${args.hora || "—"}) — interesado en tener su propio bot`
    );
    return `✅ *¡Así funciona en un bot real!*\n\nAcabas de ver el flujo de agendamiento de *${business.nombreNegocio}*. En un bot real, esta cita quedaría registrada en tu sistema de gestión y el paciente recibiría una confirmación automática.\n\n¿Te gustaría tener un asistente así para tu clínica o negocio? Cuéntame tu nombre y a qué te dedicas y te armo una propuesta sin costo. 🚀`;
  }

  if (toolCall.function.name === "derivar_a_asesor") {
    await updateLead(numero, { estadoLead: ESTADOS_LEAD.DERIVADO });
    await notificarInteresNegocio("Solicitó hablar con un encargado durante la demo de clínica");
    return "Entendido, voy a conectarte con un encargado para darte atención personalizada. Por favor espera unos momentos. 😊";
  }

  return null;
}

module.exports = {
  id: "clinica",
  nombre: "Clínica / Salud",
  tools: TOOLS,
  systemPrompt,
  obtenerContexto,
  ejecutarFuncion,
};
