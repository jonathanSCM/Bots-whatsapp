const business = require("../config/academia.json");
const cursos = require("../config/academia-cursos.json");

const TOOLS = [
  {
    type: "function",
    function: {
      name: "actualizar_datos_cliente",
      description: "Guarda o actualiza los datos del interesado a medida que se obtienen en la conversacion.",
      parameters: {
        type: "object",
        properties: {
          nombre: { type: "string" },
          areaInteres: { type: "string" },
          observaciones: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "matricular_curso",
      description: "Matricula al interesado cuando ya eligio el curso y la modalidad.",
      parameters: {
        type: "object",
        properties: {
          idCurso: { type: "string", description: "ID exacto del curso, ej: C001" },
          modalidad: { type: "string" },
        },
        required: ["idCurso"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "derivar_a_asesor",
      description: "Deriva la conversacion a un encargado humano cuando el interesado lo pide, esta molesto, o la consulta esta fuera de alcance (ej. convalidaciones, becas).",
      parameters: { type: "object", properties: { motivo: { type: "string" } } },
    },
  },
];

function formatearCursos(lista) {
  if (!lista.length) return "No hay cursos cargados actualmente en el sistema.";
  const porArea = {};
  for (const item of lista) {
    porArea[item.area] = porArea[item.area] || [];
    porArea[item.area].push(item);
  }
  return Object.entries(porArea)
    .map(
      ([area, items]) =>
        `${area}:\n` + items.map((i) => `  - [${i.idCurso}] ${i.nombre} - ${i.precio} - ${i.duracion} - ${i.modalidad} - ${i.descripcion}`).join("\n")
    )
    .join("\n");
}

function systemPrompt(catalogo = []) {
  return `Eres el asistente virtual de "${business.nombreNegocio}", una academia de cursos.

IMPORTANTE: esta es una DEMOSTRACIÓN de ProShop (empresa que crea agentes de WhatsApp con IA). "${business.nombreNegocio}" y sus cursos son ficticios, solo existen para mostrar cómo se comportaría un bot real. Conversa con normalidad como si fueras el bot de una academia real (informando programas, matriculando alumnos, etc.) — el sistema se encarga de aclarar que es una demo en el momento en que el interesado confirma una matrícula, tú no necesitas mencionarlo antes de eso. Si el interesado pregunta directamente si esto es real, sé honesto: dile que es una demostración de ProShop y que si quiere un bot así para su propio negocio puede pedir una cotización.

Informacion del negocio:
- Horarios: ${business.horarios}
- Direccion: ${business.direccion}
- Metodos de pago: ${business.metodosPago}
- Estilo de comunicacion: ${business.estiloComunicacion}

Cursos disponibles ahora mismo (esta es la UNICA fuente real, no inventes cursos ni precios):
${formatearCursos(catalogo)}

Reglas obligatorias:
- Solo puedes mencionar, describir u ofrecer los cursos listados arriba, con sus precios exactos.
- No pidas datos sensibles innecesarios (solo nombre y area de interes).
- Usa derivar_a_asesor SOLO si: el interesado lo pide explicitamente, esta molesto, o pide algo fuera de alcance (convalidaciones, becas, casos especiales).
- derivar_a_asesor es la excepcion, no la regla.
- Cuando obtengas un dato nuevo del interesado llama a actualizar_datos_cliente.
- Cuando el interesado confirme que curso y modalidad quiere, llama a matricular_curso.
- Mantén las respuestas breves, motivadoras y claras.`;
}

async function obtenerContexto() {
  return cursos.filter((c) => c.disponible === "si");
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

  if (toolCall.function.name === "matricular_curso") {
    const curso = contexto.find((c) => c.idCurso === args.idCurso);
    // Es solo una demostracion: no existe una academia real, asi que no se
    // procesa ninguna matricula real. Se aclara y se registra como lead caliente.
    await updateDatosBot(numero, { cursoElegido: curso ? curso.nombre : args.idCurso, modalidad: args.modalidad });
    await updateLead(numero, { estadoLead: ESTADOS_LEAD.INTERESADO_COTIZACION });
    await notificarInteresNegocio(
      `Intento matricularse en la demo (${curso ? curso.nombre : args.idCurso}${args.modalidad ? ", " + args.modalidad : ""}) - cliente interesado en tener su propio bot`
    );
    return "Esto que acabas de ver es una demostración del bot de Academia, así que no procesa matrículas reales. Si te gustaría tener un asistente así para tu propio negocio, ¿agendamos una reunión breve para cotizarlo? Cuéntame tu nombre y a qué negocio representas y te contactamos.";
  }

  if (toolCall.function.name === "derivar_a_asesor") {
    await updateLead(numero, { estadoLead: ESTADOS_LEAD.DERIVADO });
    await notificarInteresNegocio("Pidio hablar con un encargado durante la demo de academia");
    return "Perfecto, voy a derivarte con un encargado para que pueda ayudarte con mas detalle. Por favor espera unos momentos.";
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
