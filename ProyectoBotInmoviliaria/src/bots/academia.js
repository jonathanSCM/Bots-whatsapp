const business = require("../config/academia.json");
const cursos = require("../config/academia-cursos.json");

const TIMEZONE = "America/La_Paz";
const NOMBRE_BOT = "Nova";

const TOOLS = [
  {
    type: "function",
    function: {
      name: "actualizar_datos_cliente",
      description: "Guarda o actualiza los datos del interesado a medida que se obtienen. Llamar cada vez que el interesado dé un dato nuevo.",
      parameters: {
        type: "object",
        properties: {
          nombre: { type: "string" },
          areaInteres: { type: "string", description: "Área de interés: Tecnología, Diseño, Negocios, Idiomas, etc." },
          nivelExperiencia: { type: "string", description: "Nivel actual: principiante, intermedio o avanzado" },
          observaciones: { type: "string", description: "Motivaciones, objetivos profesionales o preferencias de horario" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "matricular_curso",
      description: "Matricula al interesado cuando ya eligió el curso y la modalidad que prefiere.",
      parameters: {
        type: "object",
        properties: {
          idCurso: { type: "string", description: "ID exacto del curso, ej: C001" },
          modalidad: { type: "string", description: "Presencial, Online o ambas" },
        },
        required: ["idCurso"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "derivar_a_asesor",
      description: "Deriva a un asesor académico SOLO si el interesado lo pide, está molesto, o tiene consultas especiales (becas, convalidaciones, planes corporativos).",
      parameters: { type: "object", properties: { motivo: { type: "string" } } },
    },
  },
];

function formatearCursos(lista) {
  if (!lista.length) return "No hay cursos disponibles en este momento.";
  const porArea = {};
  for (const c of lista) {
    porArea[c.area] = porArea[c.area] || [];
    porArea[c.area].push(c);
  }
  return Object.entries(porArea)
    .map(
      ([area, items]) =>
        `*${area}:*\n` +
        items
          .map(
            (c) =>
              `  • [${c.idCurso}] *${c.nombre}* — ${c.precio} — ${c.duracion} — ${c.modalidad}\n    ${c.descripcion}`
          )
          .join("\n")
    )
    .join("\n\n");
}

function datosConocidos(lead = {}) {
  const campos = [];
  if (lead.nombre) campos.push(`• Nombre: ${lead.nombre}`);
  const datosBot = lead.datosBot || {};
  if (datosBot.areaInteres) campos.push(`• Área de interés: ${datosBot.areaInteres}`);
  if (datosBot.nivelExperiencia) campos.push(`• Nivel: ${datosBot.nivelExperiencia}`);
  if (datosBot.cursoElegido) campos.push(`• Curso visto: ${datosBot.cursoElegido}`);
  if (datosBot.observaciones) campos.push(`• Objetivos: ${datosBot.observaciones}`);
  if (!campos.length) return "Primera interacción — aún no hay datos del interesado.";
  return campos.join("\n");
}

function systemPrompt(catalogo = [], lead = {}) {
  const hoy = new Date();
  const fechaTexto = hoy.toLocaleDateString("es-BO", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: TIMEZONE });
  const horaTexto = hoy.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE });

  return `Eres ${NOMBRE_BOT}, la asesora académica de *${business.nombreNegocio}*.

CONTEXTO DE DEMO: esta conversación es una *demostración de ProShop*, empresa que crea agentes de WhatsApp con IA. *${business.nombreNegocio}* es una academia ficticia para mostrar cómo funciona el bot en una institución educativa real. Actúa con naturalidad — el aviso de demo se muestra automáticamente cuando el interesado confirma una matrícula, no lo menciones antes. Si preguntan si es real, explica que es una demo de ProShop.

Fecha y hora actual (Bolivia): *${fechaTexto}, ${horaTexto}*.

*Datos del negocio:*
• Horarios: ${business.horarios}
• Dirección: ${business.direccion}
• Métodos de pago: ${business.metodosPago}
• Comunicación: ${business.estiloComunicacion}

*Lo que ya sabes de este interesado (NO lo vuelvas a preguntar):*
${datosConocidos(lead)}

*Cursos disponibles* (únicos y reales, no inventes cursos ni precios):
${formatearCursos(catalogo)}

*Cómo asesoras al interesado:*
1. Pregunta qué quiere aprender y para qué (trabajo, emprendimiento, habilidad nueva).
2. Si no sabe por dónde empezar, pregunta su área de interés y nivel actual y recomienda el curso más adecuado.
3. Explica qué va a lograr con el curso, no solo lo que va a aprender.
4. Cuando confirme el curso y la modalidad: llama a matricular_curso.

*Reglas importantes:*
• Usa *un solo asterisco pegado al texto* para negrita en WhatsApp.
• Solo menciona los cursos de la lista con sus precios, duración y modalidad exactos.
• Llama a actualizar_datos_cliente cuando obtengas nombre, área de interés, nivel o motivaciones.
• Enfócate en los RESULTADOS del curso (trabajo, freelance, ascenso), no solo en el contenido técnico.
• Para becas, planes corporativos o convalidaciones: deriva con derivar_a_asesor.
• Respuestas motivadoras, claras y entusiastas. 2–3 emojis por mensaje (🎓 ✅ 💡 🚀 📚).
• Termina SIEMPRE con una acción concreta ("¿Empezamos con ese curso?", "¿Reservo tu lugar en la próxima cohorte?").`;
}

async function obtenerContexto() {
  return cursos.filter((c) => c.disponible === "si");
}

async function ejecutarFuncion(toolCall, contexto, helpers) {
  const args = JSON.parse(toolCall.function.arguments || "{}");
  const { numero, updateLead, updateDatosBot, ESTADOS_LEAD, notificarInteresNegocio } = helpers;

  if (toolCall.function.name === "actualizar_datos_cliente") {
    const cambios = { estadoLead: ESTADOS_LEAD.EN_CONVERSACION };
    if (args.nombre) cambios.nombre = args.nombre;
    await updateDatosBot(numero, { areaInteres: args.areaInteres, nivelExperiencia: args.nivelExperiencia, observaciones: args.observaciones });
    await updateLead(numero, cambios);
    return null;
  }

  if (toolCall.function.name === "matricular_curso") {
    const curso = contexto.find((c) => c.idCurso === args.idCurso);
    await updateDatosBot(numero, { cursoElegido: curso ? curso.nombre : args.idCurso, modalidad: args.modalidad });
    await updateLead(numero, { estadoLead: ESTADOS_LEAD.INTERESADO_COTIZACION });
    await notificarInteresNegocio(
      `Se matriculó en demo de academia (${curso ? curso.nombre : args.idCurso}${args.modalidad ? ", " + args.modalidad : ""}) — interesado en tener su propio bot`
    );
    return `✅ *¡Así funciona en un bot real!*\n\nAcabas de ver el flujo de matrícula de *${business.nombreNegocio}*. En una academia real, el alumno recibiría la confirmación de inscripción, acceso a la plataforma y bienvenida del instructor automáticamente.\n\n¿Te gustaría tener un asistente de matrículas así para tu academia o negocio? Cuéntame tu nombre y rubro y te armo una propuesta sin costo. 🚀`;
  }

  if (toolCall.function.name === "derivar_a_asesor") {
    await updateLead(numero, { estadoLead: ESTADOS_LEAD.DERIVADO });
    await notificarInteresNegocio("Solicitó hablar con un asesor académico durante la demo");
    return "¡Claro! Te conecto con una de nuestras asesoras académicas para atenderte en detalle. Por favor espera unos momentos. 🎓";
  }

  return null;
}

module.exports = {
  id: "academia",
  nombre: "Academia / Cursos",
  tools: TOOLS,
  systemPrompt,
  obtenerContexto,
  ejecutarFuncion,
};
