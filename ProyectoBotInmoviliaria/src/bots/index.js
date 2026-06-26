const inmobiliaria = require("./inmobiliaria");
const restaurante = require("./restaurante");

const bots = {
  inmobiliaria,
  restaurante,
};

const DEFAULT_BOT_ID = "inmobiliaria";

function getBot(id) {
  return bots[id] || bots[DEFAULT_BOT_ID];
}

module.exports = { bots, getBot, DEFAULT_BOT_ID };
