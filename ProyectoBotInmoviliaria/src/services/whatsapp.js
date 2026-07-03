const axios = require("axios");

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const BASE_URL = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;

// WhatsApp NO entiende Markdown: la negrita es *un solo asterisco* pegado al
// texto (sin espacios adentro). El modelo a veces escribe **doble asterisco**
// (Markdown) o deja espacios (* texto *), y eso se muestra como asteriscos
// literales en el chat. Este sanitizador convierte todo al formato WhatsApp.
function formatoWhatsApp(texto) {
  if (!texto) return texto;
  return (
    texto
      // **negrita** o __negrita__ (Markdown) -> *negrita*
      .replace(/\*\*([^*]+?)\*\*/g, "*$1*")
      .replace(/__([^_]+?)__/g, "_$1_")
      // titulos Markdown (## Titulo) -> *Titulo*
      .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
      // espacios pegados a los asteriscos cuando la linea entera es una
      // negrita envuelta (* texto *) -> *texto*. Solo linea completa, para
      // no romper asteriscos sueltos legitimos (ej. "2 * 3 = 6").
      .replace(/^(\s*)\*\s+([^*\n]*?)\s*\*(\s*)$/gm, "$1*$2*$3")
      .replace(/^(\s*)\*\s*([^*\n]*?)\s+\*(\s*)$/gm, "$1*$2*$3")
  );
}

async function enviarMensaje(numeroDestino, texto) {
  try {
    await axios.post(
      BASE_URL,
      {
        messaging_product: "whatsapp",
        to: numeroDestino,
        type: "text",
        text: { body: formatoWhatsApp(texto) },
      },
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
  } catch (err) {
    console.error("Error enviando mensaje de WhatsApp:", err.response?.data || err.message);
  }
}

async function enviarImagen(numeroDestino, urlImagen, caption) {
  try {
    await axios.post(
      BASE_URL,
      {
        messaging_product: "whatsapp",
        to: numeroDestino,
        type: "image",
        image: { link: urlImagen, caption: formatoWhatsApp(caption) || "" },
      },
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
  } catch (err) {
    console.error("Error enviando imagen de WhatsApp:", err.response?.data || err.message);
  }
}

// Manda un mensaje interactivo tipo "lista" (hasta 10 opciones en una sola
// seccion). Se usa para el menu de seleccion de bot cuando alguien escribe
// sin especificar a cual demo se refiere.
async function enviarLista(numeroDestino, bodyText, buttonText, sections) {
  try {
    await axios.post(
      BASE_URL,
      {
        messaging_product: "whatsapp",
        to: numeroDestino,
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: bodyText },
          action: { button: buttonText, sections },
        },
      },
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
  } catch (err) {
    console.error("Error enviando lista de WhatsApp:", err.response?.data || err.message);
  }
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Manda varias imagenes en secuencia con una pequeña pausa entre cada una.
// Sin esta pausa, WhatsApp Cloud API acepta todas las llamadas (devuelve un
// id de mensaje exitoso para cada una) pero en la practica solo entrega la
// ultima si se mandan demasiado rapido una tras otra.
// La primera imagen puede llevar un caption (la ficha de la propiedad, estilo
// portal inmobiliario); las siguientes van limpias para no repetir el texto.
async function enviarImagenes(numeroDestino, urlsImagenes, captionPrimera) {
  let primera = true;
  for (const url of urlsImagenes) {
    await enviarImagen(numeroDestino, url, primera ? captionPrimera : undefined);
    primera = false;
    await esperar(1200);
  }
}

module.exports = { enviarMensaje, enviarImagen, enviarImagenes, enviarLista };
