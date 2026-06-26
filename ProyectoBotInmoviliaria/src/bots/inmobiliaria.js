const business = require("../config/business.json");
const { obtenerPropiedadesDisponibles } = require("../services/sheets");
const { enviarImagen } = require("../services/whatsapp");

const TIMEZONE_NEGOCIO = "America/La_Paz";

const TOOLS = [
  {
    type: "function",
    function: {
      name: "actualizar_datos_lead",
      description: "Guarda o actualiza los datos del prospecto a medida que se obtienen en la conversacion. Llamar cada vez que el usuario entregue un dato nuevo.",
      parameters: {
        type: "object",
        properties: {
          nombre: { type: "string" },
          tipoOperacion: { type: "string", enum: ["venta", "alquiler"] },
          tipoPropiedad: { type: "string" },
          zonaInteres: { type: "string" },
          presupuesto: { type: "string" },
          dormitorios: { type: "string" },
          observaciones: { type: "string" },
          nivelInteres: { type: "string", enum: ["frio", "tibio", "caliente"] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agendar_visita",
      description: "Agenda una visita cuando el usuario confirmo fecha y hora deseada.",
      parameters: {
        type: "object",
        properties: {
          fecha: { type: "string", description: "Formato YYYY-MM-DD" },
          hora: { type: "string", description: "Formato HH:MM 24hs" },
        },
        required: ["fecha", "hora"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "enviar_fotos_propiedad",
      description: "Envia las fotos de una propiedad especifica por WhatsApp cuando el cliente pide ver fotos o imagenes de una propiedad. Usa el idPropiedad exacto de la lista de propiedades disponibles.",
      parameters: {
        type: "object",
        properties: { idPropiedad: { type: "string", description: "ID exacto de la propiedad, ej: P001" } },
        required: ["idPropiedad"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "derivar_a_asesor",
      description: "Deriva la conversacion a un asesor humano cuando el cliente lo pide, tiene alta intencion de compra/alquiler, el bot no tiene informacion suficiente, o la consulta esta fuera de alcance.",
      parameters: { type: "object", properties: { motivo: { type: "string" } } },
    },
  },
];

function formatearPropiedades(propiedades) {
  if (!propiedades.length) return "No hay propiedades cargadas actualmente en el sistema.";
  return propiedades
    .map((p) => `- [${p.idPropiedad}] ${p.tipo} en ${p.operacion} - Zona: ${p.zona} - Precio: ${p.precio} - Dormitorios: ${p.dormitorios || "N/A"} - ${p.descripcion}`)
    .join("\n");
}

function systemPrompt(propiedades = []) {
  const hoy = new Date();
  const fechaHoyTexto = hoy.toLocaleDateString("es-BO", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: TIMEZONE_NEGOCIO });
  const horaActualTexto = hoy.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE_NEGOCIO });
  const fechaHoyISO = hoy.toLocaleDateString("en-CA", { timeZone: TIMEZONE_NEGOCIO });

  return `Eres el asistente virtual de "${business.nombreNegocio}", una inmobiliaria.

IMPORTANTE: esta es una DEMOSTRACIÓN de ProShop (empresa que crea agentes de WhatsApp con IA). "${business.nombreNegocio}" y sus propiedades son ficticias, solo existen para mostrar cómo se comportaría un bot real. Conversa con normalidad como si fueras el bot de una inmobiliaria real (calificando al prospecto, mostrando propiedades, etc.) — el sistema se encarga de aclarar que es una demo en el momento en que el cliente intenta agendar una visita, tú no necesitas mencionarlo antes de eso. Si el cliente pregunta directamente si esto es real, sé honesto: dile que es una demostración de ProShop y que si quiere un bot así para su propio negocio puede pedir una cotización.

Fecha y hora actual en Bolivia (zona horaria America/La_Paz): hoy es ${fechaHoyTexto}, son las ${horaActualTexto} (${fechaHoyISO}). Usa esta fecha como referencia para calcular "mañana", "el lunes que viene", "este fin de semana", etc. Siempre que el usuario de una fecha relativa, calcula la fecha real en formato YYYY-MM-DD antes de llamar a agendar_visita.

Informacion comercial disponible:
- Horarios de atencion: ${business.horarios}
- Zonas atendidas: ${business.zonas.join(", ")}
- Tipos de propiedad: ${business.tiposPropiedad.join(", ")}
- Requisitos para alquiler: ${business.requisitosAlquiler}
- Requisitos para compra: ${business.requisitosCompra}
- Estilo de comunicacion: ${business.estiloComunicacion}

Propiedades disponibles ahora mismo (esta es la UNICA fuente real de propiedades, no existen otras):
${formatearPropiedades(propiedades)}

Reglas obligatorias:
- Solo puedes mencionar, describir u ofrecer las propiedades listadas arriba. No inventes propiedades, precios, zonas o disponibilidad que no esten en esa lista.
- Si el cliente busca algo que no calza con ninguna propiedad disponible, dilo honestamente y ofrece derivar a un asesor o avisarle cuando haya novedades.
- No cierres ventas directamente, tu rol es calificar al prospecto y agendar visitas o derivar a un asesor.
- No pidas datos sensibles innecesarios (solo nombre, contacto y preferencias de busqueda).
- Usa derivar_a_asesor SOLO si: el cliente lo pide explicitamente, esta molesto o insiste, o la consulta esta totalmente fuera de tu alcance.
- derivar_a_asesor es la excepcion, no la regla. En la gran mayoria de mensajes NO debes llamarla.
- Cuando obtengas un dato nuevo del prospecto llama a actualizar_datos_lead.
- Para agendar una visita, primero confirma fecha y hora con el usuario en lenguaje natural, y luego llama a agendar_visita.
- Si el cliente pide ver fotos de una propiedad, llama a enviar_fotos_propiedad con el idPropiedad exacto.
- Mantén las respuestas breves, amables y profesionales.`;
}

async function obtenerContexto() {
  return obtenerPropiedadesDisponibles();
}

// helpers: { numero, getOrCreateLead, updateLead, ESTADOS_LEAD, notificarInteresNegocio }
async function ejecutarFuncion(toolCall, contexto, helpers) {
  const args = JSON.parse(toolCall.function.arguments || "{}");
  const { numero, updateLead, ESTADOS_LEAD, notificarInteresNegocio } = helpers;

  if (toolCall.function.name === "actualizar_datos_lead") {
    updateLead(numero, { ...args, estadoLead: ESTADOS_LEAD.EN_CONVERSACION });
    return null;
  }

  if (toolCall.function.name === "agendar_visita") {
    // Es solo una demostracion: no existe una inmobiliaria ni una propiedad
    // real, asi que no se agenda nada. Se aclara y se registra como lead caliente.
    updateLead(numero, { estadoLead: ESTADOS_LEAD.INTERESADO_COTIZACION });
    await notificarInteresNegocio(`Intento agendar una visita en la demo (${args.fecha || "-"} ${args.hora || "-"}) - cliente interesado en tener su propio bot`);
    return "Esto que acabas de ver es una demostración del bot Inmobiliario, así que no agenda visitas reales. Si te gustaría tener un asistente así para tu propio negocio, ¿agendamos una reunión breve para cotizarlo? Cuéntame tu nombre y a qué negocio representas y te contactamos.";
  }

  if (toolCall.function.name === "enviar_fotos_propiedad") {
    const propiedad = contexto.find((p) => p.idPropiedad === args.idPropiedad);
    if (!propiedad) return "No encontre esa propiedad para mostrarte las fotos.";
    if (!propiedad.linkFotos) return `Por ahora no tengo fotos cargadas de la propiedad ${propiedad.idPropiedad}, pero puedo darte mas detalles.`;

    const links = propiedad.linkFotos.split(",").map((l) => l.trim()).filter(Boolean);
    for (const link of links) {
      await enviarImagen(numero, link, `${propiedad.tipo} en ${propiedad.operacion} - ${propiedad.zona}`);
    }
    return "Te envie las fotos de la propiedad. ¿Que te parecio?";
  }

  if (toolCall.function.name === "derivar_a_asesor") {
    updateLead(numero, { estadoLead: ESTADOS_LEAD.DERIVADO });
    await notificarInteresNegocio("Pidio hablar con un asesor durante la demo");
    return "Perfecto, voy a derivarte con un asesor para que pueda ayudarte con mas detalle. Por favor espera unos momentos.";
  }

  return null;
}

module.exports = {
  id: "inmobiliaria",
  nombre: "Inmobiliaria",
  tools: TOOLS,
  systemPrompt,
  obtenerContexto,
  ejecutarFuncion,
};
