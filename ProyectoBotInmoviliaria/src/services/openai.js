const OpenAI = require("openai");

let client;
function getClient() {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

// Generico: cada bot (inmobiliaria, restaurante, etc.) define su propio
// system prompt y sus propias tools en src/bots/<id>.js
async function generarRespuesta(historialMensajes, systemPrompt, tools = []) {
  const mensajes = [{ role: "system", content: systemPrompt }, ...historialMensajes];

  const respuesta = await getClient().chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o",
    temperature: 0.3,
    messages: mensajes,
    tools,
    tool_choice: "auto",
  });

  return respuesta.choices[0].message;
}

module.exports = { generarRespuesta };
