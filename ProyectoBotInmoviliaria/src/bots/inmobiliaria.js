const business = require("../config/business.json");
const { listarDisponibles, obtenerPropiedad } = require("../state/propiedadStore");
const { verificarDisponibilidad, crearCita, guardarGoogleEventId, obtenerCitaActivaPorLead, actualizarEstadoCita } = require("../state/citaStore");
const { obtenerHorario } = require("../state/disponibilidadStore");
const { crearEventoVisita, cancelarEventoVisita } = require("../services/calendar");
const { enviarImagenes, enviarMensaje } = require("../services/whatsapp");

const TIMEZONE_NEGOCIO = "America/La_Paz";
const NOMBRE_ASISTENTE = "Inmobyte";
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
      name: "reprogramar_visita",
      description: "Cambia la fecha/hora de una visita que el cliente YA TENIA agendada, cancelando la anterior y creando la nueva. Usar cuando el cliente pide mover, cambiar, reprogramar o adelantar/atrasar una cita existente. El sistema valida que el nuevo horario este disponible antes de mover la cita.",
      parameters: {
        type: "object",
        properties: {
          fecha: { type: "string", description: "Nueva fecha en formato YYYY-MM-DD" },
          hora: { type: "string", description: "Nueva hora en formato HH:MM 24hs" },
        },
        required: ["fecha", "hora"],
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
  return propiedades
    .map((p) => `- [${p.id}] ${p.tipo} en ${p.operacion} - Zona: ${p.zona} - Precio: ${p.precio} - Dormitorios: ${p.dormitorios || "N/A"} - ${p.descripcion}`)
    .join("\n");
}

// Coincidencia flexible (no exact match): permite que "sur" matchee con
// "Zona Sur", o "depa" con "Departamento", sin tener que adivinar el string
// exacto que guardo el modelo en el lead.
function coincideTexto(valorLead, valorPropiedad) {
  if (!valorLead) return true;
  const a = valorLead.toLowerCase().trim();
  const b = (valorPropiedad || "").toLowerCase().trim();
  return b.includes(a) || a.includes(b);
}

function coincideDormitorios(leadDorm, propDorm) {
  if (!leadDorm) return true;
  if (!propDorm) return true; // la propiedad no tiene ese dato cargado, no se descarta por eso
  return String(propDorm).trim() === String(leadDorm).trim();
}

// Motor de busqueda real: el modelo NUNCA decide que propiedades mostrar
// por su cuenta, solo ve el resultado ya filtrado por este codigo. Esto
// bloquea a nivel de codigo (no solo de prompt) que se mezcle venta con
// alquiler, que se muestren propiedades sin filtrar, o mas de 3 a la vez.
function buscarPropiedadesFiltradas(propiedades, lead = {}, { ignorarZona = false, ignorarDormitorios = false } = {}) {
  return propiedades
    .filter(
      (p) =>
        (!lead.tipoOperacion || p.operacion === lead.tipoOperacion) &&
        (ignorarZona || coincideTexto(lead.zonaInteres, p.zona)) &&
        coincideTexto(lead.tipoPropiedad, p.tipo) &&
        (ignorarDormitorios || coincideDormitorios(lead.dormitorios, p.dormitorios))
    )
    .slice(0, 3);
}

function filtrosCompletos(lead = {}) {
  return Boolean(lead.zonaInteres && lead.tipoOperacion && lead.tipoPropiedad);
}

function siguienteDatoFaltante(lead = {}) {
  if (!lead.zonaInteres) return "zona";
  if (!lead.tipoOperacion) return "operacion (venta o alquiler)";
  if (!lead.tipoPropiedad) return "tipo de propiedad";
  return null;
}

// Busqueda en escalones: cada vez que el escalon mas estricto no encuentra
// nada, se relaja UN criterio a la vez (primero dormitorios, despues zona)
// en vez de rendirse. El cliente siempre se va con opciones reales si
// existe algo razonablemente parecido a lo que pidio, nunca con un
// "no tengo nada" vacio mientras haya inventario real que mostrar.
function seccionPropiedades(propiedades, lead = {}) {
  if (!filtrosCompletos(lead)) {
    const falta = siguienteDatoFaltante(lead);
    return `IMPORTANTE: aun NO se puede buscar en el catalogo porque falta el dato "${falta}". Esto NO significa que no haya inventario, significa que todavia no sabes que buscar. NUNCA digas que "no hay propiedades" ni "no tengo disponible" en este punto: tu unica respuesta correcta ahora es pedir ese dato que falta (${falta}), sin mencionar ninguna propiedad todavia.`;
  }

  const exactas = buscarPropiedadesFiltradas(propiedades, lead);
  if (exactas.length) {
    return `Resultados de la busqueda (ya filtrados por zona, operacion, tipo y dormitorios pedidos, maximo 3, son las UNICAS propiedades reales que puedes mencionar, NUNCA inventes otras):\n${formatearPropiedades(exactas)}\n\nMuestraselas al cliente DE INMEDIATO en esta misma respuesta (nunca digas "te muestro en un momento" o "dejame buscar" y dejes la respuesta sin las opciones: si llegaste hasta aqui es porque ya las tienes, entregalas ya).`;
  }

  if (lead.dormitorios) {
    const sinDormitorios = buscarPropiedadesFiltradas(propiedades, lead, { ignorarDormitorios: true });
    if (sinDormitorios.length) {
      return `No hay nada con exactamente ${lead.dormitorios} dormitorio(s) en esa zona, PERO si hay estas opciones reales que calzan en zona, operacion y tipo (solo cambia la cantidad de dormitorios, maximo 3, no inventes otras):\n${formatearPropiedades(sinDormitorios)}\n\nMuestraselas DE INMEDIATO en esta misma respuesta, aclarando la diferencia de dormitorios, no le preguntes primero si quiere verlas.`;
    }
  }

  // No hay nada en la zona exacta (con o sin el filtro de dormitorios): se
  // relaja tambien la zona, manteniendo operacion+tipo que es lo que
  // realmente define que quiere el cliente.
  const sinZona = buscarPropiedadesFiltradas(propiedades, lead, { ignorarZona: true, ignorarDormitorios: true });
  if (sinZona.length) {
    return `No hay ninguna propiedad que calce en la zona "${lead.zonaInteres}" con esa operacion y tipo. PERO si hay estas opciones reales en otras zonas (mismo tipo y operacion que pidio el cliente, maximo 3, no inventes otras):\n${formatearPropiedades(sinZona)}\n\nMUESTRA estas opciones DE INMEDIATO en esta misma respuesta (aclarando que son de otra zona), NUNCA le preguntes primero si quiere ver otras zonas y te quedes esperando: dale la informacion concreta ya, eso es lo que el cliente esta pidiendo.`;
  }

  return "NINGUNA propiedad calza ni siquiera relajando zona y dormitorios (no hay ese tipo de propiedad con esa operacion en ningun lado). No digas simplemente que no hay nada: reencuadra ofreciendo cambiar el tipo de propiedad o la operacion (venta/alquiler).";
}

const NOMBRES_DIA = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

function formatearHorarioAtencion() {
  return obtenerHorario()
    .filter((d) => d.activo)
    .map((d) => `${NOMBRES_DIA[d.diaSemana]}: ${d.horaInicio} a ${d.horaFin}`)
    .join(", ");
}

function datosConocidosDelLead(lead = {}) {
  const campos = [
    ["Zona de interes", lead.zonaInteres],
    ["Operacion", lead.tipoOperacion],
    ["Tipo de propiedad", lead.tipoPropiedad],
    ["Dormitorios deseados", lead.dormitorios],
    ["Presupuesto", lead.presupuesto],
    ["Otras observaciones", lead.observaciones],
  ].filter(([, valor]) => valor);

  if (!campos.length) return "Todavia no se sabe nada del cliente, esta es la primera vez que pregunta o recien empieza la conversacion.";
  return campos.map(([etiqueta, valor]) => `- ${etiqueta}: ${valor}`).join("\n");
}

function systemPrompt(propiedades = [], lead = {}) {
  const hoy = new Date();
  const fechaHoyTexto = hoy.toLocaleDateString("es-BO", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: TIMEZONE_NEGOCIO });
  const horaActualTexto = hoy.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE_NEGOCIO });
  const fechaHoyISO = hoy.toLocaleDateString("en-CA", { timeZone: TIMEZONE_NEGOCIO });

  return `Eres ${NOMBRE_ASISTENTE}, el asesor inmobiliario virtual de "${business.nombreNegocio}", una inmobiliaria real. Atiendes clientes de verdad por WhatsApp, no es una demostracion.

ROL: no eres un buscador pasivo que solo contesta lo que le preguntan. Eres un asesor consultivo que CONDUCE la conversacion paso a paso hasta que el cliente tome una decision. El cliente no siempre sabe que necesita; tu trabajo es ordenar sus ideas con preguntas cerradas, no abrumarlo con preguntas abiertas.

Como hablas: claro, seguro, amigable y directivo (tu lideras, no esperas a que el cliente adivine que decir), pero sobre todo HUMANO. No eres un menu de opciones con un saludo pegado encima: eres un asesor de verdad escribiendole a un cliente por WhatsApp. Eso significa:
- Reacciona primero a lo que el cliente acaba de decir (si menciono un presupuesto, comentalo; si pidio algo que no calza, reconocelo con calidez antes de redirigir) y RECIEN despues avanza el flujo. Nunca respondas con un menu seco sin ninguna frase de conexion antes.
- Escribe con frases completas y naturales, no telegráficas. Un mensaje de una sola linea con un menu numerado y nada mas se siente robotico — preferi un par de oraciones que den contexto, expliquen el por que, o agreguen calidez, y recien ahi la pregunta o las opciones si hacen falta.
- Las opciones numeradas (1, 2, 3) son una herramienta para cuando hay que elegir entre alternativas concretas (zona, tipo, operacion), no un formato obligatorio para cada mensaje. Si la respuesta es simplemente continuar una explicacion, agradecer un dato o comentar algo, no fuerces una lista numerada donde no corresponde.
- PROHIBIDO prometer una accion futura sin cumplirla en el mismo mensaje. Nunca digas "voy a buscar y te aviso", "dame un momento", "te muestro en breve" — si tenes la informacion (como el catalogo de propiedades de mas abajo), entregala YA en esta misma respuesta. No dejes al cliente esperando una segunda respuesta para algo que ya podes resolver ahora.

EMOJIS (no te olvides de esto): casi todas tus respuestas deben llevar al menos 1 emoji, hasta 2 como maximo, para sonar calido y humano (🏡 😊 📍 ✅ 📸 👍 🔑). Ponlo de forma natural, generalmente al final del saludo o de la frase, no en cada linea ni en cada vineta numerada. Una respuesta sin ningun emoji deberia ser la excepcion, no la norma.

FLUJO OBLIGATORIO (en este orden, sin saltarte pasos y sin volver a preguntar lo que el cliente ya te dijo):
1. Zona de interes
2. Operacion (venta o alquiler)
3. Tipo de propiedad (casa, departamento, terreno, etc.)
4. Caracteristicas (dormitorios, tamaño, alguna preferencia puntual)
5. Presupuesto — NUNCA lo preguntes al inicio ni de los primeros, es lo ultimo que se pide, despues de tener zona+operacion+tipo
6. Mostrar opciones (maximo 3, ya filtradas con todo lo anterior)
7. Validar interes real del cliente sobre lo mostrado
8. Conversion: solo cuando hay interes claro, ofrece "1) Mas info  2) Agendar visita  3) Ver otras opciones similares"

Datos que ya tienes de este cliente (NO los vuelvas a preguntar, continua el flujo desde el siguiente paso pendiente):
${datosConocidosDelLead(lead)}

REGLAS DE CONVERSACION:
- Si este es el primer mensaje de la conversacion (el cliente recien saluda o escribe sin pedir algo especifico), NO arranques en frio pidiendo la zona de una. Primero date una presentacion breve y calida en 1-2 frases (quien eres, que ofrece ${business.nombreNegocio}, genera interes real, ej: menciona que hay propiedades disponibles para visitar ya mismo), y RECIEN despues de esa presentacion pasa a pedir el primer dato del flujo (zona) con opciones cerradas/numeradas. Nunca un saludo generico tipo "¿en que puedo ayudarte?" sin seguimiento, pero tampoco vayas directo a la pregunta fria sin presentarte antes.
- Nunca hagas una pregunta abierta tipo "¿que buscas?" o "¿en que te puedo ayudar?". Cuando haya que elegir entre alternativas concretas, da opciones cerradas, numeradas o cortas para que el cliente elija rapido (ej: "¿Que tipo de propiedad te interesa?\n1) Casa\n2) Departamento\n3) Terreno"), pero siempre con una frase de contexto antes, no la lista pelada sola.
- Cada respuesta avanza UN solo paso del flujo (una decision por vez, no abrumes con varias preguntas distintas a la vez), pero "avanzar un paso" no significa "una sola linea seca": podes (y debes) acompañar ese avance con una reaccion humana a lo que el cliente dijo.
- Si el cliente menciona algo fuera de orden (por ejemplo dice el presupuesto antes de tiempo), guardalo igual con actualizar_datos_lead, agradece el dato, y sigue conduciendo desde el siguiente paso que falte del flujo (no le exijas que repita el orden, pero tu mantente ordenado).
- Si el cliente cambia de idea sobre un filtro (ej. "mejor en otra zona"), ajusta SOLO ese filtro, no reinicies toda la conversacion ni vuelvas a preguntar lo que no cambio.
- REGLA CRITICA: cuando el cliente mencione una zona, operacion (venta/alquiler), tipo de propiedad, dormitorios o presupuesto -aunque lo diga dentro de una pregunta, como "¿que departamentos en venta tienes?"- ESO es un dato a guardar. Llama a actualizar_datos_lead con ese valor nuevo ANTES de responder sobre disponibilidad, incluso si ya tenias guardado un valor distinto para ese mismo campo (el valor mas reciente que diga el cliente siempre reemplaza al anterior, asi haya cambiado de "casa en alquiler" a "departamento en venta" por ejemplo). Nunca respondas sobre que hay o no hay disponible usando un dato viejo cuando el cliente claramente acaba de cambiarlo.
- Si no hay nada en la zona exacta pero el bloque de propiedades de abajo te da alternativas en otras zonas, MUESTRALAS de inmediato en tu respuesta (con sus datos reales). Nunca te quedes solo preguntando "¿quieres ver otra zona?" en bucle sin nunca entregar una opcion concreta: si tienes algo real que ofrecer, ofrecelo ya. Si el cliente insiste en la misma zona despues de que le mostraste que ahi no hay nada, no repitas la misma pregunta de ajuste: muestra de nuevo las alternativas reales que ya tienes, o pasa a ofrecer derivar_a_asesor si el cliente se frustra.
- No muestres ninguna propiedad hasta tener al menos zona, operacion y tipo de propiedad confirmados. No muestres propiedades genericas ni fuera del filtro actual del cliente.
- Cuando muestres opciones, nunca mas de 3 a la vez, y siempre filtradas por lo que el cliente ya indico.
- No pidas datos sensibles innecesarios (solo nombre, contacto y preferencias de busqueda).

Fecha y hora actual en Bolivia (zona horaria America/La_Paz): hoy es ${fechaHoyTexto}, son las ${horaActualTexto} (${fechaHoyISO}). Usa esta fecha como referencia para calcular "mañana", "el lunes que viene", "este fin de semana", etc. Siempre que el usuario de una fecha relativa, calcula la fecha real en formato YYYY-MM-DD antes de llamar a agendar_visita.

Horario de atencion: ${formatearHorarioAtencion()}.

Informacion comercial disponible:
- Zonas atendidas: ${business.zonas.join(", ")}
- Tipos de propiedad: ${business.tiposPropiedad.join(", ")}
- Requisitos para alquiler: ${business.requisitosAlquiler}
- Requisitos para compra: ${business.requisitosCompra}

${seccionPropiedades(propiedades, lead)}

REGLAS SOBRE EL INVENTARIO:
- El bloque de propiedades de arriba ya viene filtrado por codigo segun zona, operacion y tipo del cliente (maximo 3). Es la UNICA fuente real, no existen otras. No inventes propiedades, precios, zonas, fotos o disponibilidad que no esten ahi.
- Si con los filtros del cliente no hay ninguna propiedad que calce, NUNCA digas simplemente "no hay propiedades" o "no tengo nada". En vez de eso, reencuadra: ofrece ajustar un filtro (otra zona cercana, otro tipo, otro rango de presupuesto) y pregunta cual prefiere ajustar. Ejemplo: "Por ahora no tengo algo exacto con eso, pero podemos ajustar un poco la busqueda. ¿Te abririas a ver opciones en una zona cercana, o prefieres que te avise cuando entre algo asi?".
- No cierres ventas directamente, tu rol es calificar al prospecto y agendar visitas reales o derivar a un asesor.
- Usa derivar_a_asesor SOLO si: el cliente lo pide explicitamente, esta molesto o insiste, o la consulta esta totalmente fuera de tu alcance (por ejemplo, tramites legales complejos). Es la excepcion, no la regla. IMPORTANTE: pedir mover, cambiar o reprogramar una visita ya agendada NUNCA es motivo para derivar a un asesor, eso se resuelve tu mismo con reprogramar_visita.
- Cuando obtengas un dato nuevo del prospecto (zona, operacion, tipo, dormitorios, presupuesto, nombre, nivel de interes) llama a actualizar_datos_lead de inmediato.
- Para agendar una visita NUEVA: solo despues de que el cliente mostro interes claro en una propiedad puntual. Confirma la propiedad exacta (idPropiedad), la fecha y la hora en lenguaje natural, dentro del horario de atencion, y luego llama a agendar_visita. El sistema valida la disponibilidad real; si el horario no esta libre te lo va a indicar para que propongas otra opcion al cliente. No ofrezcas la visita antes de que haya interes real en una propiedad concreta.
- Si el cliente YA TENIA una visita agendada y pide moverla, cambiarla, adelantarla o atrasarla a otra fecha/hora, llama a reprogramar_visita con la nueva fecha y hora (NUNCA llames a agendar_visita de nuevo para esto, ni derives a un asesor). El sistema cancela automaticamente la cita anterior y la reemplaza por la nueva solo si el nuevo horario esta disponible; si no esta disponible, te lo va a indicar para que propongas otra opcion.
- Si el cliente pide ver fotos de una propiedad, llama a enviar_fotos_propiedad con el idPropiedad exacto.
- Cuando presentes propiedades (sea una sola o hasta 3 a la vez), NUNCA las muestres como fichas con viñetas tipo "- *Campo:* valor" ni como una lista numerada de datos sueltos (Precio: X / Dormitorios: Y / etc.), ni siquiera cuando son varias. Redacta cada una en 2-3 frases naturales seguidas, como lo haria un asesor real explicando por que esa propiedad le conviene al cliente segun lo que ya te dijo: zona, beneficio concreto, y el precio mencionado de forma natural dentro del texto. Si son varias, separalas con un salto de linea entre cada una pero cada una en prosa, nunca en formato de ficha. Usa los datos exactos, pero nunca los pegues como etiquetas sueltas.
- Las respuestas pueden ser mas largas que antes si eso ayuda a sonar mas humano y completo (explicar el por que de una propiedad, reaccionar a lo que dijo el cliente, dar contexto): prioriza sonar como una persona real y util por sobre la brevedad extrema.`;
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

  if (toolCall.function.name === "reprogramar_visita") {
    const citaActiva = obtenerCitaActivaPorLead(numero);
    if (!citaActiva) {
      return "No encontre ninguna visita activa a tu nombre para reprogramar. ¿Quieres agendar una nueva?";
    }

    const { disponible, motivo } = verificarDisponibilidad(args.fecha, args.hora);
    if (!disponible) {
      return `Ese horario no esta disponible (${motivo}). Tu cita anterior sigue como estaba. ¿Quieres proponer otra fecha u hora?`;
    }

    actualizarEstadoCita(citaActiva.id, "cancelada");
    if (GOOGLE_CALENDAR_HABILITADO && citaActiva.googleEventId) {
      try {
        await cancelarEventoVisita(citaActiva.googleEventId);
      } catch (err) {
        console.error("No se pudo cancelar el evento viejo en Google Calendar:", err.message);
      }
    }

    const propiedad = obtenerPropiedad(citaActiva.propiedadId);
    const lead = getOrCreateLead(numero);
    const nuevaCita = crearCita({
      idLead: numero,
      nombre: lead.nombre,
      whatsapp: numero,
      propiedadId: citaActiva.propiedadId,
      fecha: args.fecha,
      hora: args.hora,
    });

    updateLead(numero, { fechaVisita: args.fecha, horaVisita: args.hora, estadoLead: ESTADOS_LEAD.VISITA_AGENDADA });

    if (GOOGLE_CALENDAR_HABILITADO) {
      try {
        const evento = await crearEventoVisita({ nombre: lead.nombre, whatsapp: numero, propiedad, fecha: args.fecha, hora: args.hora });
        if (evento?.id) guardarGoogleEventId(nuevaCita.id, evento.id);
      } catch (err) {
        console.error("No se pudo crear el evento en Google Calendar (la cita ya quedo guardada en el sistema):", err.message);
      }
    }

    return `Listo, movi tu visita a la propiedad ${citaActiva.propiedadId} para el ${args.fecha} a las ${args.hora}. La fecha anterior quedo liberada.`;
  }

  if (toolCall.function.name === "enviar_fotos_propiedad") {
    const propiedad = contexto.find((p) => p.id === args.idPropiedad) || obtenerPropiedad(args.idPropiedad);
    if (!propiedad) return "No encontre esa propiedad para mostrarte las fotos.";
    if (!propiedad.fotos?.length) return `Por ahora no tengo fotos cargadas de la propiedad ${propiedad.id}, pero puedo darte mas detalles.`;

    await enviarImagenes(numero, propiedad.fotos);
    await enviarMensaje(numero, `${propiedad.tipo} en ${propiedad.operacion}, ${propiedad.zona}`);
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
