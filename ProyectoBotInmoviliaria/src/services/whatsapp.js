const axios = require("axios");

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const BASE_URL = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;

async function enviarMensaje(numeroDestino, texto) {
  try {
    await axios.post(
      BASE_URL,
      {
        messaging_product: "whatsapp",
        to: numeroDestino,
        type: "text",
        text: { body: texto },
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
        image: { link: urlImagen, caption: caption || "" },
      },
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
  } catch (err) {
    console.error("Error enviando imagen de WhatsApp:", err.response?.data || err.message);
  }
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Manda varias imagenes en secuencia con una pequeña pausa entre cada una.
// Sin esta pausa, WhatsApp Cloud API acepta todas las llamadas (devuelve un
// id de mensaje exitoso para cada una) pero en la practica solo entrega la
// ultima si se mandan demasiado rapido una tras otra.
async function enviarImagenes(numeroDestino, urlsImagenes, caption) {
  for (const url of urlsImagenes) {
    await enviarImagen(numeroDestino, url, caption);
    await esperar(1200);
  }
}

module.exports = { enviarMensaje, enviarImagen, enviarImagenes };
