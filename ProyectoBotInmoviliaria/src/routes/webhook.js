const express = require("express");
const router = express.Router();

const { enviarMensaje } = require("../services/whatsapp");
const { generarRespuesta } = require("../services/openai");
const { registrarLeadNegocio } = require("../services/sheets");
const { getBot, DEFAULT_BOT_ID } = require("../bots");
const {
  getOrCreateLead,
  updateLead,
  appendHistorial,
  ESTADOS_LEAD,
} = require("../state/leadStore");

const GOOGLE_SHEETS_HABILITADO = Boolean(process.env.GOOGLE_SHEET_ID);

// Los mensajes que vienen de la web de demos son texto natural (sin tags ni
// corchetes) para que se vean normales en el chat, por ejemplo:
// "Hola, vengo de la web de ProShop, quiero ver el demo del bot Restaurante".
// Aqui detectamos el origen y a que bot pertenece la conversacion.
const FRASE_ORIGEN_WEB = /vengo de la web de proshop/i;

function detectarOrigenWeb(texto) {
  if (!FRASE_ORIGEN_WEB.test(texto)) return { fuente: null, botId: null };
  if (/mi negocio|para mi empresa/i.test(texto)) return { fuente: "web-contacto", botId: null };
  if (/inmobiliari/i.test(texto)) return { fuente: "web-demo-inmobiliaria", botId: "inmobiliaria" };
  if (/restaurant/i.test(texto)) return { fuente: "web-demo-restaurante", botId: "restaurante" };
  return { fuente: "web-demo", botId: null };
}

// Cada bot demo (inmobiliaria, restaurante, etc.) no es un negocio real, asi
// que no debe agendar nada real. Lo unico que nos interesa capturar para
// ProShop es cuando alguien, durante la demo, muestra interes en tener un
// bot asi para su propio negocio. Esto se guarda en la hoja "Leads" comun.
async function notificarInteresNegocio(numero, botId, interes) {
  if (!GOOGLE_SHEETS_HABILITADO) return;
  try {
    const lead = getOrCreateLead(numero);
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
    const texto = mensaje.text?.body?.trim();
    if (!texto) return;

    await procesarMensaje(numero, texto);
  } catch (err) {
    console.error("Error procesando webhook:", err);
  }
});

async function procesarMensaje(numero, texto) {
  let lead = getOrCreateLead(numero);
  const esLeadNuevo = !lead.fuente || lead.fuente === "whatsapp";
  const { fuente, botId } = detectarOrigenWeb(texto);

  const cambios = {};
  if (fuente && lead.fuente !== fuente) cambios.fuente = fuente;
  // Solo se fija el bot de la conversacion una vez (al inicio); si el cliente
  // ya estaba hablando con un bot, no cambia de bot a mitad de conversacion.
  if (botId && esLeadNuevo) cambios.bot = botId;
  if (Object.keys(cambios).length) lead = updateLead(numero, cambios);

  if (fuente === "web-contacto") {
    await notificarInteresNegocio(numero, lead.bot, "Quiere un agente de WhatsApp con IA para su negocio");
  }

  if (lead.estadoLead === ESTADOS_LEAD.DERIVADO) {
    // Ya esta con un asesor humano, el bot no vuelve a responder automaticamente.
    return;
  }

  const bot = getBot(lead.bot || DEFAULT_BOT_ID);

  lead = appendHistorial(numero, "user", texto);

  const historialParaIA = lead.historial.map((h) => ({
    role: h.rol === "user" ? "user" : "assistant",
    content: h.mensaje,
  }));

  const contexto = await bot.obtenerContexto();
  const respuestaIA = await generarRespuesta(historialParaIA, bot.systemPrompt(contexto, lead), bot.tools);

  const helpers = {
    numero,
    getOrCreateLead,
    updateLead,
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

  const mensajesDeFuncionesUnicos = [...new Set(mensajesDeFunciones)];
  const textoFinal =
    [respuestaIA.content, ...mensajesDeFuncionesUnicos].filter(Boolean).join("\n\n") ||
    "Gracias por tu mensaje, lo estamos procesando.";
  appendHistorial(numero, "assistant", textoFinal);
  console.log(`<<< [${bot.id}] BOT:`, textoFinal);
  await enviarMensaje(numero, textoFinal);

  return textoFinal;
}

module.exports = router;
module.exports.procesarMensaje = procesarMensaje;
