const business = require("../config/business.json");
const { listarDisponibles, obtenerPropiedad } = require("../state/propiedadStore");
const { verificarDisponibilidad, crearCita, guardarGoogleEventId } = require("../state/citaStore");
const { obtenerHorario } = require("../state/disponibilidadStore");
const { crearEventoVisita } = require("../services/calendar");
const { enviarImagenes } = require("../services/whatsapp");

const TIMEZONE_NEGOCIO = "America/La_Paz";
const GOOGLE_CALENDAR_HABILITADO = Boolean(process.env.GOOGLE_CALENDAR_ID);

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
      description: "Agenda una visita real cuando el usuario confirmo fecha y hora deseada para una propiedad especifica. El sistema valida que el horario este disponible antes de confirmar.",
      parameters: {
        type: "object",
        properties: {
          idPropiedad: { type: "string", description: "ID exacto de la propiedad, ej: P001" },
          fecha: { type: "string", description: "Formato YYYY-MM-DD" },
          hora: { type: "string", description: "Formato HH:MM 24hs" },
        },
        required: ["idPropiedad", "fecha", "hora"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "enviar_fotos_propiedad",
      description: "Envia las fotos de una propiedad especifica por WhatsApp cuando el cliente pide ver fotos o imagenes de una propiedad.",
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
      description: "Deriva la conversacion a un asesor humano cuando el cliente lo pide, esta molesto, o la consulta esta totalmente fuera de alcance.",
      parameters: { type: "object", properties: { motivo: { type: "string" } } },
    },
  },
];

function formatearPropiedades(propiedades) {
  if (!propiedades.length) return "No hay propiedades cargadas actualmente en el sistema.";
  return propiedades
    .map((p) => `- [${p.id}] ${p.tipo} en ${p.operacion} - Zona: ${p.zona} - Precio: ${p.precio} - Dormitorios: ${p.dormitorios || "N/A"} - ${p.descripcion}`)
    .join("\n");
}

const NOMBRES_DIA = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

function formatearHorarioAtencion() {
  return obtenerHorario()
    .filter((d) => d.activo)
    .map((d) => `${NOMBRES_DIA[d.diaSemana]}: ${d.horaInicio} a ${d.horaFin}`)
    .join(", ");
}

function systemPrompt(propiedades = []) {
  const hoy = new Date();
  const fechaHoyTexto = hoy.toLocaleDateString("es-BO", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: TIMEZONE_NEGOCIO });
  const horaActualTexto = hoy.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE_NEGOCIO });
  const fechaHoyISO = hoy.toLocaleDateString("en-CA", { timeZone: TIMEZONE_NEGOCIO });

  return `Eres el asistente virtual de "${business.nombreNegocio}", una inmobiliaria real. Atiendes clientes de verdad por WhatsApp, no es una demostracion.

Fecha y hora actual en Bolivia (zona horaria America/La_Paz): hoy es ${fechaHoyTexto}, son las ${horaActualTexto} (${fechaHoyISO}). Usa esta fecha como referencia para calcular "mañana", "el lunes que viene", "este fin de semana", etc. Siempre que el usuario de una fecha relativa, calcula la fecha real en formato YYYY-MM-DD antes de llamar a agendar_visita.

Horario de atencion: ${formatearHorarioAtencion()}.

Informacion comercial disponible:
- Zonas atendidas: ${business.zonas.join(", ")}
- Tipos de propiedad: ${business.tiposPropiedad.join(", ")}
- Requisitos para alquiler: ${business.requisitosAlquiler}
- Requisitos para compra: ${business.requisitosCompra}
- Estilo de comunicacion: ${business.estiloComunicacion}

Propiedades disponibles ahora mismo (esta es la UNICA fuente real de propiedades, no existen otras, NUNCA inventes ninguna):
${formatearPropiedades(propiedades)}

Reglas obligatorias:
- Solo puedes mencionar, describir u ofrecer las propiedades listadas arriba, con sus datos exactos. No inventes propiedades, precios, zonas, fotos o disponibilidad que no esten en esa lista.
- Si el cliente busca algo que no calza con ninguna propiedad disponible, dilo honestamente y ofrece derivar a un asesor o avisarle cuando haya novedades.
- No cierres ventas directamente, tu rol es calificar al prospecto y agendar visitas reales o derivar a un asesor.
- No pidas datos sensibles innecesarios (solo nombre, contacto y preferencias de busqueda).
- Usa derivar_a_asesor SOLO si: el cliente lo pide explicitamente, esta molesto o insiste, o la consulta esta totalmente fuera de tu alcance. Es la excepcion, no la regla.
- Cuando obtengas un dato nuevo del prospecto llama a actualizar_datos_lead.
- Para agendar una visita: primero confirma con el cliente la propiedad exacta (idPropiedad), la fecha y la hora en lenguaje natural, dentro del horario de atencion, y luego llama a agendar_visita. El sistema valida la disponibilidad real; si el horario no esta libre te lo va a indicar para que propongas otra opcion al cliente.
- Si el cliente pide ver fotos de una propiedad, llama a enviar_fotos_propiedad con el idPropiedad exacto.
- Mantén las respuestas breves, amables y profesionales.`;
}

async function obtenerContexto() {
  return listarDisponibles();
}

// helpers: { numero, getOrCreateLead, updateLead, ESTADOS_LEAD }
async function ejecutarFuncion(toolCall, contexto, helpers) {
  const args = JSON.parse(toolCall.function.arguments || "{}");
  const { numero, getOrCreateLead, updateLead, ESTADOS_LEAD } = helpers;

  if (toolCall.function.name === "actualizar_datos_lead") {
    updateLead(numero, { ...args, estadoLead: ESTADOS_LEAD.EN_CONVERSACION });
    return null;
  }

  if (toolCall.function.name === "agendar_visita") {
    const propiedad = obtenerPropiedad(args.idPropiedad);
    if (!propiedad) {
      return `No encontre la propiedad ${args.idPropiedad}. Revisemos cual es la que te interesa.`;
    }

    const { disponible, motivo } = verificarDisponibilidad(args.fecha, args.hora);
    if (!disponible) {
      return `Ese horario no esta disponible (${motivo}). ¿Quieres proponer otra fecha u hora dentro de nuestro horario de atencion?`;
    }

    const lead = getOrCreateLead(numero);
    const cita = crearCita({
      idLead: numero,
      nombre: lead.nombre,
      whatsapp: numero,
      propiedadId: propiedad.id,
      fecha: args.fecha,
      hora: args.hora,
    });

    updateLead(numero, { fechaVisita: args.fecha, horaVisita: args.hora, estadoLead: ESTADOS_LEAD.VISITA_AGENDADA });

    if (GOOGLE_CALENDAR_HABILITADO) {
      try {
        const evento = await crearEventoVisita({ nombre: lead.nombre, whatsapp: numero, propiedad, fecha: args.fecha, hora: args.hora });
        if (evento?.id) guardarGoogleEventId(cita.id, evento.id);
      } catch (err) {
        console.error("No se pudo crear el evento en Google Calendar (la cita ya quedo guardada en el sistema):", err.message);
      }
    }

    return `Listo, tu visita a la propiedad ${propiedad.id} quedo agendada para el ${args.fecha} a las ${args.hora}. Te vamos a recordar por este mismo chat unas horas antes.`;
  }

  if (toolCall.function.name === "enviar_fotos_propiedad") {
    const propiedad = contexto.find((p) => p.id === args.idPropiedad) || obtenerPropiedad(args.idPropiedad);
    if (!propiedad) return "No encontre esa propiedad para mostrarte las fotos.";
    if (!propiedad.fotos?.length) return `Por ahora no tengo fotos cargadas de la propiedad ${propiedad.id}, pero puedo darte mas detalles.`;

    await enviarImagenes(numero, propiedad.fotos, `${propiedad.tipo} en ${propiedad.operacion} - ${propiedad.zona}`);
    return "Te envie las fotos de la propiedad. ¿Que te parecio?";
  }

  if (toolCall.function.name === "derivar_a_asesor") {
    updateLead(numero, { estadoLead: ESTADOS_LEAD.DERIVADO });
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
