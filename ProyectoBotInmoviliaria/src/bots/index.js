const inmobiliaria = require("./inmobiliaria");

const bots = { inmobiliaria };

const DEFAULT_BOT_ID = "inmobiliaria";

function getBot(id) {
  return bots[id] || bots[DEFAULT_BOT_ID];
}

module.exports = { bots, getBot, DEFAULT_BOT_ID };
