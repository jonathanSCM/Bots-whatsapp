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

module.exports = { enviarMensaje, enviarImagen };
