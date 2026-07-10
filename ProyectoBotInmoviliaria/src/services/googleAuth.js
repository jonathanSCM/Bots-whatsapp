// Algunas plataformas (Coolify incluida) pueden alterar los "\n" literales
// de una variable de entorno al guardarla, lo que corrompe la clave PEM y
// causa errores de decodificacion (DECODER routines::unsupported) que no
// tienen nada que ver con la clave en si. Para evitar ese problema por
// completo, se prefiere GOOGLE_PRIVATE_KEY_BASE64 (la clave PEM completa
// codificada en base64, un solo bloque sin backslashes ni saltos de linea
// que ninguna plataforma pueda corromper). Si no esta seteada, se usa
// GOOGLE_PRIVATE_KEY con el reemplazo de \n de siempre.
function obtenerClavePrivada() {
  if (process.env.GOOGLE_PRIVATE_KEY_BASE64) {
    return Buffer.from(process.env.GOOGLE_PRIVATE_KEY_BASE64, "base64").toString("utf8");
  }
  return (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
}

module.exports = { obtenerClavePrivada };
