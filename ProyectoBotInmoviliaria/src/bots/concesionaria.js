const business = require("../config/concesionaria.json");
const vehiculos = require("../config/concesionaria-vehiculos.json");

const TIMEZONE = "America/La_Paz";
const NOMBRE_BOT = "Carlos";

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
          tipoVehiculoInteres: { type: "string", description: "Tipo de vehículo que busca: sedán, SUV, pickup, eléctrico, etc." },
          usoVehiculo: { type: "string", description: "Para qué usará el vehículo: ciudad, familia, trabajo, off-road, etc." },
          observaciones: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agendar_test_drive",
      description: "Agenda un test drive cuando el cliente confirmó el vehículo de interés, la fecha y la hora.",
      parameters: {
        type: "object",
        properties: {
          idVehiculo: { type: "string", description: "ID exacto del vehículo, ej: V002" },
          fecha: { type: "string", description: "Formato YYYY-MM-DD" },
          hora: { type: "string", description: "Formato HH:MM (24hs)" },
        },
        required: ["idVehiculo", "fecha", "hora"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "derivar_a_asesor",
      description: "Deriva a un asesor humano SOLO si el cliente lo pide, está molesto, o necesita evaluación de financiamiento/trade-in que requiere criterio humano.",
      parameters: { type: "object", properties: { motivo: { type: "string" } } },
    },
  },
];

function formatearVehiculos(lista) {
  if (!lista.length) return "No hay vehículos disponibles en este momento.";
  const porTipo = {};
  for (const v of lista) {
    porTipo[v.tipo] = porTipo[v.tipo] || [];
    porTipo[v.tipo].push(v);
  }
  return Object.entries(porTipo)
    .map(
      ([tipo, items]) =>
        `*${tipo}:*\n` +
        items.map((v) => `  • [${v.idVehiculo}] *${v.nombre}* — ${v.precio}\n    ${v.descripcion}`).join("\n")
    )
    .join("\n\n");
}

function datosConocidos(lead = {}) {
  const campos = [];
  if (lead.nombre) campos.push(`• Nombre: ${lead.nombre}`);
  const datosBot = lead.datosBot || {};
  if (datosBot.tipoVehiculoInteres) campos.push(`• Tipo buscado: ${datosBot.tipoVehiculoInteres}`);
  if (datosBot.usoVehiculo) campos.push(`• Uso principal: ${datosBot.usoVehiculo}`);
  if (datosBot.observaciones) campos.push(`• Preferencias: ${datosBot.observaciones}`);
  if (!campos.length) return "Primera interacción — aún no hay datos del cliente.";
  return campos.join("\n");
}

function systemPrompt(catalogo = [], lead = {}) {
  const hoy = new Date();
  const fechaTexto = hoy.toLocaleDateString("es-BO", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: TIMEZONE });
  const horaTexto = hoy.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE });
  const fechaISO = hoy.toLocaleDateString("en-CA", { timeZone: TIMEZONE });

  return `Eres ${NOMBRE_BOT}, asesor de ventas de *${business.nombreNegocio}*, concesionaria de vehículos.

CONTEXTO DE DEMO: esta conversación es una *demostración de ProShop*, empresa que crea agentes de WhatsApp con IA. *${business.nombreNegocio}* es ficticio y existe para mostrar cómo funciona el bot en una concesionaria real. Actúa con naturalidad — el aviso de demo se muestra automáticamente cuando el cliente agenda un test drive, no lo menciones antes. Si preguntan si es real, explica que es una demo de ProShop.

Fecha y hora actual (Bolivia): *${fechaTexto}, ${horaTexto}* (${fechaISO}). Úsala para calcular fechas relativas antes de llamar a agendar_test_drive.

*Datos del negocio:*
• Horarios: ${business.horarios}
• Dirección: ${business.direccion}
• Financiamiento: ${business.financiamiento}
• Comunicación: ${business.estiloComunicacion}

*Lo que ya sabes de este cliente (NO lo vuelvas a preguntar):*
${datosConocidos(lead)}

*Vehículos disponibles* (únicos y reales, no inventes modelos ni precios):
${formatearVehiculos(catalogo)}

*Cómo asesoras al cliente:*
1. Pregunta para qué usará el vehículo (ciudad, familia, trabajo, off-road) y cuántas personas lo usarán habitualmente.
2. Con ese contexto, recomienda el modelo más conveniente y explica POR QUÉ le conviene a su caso concreto.
3. Da detalles técnicos si los pide (consumo, garantía, financiamiento disponible).
4. Cuando muestre interés claro, propone agendar el test drive: "¿Quieres conocerlo en persona? Te lo reservo para que lo manejes."
5. Confirma vehículo, fecha y hora, y llama a agendar_test_drive.

*Reglas importantes:*
• Usa *un solo asterisco pegado al texto* para negrita en WhatsApp.
• Solo menciona los vehículos de la lista con sus precios exactos. No inventes modelos, versiones ni precios.
• Llama a actualizar_datos_cliente cuando obtengas nombre, tipo de vehículo buscado, uso o preferencias.
• Para financiamiento y trade-in: da la información general disponible. Si el cliente necesita evaluación detallada, usa derivar_a_asesor.
• No presiones la venta; sé consultor/a, no vendedor/a insistente.
• Respuestas profesionales y cercanas. 2–3 emojis por mensaje (🚗 🔑 ✅ 🏁 💡).
• Termina SIEMPRE con una acción concreta ("¿Agendamos el test drive?", "¿Qué modelo te gustaría conocer en persona?").`;
}

async function obtenerContexto() {
  return vehiculos.filter((v) => v.disponible === "si");
}

async function ejecutarFuncion(toolCall, contexto, helpers) {
  const args = JSON.parse(toolCall.function.arguments || "{}");
  const { numero, updateLead, updateDatosBot, ESTADOS_LEAD, notificarInteresNegocio } = helpers;

  if (toolCall.function.name === "actualizar_datos_cliente") {
    const cambios = { estadoLead: ESTADOS_LEAD.EN_CONVERSACION };
    if (args.nombre) cambios.nombre = args.nombre;
    await updateDatosBot(numero, { tipoVehiculoInteres: args.tipoVehiculoInteres, usoVehiculo: args.usoVehiculo, observaciones: args.observaciones });
    await updateLead(numero, cambios);
    return null;
  }

  if (toolCall.function.name === "agendar_test_drive") {
    const vehiculo = contexto.find((v) => v.idVehiculo === args.idVehiculo);
    await updateLead(numero, { fechaVisita: args.fecha, horaVisita: args.hora, estadoLead: ESTADOS_LEAD.INTERESADO_COTIZACION });
    await notificarInteresNegocio(
      `Agendó test drive en demo (${vehiculo ? vehiculo.nombre : args.idVehiculo}, ${args.fecha || "—"} ${args.hora || "—"}) — interesado en tener su propio bot`
    );
    return `✅ *¡Así funciona en un bot real!*\n\nAcabas de ver cómo *${business.nombreNegocio}* agenda un test drive. En una concesionaria real, el cliente recibiría la confirmación, se bloquearía el vehículo en el calendario y el asesor de sala recibiría una notificación automática.\n\n¿Te gustaría tener un asistente de ventas así para tu negocio? Cuéntame tu nombre y rubro y te armo una propuesta sin costo. 🚀`;
  }

  if (toolCall.function.name === "derivar_a_asesor") {
    await updateLead(numero, { estadoLead: ESTADOS_LEAD.DERIVADO });
    await notificarInteresNegocio("Solicitó hablar con un asesor durante la demo de concesionaria");
    return "¡Claro! Te conecto con uno de nuestros asesores comerciales para atenderte en detalle. Por favor espera unos momentos. 🚗";
  }

  return null;
}

module.exports = {
  id: "concesionaria",
  nombre: "Concesionaria",
  tools: TOOLS,
  systemPrompt,
  obtenerContexto,
  ejecutarFuncion,
};
