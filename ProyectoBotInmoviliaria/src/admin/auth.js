const crypto = require("crypto");

const COOKIE_NAME = "habitad_session";
const DURACION_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

function getSecret() {
  return crypto
    .createHash("sha256")
    .update(`${process.env.ADMIN_USER || ""}:${process.env.ADMIN_PASS || ""}`)
    .digest("hex");
}

function firmar(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const firma = crypto.createHmac("sha256", getSecret()).update(data).digest("hex");
  return `${data}.${firma}`;
}

function verificarToken(token) {
  if (!token || !token.includes(".")) return false;
  const [data, firma] = token.split(".");
  const firmaEsperada = crypto.createHmac("sha256", getSecret()).update(data).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(firmaEsperada))) return false;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    return payload.exp > Date.now();
  } catch {
    return false;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return header.split(";").reduce((acc, parte) => {
    const i = parte.indexOf("=");
    if (i === -1) return acc;
    acc[parte.slice(0, i).trim()] = decodeURIComponent(parte.slice(i + 1).trim());
    return acc;
  }, {});
}

function crearCookieSesion() {
  const token = firmar({ exp: Date.now() + DURACION_MS });
  const segundos = Math.floor(DURACION_MS / 1000);
  return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${segundos}; SameSite=Lax`;
}

function cookieLogout() {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
}

function tieneSesionValida(req) {
  const cookies = parseCookies(req);
  return verificarToken(cookies[COOKIE_NAME]);
}

function validarCredenciales(usuario, clave) {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASS;
  if (!user || !pass) return false;
  return usuario === user && clave === pass;
}

// Protege /admin: si no hay sesion valida, las paginas redirigen al login
// y las llamadas a /api responden 401 en JSON.
function sessionAuth(req, res, next) {
  if (!process.env.ADMIN_USER || !process.env.ADMIN_PASS) {
    return res.status(503).send("Backoffice no configurado: define ADMIN_USER y ADMIN_PASS en el .env");
  }
  if (tieneSesionValida(req)) return next();

  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ error: "Sesion requerida" });
  }
  return res.redirect("/admin/login");
}

module.exports = { sessionAuth, crearCookieSesion, cookieLogout, validarCredenciales, tieneSesionValida };
