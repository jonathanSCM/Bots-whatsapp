const business = require("../config/soporte.json");
const faqs = require("../config/soporte-faqs.json");

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
          producto: { type: "string", description: "Producto o servicio afectado" },
          observaciones: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "abrir_ticket",
      description: "Abre un ticket de soporte cuando el problema no se resolvio con las soluciones conocidas, o el cliente pide que quede registrado formalmente.",
      parameters: {
        type: "object",
        properties: {
          categoria: { type: "string" },
          descripcion: { type: "string" },
          urgencia: { type: "string", enum: ["baja", "media", "alta"] },
        },
        required: ["descripcion"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "derivar_a_asesor",
      description: "Deriva la conversacion a un encargado humano cuando el cliente lo pide, esta molesto, o el problema es critico/fuera de alcance.",
      parameters: { type: "object", properties: { motivo: { type: "string" } } },
    },
  },
];

function formatearFaqs(lista) {
  if (!lista.length) return "No hay soluciones cargadas actualmente en el sistema.";
  return lista.map((f) => `  - [${f.idFaq}] (${f.categoria}) "${f.problema}" -> ${f.solucion}`).join("\n");
}

function systemPrompt(catalogo = []) {
  return `Eres el asistente virtual de soporte técnico de "${business.nombreNegocio}".

IMPORTANTE: esta es una DEMOSTRACIÓN de ProShop (empresa que crea agentes de WhatsApp con IA). "${business.nombreNegocio}" es ficticio, solo existe para mostrar cómo se comportaría un bot real de soporte. Conversa con normalidad como si fueras el bot de soporte de un negocio real (diagnosticando el problema, dando la solución conocida, etc.) — el sistema se encarga de aclarar que es una demo en el momento en que se abre un ticket, tú no necesitas mencionarlo antes de eso. Si el cliente pregunta directamente si esto es real, sé honesto: dile que es una demostración de ProShop y que si quiere un bot así para su propio negocio puede pedir una cotización.

Informacion del negocio:
- Horarios de atencion: ${business.horarios}
- Canales: ${business.canales}
- Estilo de comunicacion: ${business.estiloComunicacion}

Base de soluciones conocidas (esta es la UNICA fuente real, no inventes soluciones que no esten aqui):
${formatearFaqs(catalogo)}

Reglas obligatorias:
- Primero intenta entender el problema con 1-2 preguntas cortas y cerradas, y busca si calza con alguna solucion conocida de la lista de arriba.
- Si encuentras una solucion que calza, dala de forma clara y en pasos numerados.
- Si NINGUNA solucion conocida calza con el problema, o el cliente dice que ya lo intento y no funciono, llama a abrir_ticket con la descripcion del problema.
- No inventes soluciones tecnicas que no esten en la base de conocimiento.
- Usa derivar_a_asesor SOLO si: el cliente lo pide explicitamente, esta muy molesto, o es un caso critico (ej. perdida de datos, problema de seguridad).
- derivar_a_asesor es la excepcion, no la regla.
- Cuando obtengas un dato nuevo del cliente llama a actualizar_datos_cliente.
- Mantén las respuestas breves, claras y resolutivas.`;
}

async function obtenerContexto() {
  return faqs.filter((f) => f.disponible === "si");
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

  if (toolCall.function.name === "abrir_ticket") {
    // Es solo una demostracion: no existe una mesa de soporte real, asi que
    // no se abre ningun ticket real. Se aclara y se registra como lead caliente.
    await updateDatosBot(numero, { ultimoTicket: args.descripcion, categoria: args.categoria, urgencia: args.urgencia });
    await updateLead(numero, { estadoLead: ESTADOS_LEAD.INTERESADO_COTIZACION });
    await notificarInteresNegocio(
      `Intento abrir un ticket en la demo (${args.categoria || "-"}: ${args.descripcion || "-"}) - cliente interesado en tener su propio bot`
    );
    return "Esto que acabas de ver es una demostración del bot de Soporte Técnico, así que no abre tickets reales. Si te gustaría tener un asistente así para tu propio negocio, ¿agendamos una reunión breve para cotizarlo? Cuéntame tu nombre y a qué negocio representas y te contactamos.";
  }

  if (toolCall.function.name === "derivar_a_asesor") {
    await updateLead(numero, { estadoLead: ESTADOS_LEAD.DERIVADO });
    await notificarInteresNegocio("Pidio hablar con un encargado durante la demo de soporte tecnico");
    return "Perfecto, voy a derivarte con un encargado para que pueda ayudarte con mas detalle. Por favor espera unos momentos.";
  }

  return null;
}

module.exports = {
  id: "soporte",
  nombre: "Soporte Técnico",
  tools: TOOLS,
  systemPrompt,
  obtenerContexto,
  ejecutarFuncion,
};
