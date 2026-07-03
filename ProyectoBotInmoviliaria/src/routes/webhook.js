const express = require("express");
const router = express.Router();

const { enviarMensaje, enviarLista } = require("../services/whatsapp");
const { generarRespuesta } = require("../services/openai");
const { registrarLeadNegocio } = require("../services/sheets");
const { getBot, DEFAULT_BOT_ID, MENU_BOTS } = require("../bots");
const {
  getOrCreateLead,
  updateLead,
  updateDatosBot,
  appendHistorial,
  ESTADOS_LEAD,
} = require("../state/leadStore");

const GOOGLE_SHEETS_HABILITADO = Boolean(process.env.GOOGLE_SHEET_ID);

// Los mensajes que vienen de la web de demos son texto natural (sin tags ni
// corchetes) para que se vean normales en el chat, por ejemplo:
// "Hola, vengo de la web de ProShop, quiero ver el demo del bot Restaurante".
// Aqui detectamos el origen y a que bot pertenece la conversacion.
const FRASE_ORIGEN_WEB = /vengo de la web de proshop/i;

// Palabra clave del mensaje de la web -> botId. Cada tarjeta de la web manda
// un mensaje natural distinto ("...quiero ver el demo del bot X"); aqui se
// detecta a que bot corresponde por una palabra clave de su nombre.
const PALABRAS_CLAVE_BOT = [
  ["inmobiliari", "inmobiliaria"],
  ["restaurant", "restaurante"],
  ["cl[ií]nica|salud", "clinica"],
  ["tienda online|ecommerce|tienda virtual", "ecommerce"],
  ["soporte", "soporte"],
  ["gimnasio", "gimnasio"],
  ["concesionaria", "concesionaria"],
  ["hotel|turismo", "hotel"],
  ["academia|cursos", "academia"],
  ["delivery|log[ií]stica", "delivery"],
];

function detectarOrigenWeb(texto) {
  if (!FRASE_ORIGEN_WEB.test(texto)) return { fuente: null, botId: null };
  if (/mi negocio|para mi empresa/i.test(texto)) return { fuente: "web-contacto", botId: null };
  for (const [patron, botId] of PALABRAS_CLAVE_BOT) {
    if (new RegExp(patron, "i").test(texto)) return { fuente: `web-demo-${botId}`, botId };
  }
  return { fuente: "web-demo", botId: null };
}

// Prefijo de los ids de fila que manda la lista interactiva del menu de
// seleccion de bot (ver enviarMenuDeBots). Ej: "menu_bot_clinica".
const PREFIJO_ID_MENU = "menu_bot_";

// Mismas palabras clave que detectarOrigenWeb, pero sin requerir la frase
// "vengo de la web de ProShop": fallback por si el cliente escribe el nombre
// del rubro directamente (ej. "quiero hablar con el de gimnasio") en vez de
// tocar la lista interactiva.
function detectarBotPorTextoLibre(texto) {
  for (const [patron, botId] of PALABRAS_CLAVE_BOT) {
    if (new RegExp(patron, "i").test(texto)) return botId;
  }
  return null;
}

// Manda la lista interactiva de WhatsApp con los 10 bots disponibles para
// que el cliente elija con cual quiere hablar.
async function enviarMenuDeBots(numero) {
  const rows = MENU_BOTS.map((b) => ({
    id: `${PREFIJO_ID_MENU}${b.id}`,
    title: b.nombre,
    description: b.descripcion,
  }));
  await enviarLista(
    numero,
    "👋 ¡Hola! Esto es una demostración de ProShop (agentes de WhatsApp con IA). ¿Con cuál de estos asistentes te gustaría hablar?",
    "Ver opciones",
    [{ title: "Bots disponibles", rows }]
  );
}

// Cada bot demo (inmobiliaria, restaurante, etc.) no es un negocio real, asi
// que no debe agendar nada real. Lo unico que nos interesa capturar para
// ProShop es cuando alguien, durante la demo, muestra interes en tener un
// bot asi para su propio negocio. Esto se guarda en la hoja "Leads" comun.
async function notificarInteresNegocio(numero, botId, interes) {
  if (!GOOGLE_SHEETS_HABILITADO) return;
  try {
    const lead = await getOrCreateLead(numero);
    await registrarLeadNegocio({
      bot: botId || lead.bot || "desconocido",
      nombre: lead.nombre,
      whatsapp: numero,
      interes,
      fuente: lead.fuente || "whatsapp",
    });
  } catch (err) {
    console.error("No se pudo registrar el lead de negocio en Sheets:", err.message);
  }
}

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

// Verificacion del webhook (requerida por Meta al configurar)
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Recepcion de mensajes
router.post("/", async (req, res) => {
  res.sendStatus(200); // responder rapido a Meta, procesar despues

  try {
    const entry = req.body.entry?.[0];
    const cambio = entry?.changes?.[0]?.value;
    const mensaje = cambio?.messages?.[0];
    if (!mensaje) return; // eventos de status (entregado/leido), ignorar

    const numero = mensaje.from;
    // Mensaje de texto normal, o el id de la fila/boton elegido en un mensaje
    // interactivo (lista o botones) — ej. el menu de seleccion de bot.
    const texto =
      mensaje.text?.body?.trim() ||
      mensaje.interactive?.list_reply?.id ||
      mensaje.interactive?.button_reply?.id;
    if (!texto) return;

    await procesarMensaje(numero, texto);
  } catch (err) {
    console.error("Error procesando webhook:", err);
  }
});

async function procesarMensaje(numero, texto) {
  let lead = await getOrCreateLead(numero);
  const esLeadNuevo = !lead.fuente || lead.fuente === "whatsapp";
  const { fuente, botId } = detectarOrigenWeb(texto);

  // Seleccion del menu interactivo (toco una fila de la lista de bots), o
  // texto libre que coincide con el nombre de un rubro (fallback si no toco
  // la lista). Solo cuenta si todavia no se establecio un bot para este lead.
  let botIdDesdeMenu = null;
  let textoParaIA = texto;
  if (esLeadNuevo && texto.startsWith(PREFIJO_ID_MENU)) {
    botIdDesdeMenu = texto.slice(PREFIJO_ID_MENU.length);
    textoParaIA = "Hola"; // limpio: no guardar el id crudo de la fila como si lo hubiera escrito el cliente
  } else if (esLeadNuevo && !botId && lead.historial.length === 0) {
    botIdDesdeMenu = detectarBotPorTextoLibre(texto);
  }

  const cambios = {};
  if (fuente && lead.fuente !== fuente) cambios.fuente = fuente;
  // Solo se fija el bot de la conversacion una vez (al inicio); si el cliente
  // ya estaba hablando con un bot, no cambia de bot a mitad de conversacion.
  if (botId && esLeadNuevo) cambios.bot = botId;
  else if (botIdDesdeMenu) {
    cambios.bot = botIdDesdeMenu;
    cambios.fuente = "whatsapp-menu";
  }
  if (Object.keys(cambios).length) lead = await updateLead(numero, cambios);

  if (fuente === "web-contacto") {
    await notificarInteresNegocio(numero, lead.bot, "Quiere un agente de WhatsApp con IA para su negocio");
  }

  // Nota: aunque el lead este "derivado_a_asesor", el bot SIGUE respondiendo.
  // Dejarlo mudo era peor experiencia (el asesor puede tardar y el cliente
  // queda hablando solo). El estado queda marcado en el panel para que el
  // equipo humano lo vea, pero la conversacion automatica no se corta.

  // Primer contacto genuino (nunca hablo, no vino de la web, no eligio bot
  // todavia ni escribio algo reconocible): en vez de arrancar directo con el
  // bot por defecto (Inmobiliaria), se le ofrece elegir con cual rubro hablar.
  if (esLeadNuevo && !fuente && !botIdDesdeMenu && lead.historial.length === 0) {
    await enviarMenuDeBots(numero);
    return;
  }

  const bot = getBot(lead.bot || DEFAULT_BOT_ID);

  lead = await appendHistorial(numero, "user", textoParaIA);

  // Solo los ultimos mensajes: un historial largo lleno de respuestas viejas
  // ("no hay disponible en X") hace que el modelo repita ese patron aunque el
  // system prompt le muestre inventario nuevo. Menos historial = mas peso a
  // la verdad actual del catalogo.
  const historialParaIA = lead.historial.slice(-12).map((h) => ({
    role: h.rol === "user" ? "user" : "assistant",
    content: h.mensaje,
  }));

  const contexto = await bot.obtenerContexto();

  // Filtros detectados por codigo en el mensaje del cliente (zona, tipo,
  // operacion, dormitorios): se aplican al lead ANTES de armar el prompt,
  // sin depender de que el modelo llame a actualizar_datos_lead. Evita que
  // el bot responda "no hay nada en X" mirando el filtro viejo del lead.
  if (bot.extraerFiltros) {
    const detectados = bot.extraerFiltros(textoParaIA, contexto);
    const nuevos = Object.fromEntries(Object.entries(detectados).filter(([campo, valor]) => valor && lead[campo] !== valor));
    if (Object.keys(nuevos).length) {
      console.log(`--- [${bot.id}] filtros detectados por codigo:`, JSON.stringify(nuevos));
      lead = await updateLead(numero, nuevos);
    }
  }

  const respuestaIA = await generarRespuesta(historialParaIA, await bot.systemPrompt(contexto, lead), bot.tools);

  const helpers = {
    numero,
    getOrCreateLead,
    updateLead,
    updateDatosBot,
    ESTADOS_LEAD,
    notificarInteresNegocio: (interes) => notificarInteresNegocio(numero, bot.id, interes),
  };

  const mensajesDeFunciones = [];
  if (respuestaIA.tool_calls?.length) {
    for (const toolCall of respuestaIA.tool_calls) {
      console.log(`--- [${bot.id}] function call:`, toolCall.function.name, toolCall.function.arguments);
      const resultado = await bot.ejecutarFuncion(toolCall, contexto, helpers);
      if (resultado) mensajesDeFunciones.push(resultado);
    }
  }

  // Si el modelo ejecuto funciones en este turno (actualizo el lead, envio
  // fotos, agendo, etc.), el texto que genero junto con esas llamadas fue
  // redactado ANTES de conocer el resultado, y puede contradecirlas (ej.
  // manda las fotos de una propiedad y en el texto dice "no tengo nada").
  // Se regenera el texto final con el catalogo recalculado y contandole al
  // modelo que acciones YA se ejecutaron, para que redacte coherente.
  let contenidoFinal = respuestaIA.content;
  let textoFinal;
  if (respuestaIA.tool_calls?.length) {
    const leadActualizado = await getOrCreateLead(numero);
    let promptActualizado = await bot.systemPrompt(contexto, leadActualizado);
    if (mensajesDeFunciones.length) {
      promptActualizado += `\n\nACCIONES YA EJECUTADAS POR EL SISTEMA EN ESTE MISMO TURNO (ya ocurrieron de verdad, el cliente ya las recibio; tu respuesta debe asumirlas como hechas, sin prometerlas a futuro y sin contradecirlas):\n${[...new Set(mensajesDeFunciones)].map((m) => `- ${m}`).join("\n")}`;
    }
    const segundaPasada = await generarRespuesta(historialParaIA, promptActualizado, []);
    textoFinal = segundaPasada.content || [contenidoFinal, ...new Set(mensajesDeFunciones)].filter(Boolean).join("\n\n");
  } else {
    textoFinal = contenidoFinal;
  }
  textoFinal = textoFinal || "Gracias por tu mensaje, lo estamos procesando.";
  await appendHistorial(numero, "assistant", textoFinal);
  console.log(`<<< [${bot.id}] BOT:`, textoFinal);
  await enviarMensaje(numero, textoFinal);

  return textoFinal;
}

module.exports = router;
module.exports.procesarMensaje = procesarMensaje;
