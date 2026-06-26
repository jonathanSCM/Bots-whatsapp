const TIMEZONE_NEGOCIO = "America/La_Paz";

// Devuelve fecha/hora actual como string "YYYY-MM-DD HH:mm:ss" en hora de La Paz.
function ahoraLaPaz() {
  const ahora = new Date();
  const fecha = ahora.toLocaleDateString("en-CA", { timeZone: TIMEZONE_NEGOCIO });
  const hora = ahora.toLocaleTimeString("en-GB", { timeZone: TIMEZONE_NEGOCIO });
  return `${fecha} ${hora}`;
}

module.exports = { TIMEZONE_NEGOCIO, ahoraLaPaz };
