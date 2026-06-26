function basicAuth(req, res, next) {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASS;

  if (!user || !pass) {
    return res.status(503).send("Backoffice no configurado: define ADMIN_USER y ADMIN_PASS en el .env");
  }

  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");

  if (scheme === "Basic" && encoded) {
    const [u, p] = Buffer.from(encoded, "base64").toString().split(":");
    if (u === user && p === pass) return next();
  }

  res.set("WWW-Authenticate", 'Basic realm="Backoffice ProShop"');
  return res.status(401).send("Autenticacion requerida");
}

module.exports = { basicAuth };
