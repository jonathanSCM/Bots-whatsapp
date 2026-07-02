const business = require("../config/clinica.json");
const servicios = require("../config/clinica-servicios.json");

const TIMEZONE_NEGOCIO = "America/La_Paz";

const TOOLS = [
  {
    type: "function",
    function: {
      name: "actualizar_datos_cliente",
      description: "Guarda o actualiza los datos del paciente a medida que se obtienen en la conversacion.",
      parameters: {
        type: "object",
        properties: {
          nombre: { type: "string" },
          especialidad: { type: "string" },
          motivoConsulta: { type: "string" },
          observaciones: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agendar_cita",
      description: "Agenda una cita cuando el paciente confirmo especialidad, fecha y hora.",
      parameters: {
        type: "object",
        properties: {
          especialidad: { type: "string" },
          fecha: { type: "string", description: "Formato YYYY-MM-DD" },
          hora: { type: "string", description: "Formato HH:MM 24hs" },
        },
        required: ["especialidad", "fecha", "hora"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "derivar_a_asesor",
      description: "Deriva la conversacion a un encargado humano cuando el paciente lo pide, esta molesto, o hay una urgencia/consulta fuera de alcance.",
      parameters: { type: "object", properties: { motivo: { type: "string" } } },
    },
  },
];

function formatearServicios(lista) {
  if (!lista.length) return "No hay servicios cargados actualmente en el sistema.";
  const porEspecialidad = {};
  for (const item of lista) {
    porEspecialidad[item.especialidad] = porEspecialidad[item.especialidad] || [];
    porEspecialidad[item.especialidad].push(item);
  }
  return Object.entries(porEspecialidad)
    .map(
      ([especialidad, items]) =>
        `${especialidad}:\n` + items.map((i) => `  - [${i.idServicio}] ${i.nombre} - ${i.precio} (${i.duracion}) - ${i.descripcion}`).join("\n")
    )
    .join("\n");
}

function systemPrompt(catalogo = []) {
  const hoy = new Date();
  const fechaHoyTexto = hoy.toLocaleDateString("es-BO", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: TIMEZONE_NEGOCIO });
  const horaActualTexto = hoy.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE_NEGOCIO });
  const fechaHoyISO = hoy.toLocaleDateString("en-CA", { timeZone: TIMEZONE_NEGOCIO });

  return `Eres el asistente virtual de "${business.nombreNegocio}", una clínica de salud.

IMPORTANTE: esta es una DEMOSTRACIÓN de ProShop (empresa que crea agentes de WhatsApp con IA). "${business.nombreNegocio}" y sus servicios son ficticios, solo existen para mostrar cómo se comportaría un bot real. Conversa con normalidad como si fueras el bot de una clínica real (orientando sobre especialidades, agendando citas, etc.) — el sistema se encarga de aclarar que es una demo en el momento en que el paciente confirma una cita, tú no necesitas mencionarlo antes de eso. Si el paciente pregunta directamente si esto es real, sé honesto: dile que es una demostración de ProShop y que si quiere un bot así para su propio negocio puede pedir una cotización.

Fecha y hora actual en Bolivia (zona horaria America/La_Paz): hoy es ${fechaHoyTexto}, son las ${horaActualTexto} (${fechaHoyISO}). Usa esta fecha como referencia para calcular fechas relativas ("mañana", "este viernes", etc). Siempre calcula la fecha real en formato YYYY-MM-DD antes de llamar a agendar_cita.

Informacion del negocio:
- Horarios de atencion: ${business.horarios}
- Direccion: ${business.direccion}
- Metodos de pago: ${business.metodosPago}
- Estilo de comunicacion: ${business.estiloComunicacion}

Servicios y especialidades disponibles ahora mismo (esta es la UNICA fuente real, no existen otros):
${formatearServicios(catalogo)}

Reglas obligatorias:
- Solo puedes mencionar, describir u ofrecer los servicios listados arriba, con sus precios exactos. No inventes especialidades ni precios.
- Si el paciente pide algo que no esta en la lista, dilo honestamente y sugiere alternativas reales.
- No pidas datos sensibles innecesarios (solo nombre, especialidad y motivo general de consulta, nunca detalles clinicos delicados).
- Usa derivar_a_asesor SOLO si: el paciente lo pide explicitamente, esta molesto, o es una urgencia/consulta fuera de alcance (ej. una emergencia medica real). Si detectas una emergencia real, deriva de inmediato y recomienda acudir a un servicio de urgencias.
- derivar_a_asesor es la excepcion, no la regla.
- Cuando obtengas un dato nuevo del paciente llama a actualizar_datos_cliente.
- Para agendar una cita, primero confirma especialidad, fecha y hora en lenguaje natural, y luego llama a agendar_cita.
- Mantén las respuestas breves, claras y tranquilizadoras.`;
}

async function obtenerContexto() {
  return servicios.filter((s) => s.disponible === "si");
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

  if (toolCall.function.name === "agendar_cita") {
    // Es solo una demostracion: no existe una clinica real, asi que no se
    // agenda nada. Se aclara y se registra como lead caliente para ProShop.
    await updateLead(numero, { estadoLead: ESTADOS_LEAD.INTERESADO_COTIZACION });
    await notificarInteresNegocio(
      `Intento agendar una cita en la demo (${args.especialidad || "-"}, ${args.fecha || "-"} ${args.hora || "-"}) - cliente interesado en tener su propio bot`
    );
    return "Esto que acabas de ver es una demostración del bot de Clínica, así que no agenda citas reales. Si te gustaría tener un asistente así para tu propio negocio, ¿agendamos una reunión breve para cotizarlo? Cuéntame tu nombre y a qué negocio representas y te contactamos.";
  }

  if (toolCall.function.name === "derivar_a_asesor") {
    await updateLead(numero, { estadoLead: ESTADOS_LEAD.DERIVADO });
    await notificarInteresNegocio("Pidio hablar con un encargado durante la demo de clinica");
    return "Perfecto, voy a derivarte con un encargado para que pueda ayudarte con mas detalle. Por favor espera unos momentos.";
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
