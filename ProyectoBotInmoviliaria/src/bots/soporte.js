const business = require("../config/soporte.json");
const faqs = require("../config/soporte-faqs.json");

const TIMEZONE = "America/La_Paz";
const NOMBRE_BOT = "Teo";

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
          producto: { type: "string", description: "Producto o servicio afectado" },
          observaciones: { type: "string", description: "Descripción del problema" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "abrir_ticket",
      description: "Abre un ticket de soporte cuando el problema no se resolvió con las soluciones conocidas, o el cliente pide que quede registrado formalmente.",
      parameters: {
        type: "object",
        properties: {
          categoria: { type: "string", description: "Categoría del problema (Cuenta, Facturación, App, Conexión, Pagos, etc.)" },
          descripcion: { type: "string", description: "Descripción clara del problema" },
          urgencia: { type: "string", enum: ["baja", "media", "alta"], description: "Nivel de urgencia según el impacto en el cliente" },
        },
        required: ["descripcion"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "derivar_a_asesor",
      description: "Deriva a un encargado humano SOLO si el cliente lo pide, está muy molesto, o el problema es crítico (pérdida de datos, seguridad comprometida).",
      parameters: { type: "object", properties: { motivo: { type: "string" } } },
    },
  },
];

function formatearFaqs(lista) {
  if (!lista.length) return "No hay soluciones cargadas en la base de conocimiento.";
  const porCategoria = {};
  for (const f of lista) {
    porCategoria[f.categoria] = porCategoria[f.categoria] || [];
    porCategoria[f.categoria].push(f);
  }
  return Object.entries(porCategoria)
    .map(
      ([cat, items]) =>
        `*${cat}:*\n` +
        items.map((f) => `  • [${f.idFaq}] "${f.problema}"\n    → ${f.solucion}`).join("\n")
    )
    .join("\n\n");
}

function datosConocidos(lead = {}) {
  const campos = [];
  if (lead.nombre) campos.push(`• Nombre: ${lead.nombre}`);
  const datosBot = lead.datosBot || {};
  if (datosBot.producto) campos.push(`• Producto/servicio afectado: ${datosBot.producto}`);
  if (datosBot.observaciones) campos.push(`• Problema reportado: ${datosBot.observaciones}`);
  if (!campos.length) return "Primera interacción — aún no hay datos del cliente.";
  return campos.join("\n");
}

function systemPrompt(catalogo = [], lead = {}) {
  const hoy = new Date();
  const fechaTexto = hoy.toLocaleDateString("es-BO", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: TIMEZONE });
  const horaTexto = hoy.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE });

  return `Eres ${NOMBRE_BOT}, el asistente de soporte técnico de *${business.nombreNegocio}*.

CONTEXTO DE DEMO: esta conversación es una *demostración de ProShop*, empresa que crea agentes de WhatsApp con IA. *${business.nombreNegocio}* es ficticio y existe para mostrar cómo funciona un bot de soporte real. Actúa con naturalidad — el aviso de demo aparece automáticamente cuando se abre un ticket, no lo menciones antes. Si preguntan si es real, explica que es una demo de ProShop.

Fecha y hora actual (Bolivia): *${fechaTexto}, ${horaTexto}*.

*Datos del negocio:*
• Horarios de atención: ${business.horarios}
• Canales disponibles: ${business.canales}
• Comunicación: ${business.estiloComunicacion}

*Lo que ya sabes de este cliente (NO lo vuelvas a preguntar):*
${datosConocidos(lead)}

*Base de soluciones conocidas* (úsalas antes de abrir un ticket, no inventes soluciones externas):
${formatearFaqs(catalogo)}

*Tu flujo de soporte:*
1. Identifica el problema con 1–2 preguntas cerradas y directas.
2. Busca si el problema coincide con alguna solución de la base de conocimiento.
3. Si hay solución: entrégala de forma clara, en pasos numerados.
4. Si el cliente confirma que la solución no funcionó, o el problema no está en la base: llama a abrir_ticket.
5. Si es urgente o crítico: deriva con derivar_a_asesor.

*Reglas importantes:*
• Usa *un solo asterisco pegado al texto* para negrita en WhatsApp.
• NUNCA inventes soluciones técnicas que no estén en la base de conocimiento. Si no lo sabes, abre un ticket.
• Llama a actualizar_datos_cliente cada vez que el cliente dé su nombre, producto afectado o detalles del problema.
• Antes de abrir un ticket, intenta al menos una solución de la base si aplica.
• Respuestas breves, claras y directas al punto. 2–3 emojis por mensaje (🔧 ✅ 📱 💡 🛠️).
• Termina SIEMPRE con una acción concreta ("¿Probaste eso? Cuéntame cómo te fue.", "¿Abro un ticket para que un técnico lo revise?").`;
}

async function obtenerContexto() {
  return faqs.filter((f) => f.disponible === "si");
}

async function ejecutarFuncion(toolCall, _contexto, helpers) {
  const args = JSON.parse(toolCall.function.arguments || "{}");
  const { numero, updateLead, updateDatosBot, ESTADOS_LEAD, notificarInteresNegocio } = helpers;

  if (toolCall.function.name === "actualizar_datos_cliente") {
    const cambios = { estadoLead: ESTADOS_LEAD.EN_CONVERSACION };
    if (args.nombre) cambios.nombre = args.nombre;
    await updateDatosBot(numero, { producto: args.producto, observaciones: args.observaciones });
    await updateLead(numero, cambios);
    return null;
  }

  if (toolCall.function.name === "abrir_ticket") {
    await updateDatosBot(numero, { ultimoTicket: args.descripcion, categoria: args.categoria, urgencia: args.urgencia });
    await updateLead(numero, { estadoLead: ESTADOS_LEAD.INTERESADO_COTIZACION });
    await notificarInteresNegocio(
      `Abrió ticket en demo de soporte (${args.categoria || "—"}: ${args.descripcion || "—"}, urgencia: ${args.urgencia || "—"}) — interesado en tener su propio bot`
    );
    return `✅ *¡Así funciona en un bot real!*\n\nAcabas de ver cómo *${business.nombreNegocio}* registra un ticket. En un sistema real, el ticket se asignaría automáticamente al área técnica correspondiente y el cliente recibiría un número de seguimiento.\n\n¿Te gustaría tener un asistente de soporte así para tu negocio? Cuéntame tu nombre y rubro y te cotizamos sin compromiso. 🚀`;
  }

  if (toolCall.function.name === "derivar_a_asesor") {
    await updateLead(numero, { estadoLead: ESTADOS_LEAD.DERIVADO });
    await notificarInteresNegocio("Solicitó hablar con un encargado durante la demo de soporte");
    return "Entendido, te conecto con un especialista ahora mismo. Por favor espera unos momentos. 🔧";
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
