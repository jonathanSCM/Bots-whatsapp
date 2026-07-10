const express = require("express");
const router = express.Router();

const { enviarMensaje } = require("../services/whatsapp");
const { generarRespuesta } = require("../services/openai");
const { getBot, DEFAULT_BOT_ID } = require("../bots");
const {
  getOrCreateLead,
  updateLead,
  updateDatosBot,
  appendHistorial,
  ESTADOS_LEAD,
} = require("../state/leadStore");

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
    // interactivo (lista o botones).
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
  const textoParaIA = texto;

  // Nota: aunque el lead este "derivado_a_asesor", el bot SIGUE respondiendo.
  // Dejarlo mudo era peor experiencia (el asesor puede tardar y el cliente
  // queda hablando solo). El estado queda marcado en el panel para que el
  // equipo humano lo vea, pero la conversacion automatica no se corta.

  const bot = getBot(DEFAULT_BOT_ID);

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
    // Si respondio con un numero a un menu del bot ("1"), se traduce a la
    // opcion real ("Terreno") antes de extraer filtros, para no dejar el lead
    // con el filtro viejo cuando el cliente eligio del menu.
    let textoExtraccion = textoParaIA;
    if (bot.resolverSeleccionMenu) {
      const opcion = bot.resolverSeleccionMenu(textoParaIA, lead.historial);
      if (opcion) {
        console.log(`--- [${bot.id}] seleccion de menu "${textoParaIA}" -> "${opcion}"`);
        textoExtraccion = opcion;
      }
    }
    const detectados = bot.extraerFiltros(textoExtraccion, contexto);
    // Las observaciones (necesidades: piscina, jardin...) se acumulan, no se
    // reemplazan: se agregan solo los terminos que aun no estaban guardados.
    if (detectados.observaciones && lead.observaciones) {
      const actuales = lead.observaciones.toLowerCase();
      const nuevas = detectados.observaciones.split(", ").filter((t) => !actuales.includes(t));
      if (nuevas.length) detectados.observaciones = `${lead.observaciones}, ${nuevas.join(", ")}`;
      else delete detectados.observaciones;
    }
    const nuevos = Object.fromEntries(Object.entries(detectados).filter(([campo, valor]) => valor && lead[campo] !== valor));
    if (Object.keys(nuevos).length) {
      console.log(`--- [${bot.id}] filtros detectados por codigo:`, JSON.stringify(nuevos));
      lead = await updateLead(numero, nuevos);
    }
  }

  const helpers = {
    numero,
    getOrCreateLead,
    updateLead,
    updateDatosBot,
    ESTADOS_LEAD,
  };

  // Bucle estandar de tool-calling: el modelo llama funciones, recibe sus
  // resultados como mensajes "tool" y recien entonces redacta. Asi ve lo que
  // realmente paso (tarjetas ya enviadas, lead actualizado, visita agendada)
  // y no puede prometer a futuro ni contradecir sus propias acciones, que era
  // lo que pasaba con la vieja "segunda pasada" sin herramientas (inventaba
  // placeholders tipo "Mostrando propiedades..." porque no podia llamarlas).
  const mensajesTurno = [];
  let respuestaIA;
  let leadTurno = lead;
  const MAX_VUELTAS = 3;
  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    // El prompt se rearma en cada vuelta: si una funcion cambio el lead, el
    // catalogo filtrado que ve el modelo ya queda recalculado.
    const prompt = await bot.systemPrompt(contexto, leadTurno, { mensajeCliente: textoParaIA });
    const esUltimaVuelta = vuelta === MAX_VUELTAS - 1;
    respuestaIA = await generarRespuesta([...historialParaIA, ...mensajesTurno], prompt, esUltimaVuelta ? [] : bot.tools);
    if (!respuestaIA.tool_calls?.length) break;

    mensajesTurno.push({ role: "assistant", content: respuestaIA.content || null, tool_calls: respuestaIA.tool_calls });
    for (const toolCall of respuestaIA.tool_calls) {
      console.log(`--- [${bot.id}] function call:`, toolCall.function.name, toolCall.function.arguments);
      const resultado = await bot.ejecutarFuncion(toolCall, contexto, helpers);
      mensajesTurno.push({ role: "tool", tool_call_id: toolCall.id, content: resultado || "Hecho." });
    }
    leadTurno = await getOrCreateLead(numero);
  }

  const textoFinal = respuestaIA.content || "Gracias por tu mensaje, lo estamos procesando.";
  await appendHistorial(numero, "assistant", textoFinal);
  console.log(`<<< [${bot.id}] BOT:`, textoFinal);
  await enviarMensaje(numero, textoFinal);

  return textoFinal;
}

module.exports = router;
module.exports.procesarMensaje = procesarMensaje;
