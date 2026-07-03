const business = require("../config/business.json");
const { listarDisponibles, obtenerPropiedad } = require("../state/propiedadStore");
const { verificarDisponibilidad, crearCita, guardarGoogleEventId, obtenerCitaActivaPorLead, actualizarEstadoCita } = require("../state/citaStore");
const { obtenerHorario } = require("../state/disponibilidadStore");
const { crearEventoVisita, cancelarEventoVisita } = require("../services/calendar");
const { enviarImagenes } = require("../services/whatsapp");

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
          zonaInteres: { type: "string", description: "La zona con las palabras EXACTAS que uso el cliente (si dijo 'avenida banzer' guardar 'avenida banzer'). NUNCA la traduzcas ni la reemplaces por una zona macro (NO convertir 'avenida banzer' en 'Zona Sur'): el buscador interno necesita las palabras literales del cliente." },
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

// Ficha de la propiedad al estilo portal inmobiliario, para usar como caption
// de la primera foto (WhatsApp muestra *texto* en negrita).
function fichaPropiedad(p) {
  const titulo = `*${p.tipo} en ${p.operacion === "venta" ? "Venta" : "Alquiler"} - ${p.zona}*`;
  const lineas = [`· *Precio*: ${p.precio}`];
  if (p.dormitorios) lineas.push(`· *Dormitorios*: ${p.dormitorios}`);
  lineas.push(`· *Zona*: ${p.zona}`);
  lineas.push(`· *Codigo*: ${p.id}`);
  if (p.descripcion) lineas.push(`\n${p.descripcion}`);
  return `${titulo}\n\n${lineas.join("\n")}`;
}

function formatearPropiedades(propiedades) {
  return propiedades
    .map((p) => `- [${p.id}] ${p.tipo} en ${p.operacion} - Zona: ${p.zona} - Precio: ${p.precio} - Dormitorios: ${p.dormitorios || "N/A"} - ${p.descripcion}`)
    .join("\n");
}

// Coincidencia flexible (no exact match): permite que "sur" matchee con
// "Zona Sur", "depa" con "Departamento", o "avenida banzer" con "Av. Banzer",
// sin tener que adivinar el string exacto que guardo el modelo en el lead.
// Se compara por palabras clave: se normaliza (acentos, puntuacion) y se
// descartan palabras genericas de direcciones ("av", "avenida", "calle",
// "zona", articulos) que hacen fallar la comparacion literal.
const PALABRAS_GENERICAS = new Set([
  "av", "avda", "avenida", "calle", "c", "zona", "barrio", "urbanizacion", "urb",
  "la", "el", "de", "del", "los", "las", "en", "por",
]);

function palabrasClave(texto) {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos
    .replace(/[^a-z0-9ñ\s]/g, " ") // quita puntuacion ("av." -> "av")
    .split(/\s+/)
    .filter((p) => p.length > 1 && !PALABRAS_GENERICAS.has(p));
}

function coincideTexto(valorLead, valorPropiedad) {
  if (!valorLead) return true;
  const clavesLead = palabrasClave(valorLead);
  const clavesProp = palabrasClave(valorPropiedad);
  if (!clavesLead.length) return true; // el lead solo dijo genericos ("la zona"), no filtra
  // Todas las palabras clave del lead deben aparecer (o ser prefijo/contener)
  // en alguna palabra de la propiedad: "banzer" ⊂ "banzer", "depa" ⊂ "departamento".
  return clavesLead.every((a) => clavesProp.some((b) => b.includes(a) || a.includes(b)));
}

function coincideDormitorios(leadDorm, propDorm) {
  if (!leadDorm) return true;
  if (!propDorm) return true; // la propiedad no tiene ese dato cargado, no se descarta por eso
  return String(propDorm).trim() === String(leadDorm).trim();
}

// Extrae el monto numerico y la moneda de un precio/presupuesto escrito libre:
// "USD 136,500" -> { monto: 136500, moneda: "usd" }, "3500 bs" -> { monto: 3500, moneda: "bs" }.
// Devuelve null si no hay un numero reconocible.
function parsePrecio(texto) {
  if (texto === null || texto === undefined) return null;
  const t = String(texto).toLowerCase();
  const m = t.replace(/[.,](?=\d{3}\b)/g, "").match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  let monto = Number(m[0]);
  if (/\d\s*(k\b|mil\b)/.test(t)) monto *= 1000; // "20k" o "20 mil" -> 20000
  const moneda = /\b(bs|bob|boliviano)/.test(t) ? "bs" : /(usd|\$us|us\$|\$|dolar)/.test(t) ? "usd" : null;
  return { monto, moneda };
}

// Presupuesto flexible (no binario): se aceptan propiedades hasta un 30% por
// encima de lo que dijo el cliente. Mas alla del 50% NUNCA se muestran (fuera
// de perfil). Si las monedas son distintas o algun monto no se entiende, no
// se filtra por precio (mejor mostrar que descartar por error de parseo).
const TOLERANCIA_PRESUPUESTO = 1.3;
const TOPE_PRESUPUESTO = 1.5;

function estadoPresupuesto(leadPresupuesto, propPrecio) {
  const presupuesto = parsePrecio(leadPresupuesto);
  const precio = parsePrecio(propPrecio);
  if (!presupuesto || !precio || !presupuesto.monto || !precio.monto) return "dentro";
  if (presupuesto.moneda && precio.moneda && presupuesto.moneda !== precio.moneda) return "dentro";
  if (precio.monto > presupuesto.monto * TOPE_PRESUPUESTO) return "fuera_de_perfil";
  if (precio.monto > presupuesto.monto * TOLERANCIA_PRESUPUESTO) return "excedido";
  return "dentro";
}

// Ranking: cuando hay mas candidatas que cupo (3), se muestran primero las
// que mejor calzan con lo pedido, no las primeras que aparezcan en la BD.
function scorePropiedad(p, lead = {}) {
  let score = 0;
  if (lead.zonaInteres && coincideTexto(lead.zonaInteres, p.zona)) score += 3;
  if (lead.tipoPropiedad && coincideTexto(lead.tipoPropiedad, p.tipo)) score += 3;
  if (lead.dormitorios && coincideDormitorios(lead.dormitorios, p.dormitorios) && p.dormitorios) score += 2;
  if (lead.presupuesto && estadoPresupuesto(lead.presupuesto, p.precio) === "dentro") score += 2;
  return score;
}

// Motor de busqueda real: el modelo NUNCA decide que propiedades mostrar
// por su cuenta, solo ve el resultado ya filtrado por este codigo. Esto
// bloquea a nivel de codigo (no solo de prompt) que se mezcle venta con
// alquiler, que se muestren propiedades sin filtrar, o mas de 3 a la vez.
// Busca en zona primero, y si no encuentra, busca en descripcion tambien
// (para que "Av. Banzer" encuentre propiedades aunque ese sea un detalle
// de la descripcion, no la zona macro).
function buscarPropiedadesFiltradas(propiedades, lead = {}, { ignorarZona = false, ignorarDormitorios = false, ignorarPresupuesto = false } = {}) {
  return propiedades
    .filter((p) => {
      if (lead.tipoOperacion && p.operacion !== lead.tipoOperacion) return false;
      if (!coincideTexto(lead.tipoPropiedad, p.tipo)) return false;
      if (!ignorarDormitorios && !coincideDormitorios(lead.dormitorios, p.dormitorios)) return false;

      // Presupuesto: hasta +30% pasa; +30% a +50% solo si se relaja el
      // criterio; mas de +50% NUNCA se muestra (fuera de perfil, sin excepcion).
      if (lead.presupuesto) {
        const estado = estadoPresupuesto(lead.presupuesto, p.precio);
        if (estado === "fuera_de_perfil") return false;
        if (!ignorarPresupuesto && estado === "excedido") return false;
      }

      // Zona: busca en zona macro primero, y si no coincide, busca en descripcion
      if (!ignorarZona && lead.zonaInteres) {
        const coincideEnZona = coincideTexto(lead.zonaInteres, p.zona);
        const coincideEnDescripcion = coincideTexto(lead.zonaInteres, p.descripcion || "");
        if (!coincideEnZona && !coincideEnDescripcion) return false;
      }

      return true;
    })
    .sort((a, b) => scorePropiedad(b, lead) - scorePropiedad(a, lead))
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

  // Se relaja el presupuesto (hasta +50% del monto dicho): son opciones un
  // poco por encima de lo que el cliente dijo, se muestran avisando eso.
  if (lead.presupuesto) {
    const sinPresupuesto = buscarPropiedadesFiltradas(propiedades, lead, { ignorarDormitorios: true, ignorarPresupuesto: true });
    if (sinPresupuesto.length) {
      return `No hay nada dentro del presupuesto (${lead.presupuesto}) con esos filtros, PERO si hay estas opciones reales apenas por encima del presupuesto (misma zona, operacion y tipo, maximo 3, no inventes otras):\n${formatearPropiedades(sinPresupuesto)}\n\nMuestraselas DE INMEDIATO en esta misma respuesta, siendo transparente en que estan un poco por encima de su presupuesto, y pregunta si tiene flexibilidad o prefiere ajustar otro criterio (zona/tipo).`;
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

async function formatearHorarioAtencion() {
  const horario = await obtenerHorario();
  return horario
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

async function systemPrompt(propiedades = [], lead = {}) {
  const hoy = new Date();
  const fechaHoyTexto = hoy.toLocaleDateString("es-BO", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: TIMEZONE_NEGOCIO });
  const horaActualTexto = hoy.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE_NEGOCIO });
  const fechaHoyISO = hoy.toLocaleDateString("en-CA", { timeZone: TIMEZONE_NEGOCIO });

  return `Eres ${NOMBRE_ASISTENTE}, el asesor inmobiliario virtual de "${business.nombreNegocio}", una inmobiliaria real. Atiendes clientes de verdad por WhatsApp, no es una demostracion.

ROL: no eres un buscador pasivo que solo contesta lo que le preguntan. Eres un asesor consultivo que CONDUCE la conversacion paso a paso hasta que el cliente tome una decision. El cliente no siempre sabe que necesita; tu trabajo es ordenar sus ideas con preguntas cerradas, no abrumarlo con preguntas abiertas.

Como hablas: claro, directo, amigable y PROACTIVO. Eres un asesor que conduce la venta, no esperas a que el cliente te lo pida todo. Estructura clara (menús numerados cuando haya que elegir), pero con calidez humana y emojis (2-3 por mensaje para sonar genuino). Eso significa:
- USA MENUS NUMERADOS PARA ELEGIR (zonas, tipos, operaciones): es rapido, claro, y evita preguntas abiertas. Ejemplo: "Perfecto, ¿en que zona te interesa buscar? 🏡\n1) Zona Norte\n2) Zona Sur\n3) Centro"
- PROACTIVO CON FOTOS: cuando el cliente muestre interes en una propiedad (diga "me gusta", "me interesa", "esa sí", o cualquier cosa positiva), AUTOMATICAMENTE llama a enviar_fotos_propiedad SIN ESPERAR A QUE PIDA. No digas "¿quieres ver fotos?", simplemente manda las fotos y haz un comentario sobre ellas en tu siguiente mensaje. Las fotos son el cierre, no algo que se pide.
- SUGERIR SIMILARES AUTOMATICAMENTE: si el cliente no muestra entusiasmo claro por las opciones que mostraste, o pregunta por otro rango de dormitorios/presupuesto, automaticamente busca otras similares (misma zona/tipo/operacion, solo cambio dormitorios o presupuesto) y ofertas "Tengo estas otras que quiza te gusten mas" sin esperar a que lo pida. Llama enviar_fotos_propiedad de las mejores 1-2 opciones similares para que las vea directo.
- ENTENDER NECESIDADES: no solo llena la lista de datos del flujo mecanicamente. Si el cliente menciona algo (ej: "quiero algo con patio" o "que sea seguro"), anota eso y EXPLICA por que la propiedad que le mostras cumple o no eso, no solo lista el precio y dormitorios. Eso se guarda en observaciones.
- REACCIONA PRIMERO: "Entiendo, te buscas algo en el centro para estar mas cerca del trabajo. Veamos que hay..." — da contexto/empatia antes de mostrar opciones, no solo un menu frio.

FORMATO DE TEXTO (WhatsApp, NO Markdown): para negrita usa *un solo asterisco pegado al texto* (ej: *Precio*: USD 90,000). NUNCA uses **doble asterisco**, ni # titulos, ni dejes espacios entre el asterisco y el texto (* asi no *), porque WhatsApp los muestra como asteriscos literales y se ve roto.

EMOJIS SIEMPRE (no te olvides): casi TODAS las respuestas deben llevar 2-3 emojis distribuidos naturalmente (🏡 😊 📍 ✅ 📸 👍 🔑 ❤️), NO solo 1. Los emojis hacen que suene como una persona real, no un bot. Ejemplo bueno: "Perfecto, tengo exactamente lo que buscas 😊 Mira esta opcion en el centro 📍" (2 emojis). Una respuesta sin emojis es la EXCEPCION, casi nunca.

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

Horario de atencion: ${await formatearHorarioAtencion()}.

Informacion comercial disponible:
- Zonas atendidas: ${business.zonas.join(", ")}
- Tipos de propiedad: ${business.tiposPropiedad.join(", ")}
- Requisitos para alquiler: ${business.requisitosAlquiler}
- Requisitos para compra: ${business.requisitosCompra}

${seccionPropiedades(propiedades, lead)}

REGLAS SOBRE EL INVENTARIO Y LA VENTA:
- El bloque de propiedades de arriba ya viene filtrado por codigo segun zona, operacion y tipo del cliente (maximo 3). Es la UNICA fuente real, no existen otras. No inventes propiedades, precios, zonas, fotos o disponibilidad que no esten ahi.
- REGLA ANTI-INVENTO (LA MAS IMPORTANTE DE TODAS): cada propiedad que muestres DEBE salir copiada del bloque de arriba, citando SIEMPRE su codigo (ej: "ref P083"), su precio EXACTO y su zona EXACTA tal como aparecen ahi. Si estas por escribir una propiedad y no puedes citar su codigo P0XX del bloque, esa propiedad NO EXISTE: mostrarla seria mentirle a un cliente real y hacerle perder el tiempo. Nunca cambies ni redondees un precio, y nunca agregues caracteristicas que la descripcion no menciona (piscina, gimnasio, etc.). Si el bloque tiene 1 sola propiedad, muestra 1 sola; NUNCA "completes" la lista hasta 3 con opciones inventadas.
- PROACTIVIDAD CON FOTOS: cuando el cliente muestre interes claro en una propiedad especifica ("me gusta", "esa", "me interesa", "que precio tiene", o cualquier cosa positiva sobre esa propiedad en particular), AUTOMATICAMENTE llama a enviar_fotos_propiedad sin que lo pida. Las fotos son el cierre, no esperes a que pregunte. Luego en tu siguiente respuesta comenta sobre las fotos y por que esa propiedad le conviene.
- SUGERENCIAS SIMILARES AUTOMATICAS: si el cliente no muestra entusiasmo por las opciones (dice "no me convence", "muy caro", "quiero mas dormitorios", etc.), automaticamente busca y sugiere 1-2 propiedades similares (misma zona/tipo/operacion, solo varia dormitorios o presupuesto segun lo que pide) y directamente llama enviar_fotos_propiedad de esas para que las vea. Di algo como "Tengo estas otras que creo te van a gustar mas 😊 Miralas" — no preguntes si quiere ver, simplemente muestra.
- ETAPAS DE CONVERSION (respeta el orden, no te saltes etapas): despues de enviar fotos, tu siguiente mensaje pregunta QUE LE PARECIERON, no ofrezcas agendar visita todavia. Solo cuando el cliente reaccione positivo a las fotos ("me gusta", "esta linda") ofreces agendar la visita. Si pide fotos, manda fotos (no le respondas con "agenda una visita"); si ya las tiene y reacciona bien, ahi si cierras con la visita.
- ENTIENDE LAS NECESIDADES REALES: no solo completes los datos del flujo mecanicamente. Si el cliente menciona algo importante ("quiero con patio", "que sea seguro", "cerca del metro", "para vivir con mi familia"), GUARDA ESO en observaciones con actualizar_datos_lead y luego EXPLICA en cada propiedad por que cumple o no eso que pidio. No es solo "Precio X, Dormitorios Y" — es "Esta tiene patio grande que pediste, zona tranquila, y esta a 10 min del metro 📍".
- Cuando presentes propiedades, redacta en prosa natural (2-3 frases) que explique POR QUE esa propiedad le conviene AL CLIENTE, no una lista de datos. Usa lo que ya te dijo: si busca familia, resalta espacios; si busca inversion, resalta ubicacion; si busca economico, resalta que es el mas accesible del grupo. Incluye siempre el codigo de referencia de cada una (ej: "ref P083") para que el cliente pueda nombrarla despues.
- EMOJIS EN CADA OPCION: cuando listes propiedades (sea 1 o 3), cada una debe tener 1 emoji que ayude a diferenciarla o resaltar su mejor caracteristica (🏡 para casas, 🏢 para depa lujoso, 💰 para barato, 🌳 para con verde, etc.).
- Si con los filtros del cliente no hay ninguna propiedad que calce, NUNCA digas simplemente "no hay propiedades". Ofrece ajustar: "No encontre exactamente con esos requisitos, pero veamos... ¿Te abres a ver con 2 dormitorios en vez de 3? 🔍 Tengo unas interesantes en esa zona."
- No cierres ventas directamente, tu rol es calificar al prospecto y agendar visitas reales o derivar a un asesor.
- Usa derivar_a_asesor SOLO si: el cliente lo pide explicitamente, esta molesto o insiste, o la consulta esta totalmente fuera de tu alcance (tramites legales complejos). Es la excepcion, no la regla. Pedir mover/cambiar una visita NUNCA es motivo para derivar.
- Cuando obtengas un dato nuevo (zona, operacion, tipo, dormitorios, presupuesto, necesidad especial) llama a actualizar_datos_lead de inmediato.
- Para agendar visita: solo despues de que el cliente mostro interes claro y vio las fotos. Confirma fecha/hora y llama agendar_visita. Si no hay disponibilidad, propone otro horario.
- Si el cliente quiere cambiar una visita ya agendada: llama reprogramar_visita con la nueva fecha/hora.
- Las respuestas pueden ser largas si eso suena mas humano (explicar POR QUE una propiedad le conviene, reaccionar a lo que dijo, dar contexto): prioriza ser util y real por sobre brevedad extrema.`;
}

async function obtenerContexto() {
  return listarDisponibles();
}

// helpers: { numero, getOrCreateLead, updateLead, ESTADOS_LEAD }
async function ejecutarFuncion(toolCall, contexto, helpers) {
  const args = JSON.parse(toolCall.function.arguments || "{}");
  const { numero, getOrCreateLead, updateLead, ESTADOS_LEAD } = helpers;

  if (toolCall.function.name === "actualizar_datos_lead") {
    await updateLead(numero, { ...args, estadoLead: ESTADOS_LEAD.EN_CONVERSACION });
    return null;
  }

  if (toolCall.function.name === "agendar_visita") {
    const propiedad = await obtenerPropiedad(args.idPropiedad);
    if (!propiedad) {
      return `No encontre la propiedad ${args.idPropiedad}. Revisemos cual es la que te interesa.`;
    }

    const { disponible, motivo } = await verificarDisponibilidad(args.fecha, args.hora);
    if (!disponible) {
      return `Ese horario no esta disponible (${motivo}). ¿Quieres proponer otra fecha u hora dentro de nuestro horario de atencion?`;
    }

    const lead = await getOrCreateLead(numero);
    const cita = await crearCita({
      idLead: numero,
      nombre: lead.nombre,
      whatsapp: numero,
      propiedadId: propiedad.id,
      fecha: args.fecha,
      hora: args.hora,
    });

    await updateLead(numero, { fechaVisita: args.fecha, horaVisita: args.hora, estadoLead: ESTADOS_LEAD.VISITA_AGENDADA });

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
    const citaActiva = await obtenerCitaActivaPorLead(numero);
    if (!citaActiva) {
      return "No encontre ninguna visita activa a tu nombre para reprogramar. ¿Quieres agendar una nueva?";
    }

    const { disponible, motivo } = await verificarDisponibilidad(args.fecha, args.hora);
    if (!disponible) {
      return `Ese horario no esta disponible (${motivo}). Tu cita anterior sigue como estaba. ¿Quieres proponer otra fecha u hora?`;
    }

    await actualizarEstadoCita(citaActiva.id, "cancelada");
    if (GOOGLE_CALENDAR_HABILITADO && citaActiva.googleEventId) {
      try {
        await cancelarEventoVisita(citaActiva.googleEventId);
      } catch (err) {
        console.error("No se pudo cancelar el evento viejo en Google Calendar:", err.message);
      }
    }

    const propiedad = await obtenerPropiedad(citaActiva.propiedadId);
    const lead = await getOrCreateLead(numero);
    const nuevaCita = await crearCita({
      idLead: numero,
      nombre: lead.nombre,
      whatsapp: numero,
      propiedadId: citaActiva.propiedadId,
      fecha: args.fecha,
      hora: args.hora,
    });

    await updateLead(numero, { fechaVisita: args.fecha, horaVisita: args.hora, estadoLead: ESTADOS_LEAD.VISITA_AGENDADA });

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
    const propiedad = contexto.find((p) => p.id === args.idPropiedad) || (await obtenerPropiedad(args.idPropiedad));
    if (!propiedad) return "No encontre esa propiedad para mostrarte las fotos.";
    if (!propiedad.fotos?.length) return `Por ahora no tengo fotos cargadas de la propiedad ${propiedad.id}, pero puedo darte mas detalles.`;

    // Anti-loop: si ya se enviaron las fotos de esta propiedad en la
    // conversacion, no se reenvia lo mismo; se redirige a la siguiente accion.
    const leadActual = await getOrCreateLead(numero);
    const fotosEnviadas = (leadActual.datosBot && leadActual.datosBot.fotosEnviadas) || [];
    if (fotosEnviadas.includes(propiedad.id)) {
      return `Ya te envie todas las fotos disponibles de la propiedad ${propiedad.id} 📸 ¿Quieres:\n1) Mas informacion\n2) Agendar una visita\n3) Ver otras opciones parecidas?`;
    }

    await enviarImagenes(numero, propiedad.fotos, fichaPropiedad(propiedad));
    if (helpers.updateDatosBot) {
      await helpers.updateDatosBot(numero, { fotosEnviadas: [...fotosEnviadas, propiedad.id] });
    }
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
