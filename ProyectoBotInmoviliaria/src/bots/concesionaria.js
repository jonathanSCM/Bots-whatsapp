const business = require("../config/concesionaria.json");
const vehiculos = require("../config/concesionaria-vehiculos.json");

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
          tipoVehiculoInteres: { type: "string" },
          observaciones: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agendar_test_drive",
      description: "Agenda un test drive cuando el cliente confirmo el vehiculo, la fecha y la hora.",
      parameters: {
        type: "object",
        properties: {
          idVehiculo: { type: "string", description: "ID exacto del vehiculo, ej: V001" },
          fecha: { type: "string", description: "Formato YYYY-MM-DD" },
          hora: { type: "string", description: "Formato HH:MM 24hs" },
        },
        required: ["idVehiculo", "fecha", "hora"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "derivar_a_asesor",
      description: "Deriva la conversacion a un encargado humano cuando el cliente lo pide, esta molesto, o la consulta esta fuera de alcance (ej. financiamiento detallado, trade-in).",
      parameters: { type: "object", properties: { motivo: { type: "string" } } },
    },
  },
];

function formatearVehiculos(lista) {
  if (!lista.length) return "No hay vehiculos cargados actualmente en el sistema.";
  return lista.map((v) => `  - [${v.idVehiculo}] ${v.tipo}: ${v.nombre} - ${v.precio} - ${v.descripcion}`).join("\n");
}

function systemPrompt(catalogo = []) {
  const hoy = new Date();
  const fechaHoyTexto = hoy.toLocaleDateString("es-BO", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/La_Paz" });
  const fechaHoyISO = hoy.toLocaleDateString("en-CA", { timeZone: "America/La_Paz" });

  return `Eres el asistente virtual de "${business.nombreNegocio}", una concesionaria de vehículos.

IMPORTANTE: esta es una DEMOSTRACIÓN de ProShop (empresa que crea agentes de WhatsApp con IA). "${business.nombreNegocio}" y sus vehículos son ficticios, solo existen para mostrar cómo se comportaría un bot real. Conversa con normalidad como si fueras el bot de una concesionaria real (recomendando modelos, agendando test drives, etc.) — el sistema se encarga de aclarar que es una demo en el momento en que el cliente confirma un test drive, tú no necesitas mencionarlo antes de eso. Si el cliente pregunta directamente si esto es real, sé honesto: dile que es una demostración de ProShop y que si quiere un bot así para su propio negocio puede pedir una cotización.

Hoy es ${fechaHoyTexto} (${fechaHoyISO}). Usa esta fecha como referencia para calcular fechas relativas y siempre calcula la fecha real en formato YYYY-MM-DD antes de llamar a agendar_test_drive.

Informacion del negocio:
- Horarios: ${business.horarios}
- Direccion: ${business.direccion}
- Financiamiento: ${business.financiamiento}
- Estilo de comunicacion: ${business.estiloComunicacion}

Vehículos disponibles ahora mismo (esta es la UNICA fuente real, no inventes modelos ni precios):
${formatearVehiculos(catalogo)}

Reglas obligatorias:
- Solo puedes mencionar, describir u ofrecer los vehículos listados arriba, con sus precios exactos.
- No pidas datos sensibles innecesarios (solo nombre y tipo de vehículo de interés).
- Usa derivar_a_asesor SOLO si: el cliente lo pide explicitamente, esta molesto, o pide detalles de financiamiento/trade-in que requieren evaluacion humana.
- derivar_a_asesor es la excepcion, no la regla.
- Cuando obtengas un dato nuevo del cliente llama a actualizar_datos_cliente.
- Para agendar un test drive, confirma vehículo, fecha y hora, y luego llama a agendar_test_drive.
- Mantén las respuestas breves, profesionales y cercanas, sin presionar la venta.`;
}

async function obtenerContexto() {
  return vehiculos.filter((v) => v.disponible === "si");
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

  if (toolCall.function.name === "agendar_test_drive") {
    const vehiculo = contexto.find((v) => v.idVehiculo === args.idVehiculo);
    // Es solo una demostracion: no existe una concesionaria real, asi que no
    // se agenda nada real. Se aclara y se registra como lead caliente.
    await updateLead(numero, { estadoLead: ESTADOS_LEAD.INTERESADO_COTIZACION });
    await notificarInteresNegocio(
      `Intento agendar un test drive en la demo (${vehiculo ? vehiculo.nombre : args.idVehiculo}, ${args.fecha || "-"} ${args.hora || "-"}) - cliente interesado en tener su propio bot`
    );
    return "Esto que acabas de ver es una demostración del bot de Concesionaria, así que no agenda test drives reales. Si te gustaría tener un asistente así para tu propio negocio, ¿agendamos una reunión breve para cotizarlo? Cuéntame tu nombre y a qué negocio representas y te contactamos.";
  }

  if (toolCall.function.name === "derivar_a_asesor") {
    await updateLead(numero, { estadoLead: ESTADOS_LEAD.DERIVADO });
    await notificarInteresNegocio("Pidio hablar con un encargado durante la demo de concesionaria");
    return "Perfecto, voy a derivarte con un encargado para que pueda ayudarte con mas detalle. Por favor espera unos momentos.";
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
