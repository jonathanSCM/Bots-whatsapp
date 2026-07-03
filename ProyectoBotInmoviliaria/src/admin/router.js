const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const sharp = require("sharp");
const router = express.Router();

const { sessionAuth, crearCookieSesion, cookieLogout, validarCredenciales } = require("./auth");
const { listarLeads, obtenerLeadPorId, updateLead, ESTADOS_LEAD } = require("../state/leadStore");
const {
  listarPropiedades,
  obtenerPropiedad,
  crearPropiedad,
  actualizarPropiedad,
  eliminarPropiedad,
} = require("../state/propiedadStore");
const { obtenerHorario, actualizarHorario } = require("../state/disponibilidadStore");
const { listarCitas, actualizarEstadoCita } = require("../state/citaStore");
const { listarCategorias, crearCategoria, eliminarCategoria } = require("../state/categoriaStore");
const { resolverLinkMaps, geocodificar } = require("../services/geo");

const UPLOADS_DIR = path.join(__dirname, "..", "..", "data", "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
});

// Las fotos deben ser publicas (sin login) para que WhatsApp/Meta pueda
// descargarlas y enviarlas en el chat. Por eso se registran ANTES del
// sessionAuth, que protege el resto del backoffice.
router.use("/uploads", express.static(UPLOADS_DIR));

// Login publico (sin sesion) y los assets que necesita para verse bien:
// si fueran servidos junto al resto del panel (despues de sessionAuth),
// el navegador no podria cargarlos antes de loguearse.
router.get("/login", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
router.get("/login.js", (req, res) => res.sendFile(path.join(__dirname, "public", "login.js")));
router.get("/style.css", (req, res) => res.sendFile(path.join(__dirname, "public", "style.css")));
router.use("/assets", express.static(path.join(__dirname, "public", "assets")));

router.post("/login", (req, res) => {
  const { usuario, clave } = req.body || {};
  if (!validarCredenciales(usuario, clave)) {
    return res.status(401).json({ error: "Usuario o clave incorrectos" });
  }
  res.set("Set-Cookie", crearCookieSesion());
  res.json({ ok: true });
});

router.post("/logout", (_req, res) => {
  res.set("Set-Cookie", cookieLogout());
  res.json({ ok: true });
});

router.use(sessionAuth);
router.use(express.static(path.join(__dirname, "public")));

function urlPublicaDeArchivo(req, filename) {
  return `${req.protocol}://${req.get("host")}/admin/uploads/${filename}`;
}

// WhatsApp Cloud API solo entrega mensajes de imagen en jpeg o png (webp
// es aceptado por la API pero nunca se entrega, salvo como sticker). Para
// no depender del formato que suba el admin, toda foto se convierte a jpeg.
async function convertirFotosAJpg(files) {
  const nombres = [];
  for (const file of files || []) {
    const nombreJpg = `${path.parse(file.filename).name}.jpg`;
    const rutaJpg = path.join(UPLOADS_DIR, nombreJpg);
    await sharp(file.path).rotate().jpeg({ quality: 85 }).toFile(rutaJpg);
    if (file.path !== rutaJpg) fs.unlinkSync(file.path);
    nombres.push(nombreJpg);
  }
  return nombres;
}

// ---------- Leads ----------
router.get("/api/leads", async (_req, res) => res.json(await listarLeads()));

router.get("/api/leads/:id", async (req, res) => {
  const lead = await obtenerLeadPorId(req.params.id);
  if (!lead) return res.status(404).json({ error: "Lead no encontrado" });
  res.json(lead);
});

router.put("/api/leads/:id", async (req, res) => {
  const camposPermitidos = ["nombre", "tipoOperacion", "tipoPropiedad", "zonaInteres", "presupuesto", "dormitorios", "observaciones", "nivelInteres"];
  const datos = {};
  for (const campo of camposPermitidos) {
    if (campo in req.body) datos[campo] = req.body[campo] === "" ? null : req.body[campo];
  }
  const lead = await obtenerLeadPorId(req.params.id);
  if (!lead) return res.status(404).json({ error: "Lead no encontrado" });
  res.json(await updateLead(req.params.id, datos));
});

router.post("/api/leads/:id/estado", async (req, res) => {
  const { estado } = req.body;
  if (!Object.values(ESTADOS_LEAD).includes(estado)) return res.status(400).json({ error: "Estado invalido" });
  res.json(await updateLead(req.params.id, { estadoLead: estado }));
});

// ---------- Propiedades ----------
router.get("/api/propiedades", async (_req, res) => res.json(await listarPropiedades()));

router.get("/api/propiedades/:id", async (req, res) => {
  const propiedad = await obtenerPropiedad(req.params.id);
  if (!propiedad) return res.status(404).json({ error: "Propiedad no encontrada" });
  res.json(propiedad);
});

// Coordenadas de la propiedad: primero del link de Google Maps (exacto);
// si no hay link, se geocodifica el texto de la zona (aproximado). Se
// recalcula solo cuando el link o la zona cambian.
async function conCoordenadas(datos, actual = {}) {
  const linkCambio = datos.ubicacionMaps !== undefined && datos.ubicacionMaps !== actual.ubicacionMaps;
  const zonaCambio = datos.zona !== undefined && datos.zona !== actual.zona;
  if (!linkCambio && !zonaCambio && actual.lat != null) return datos;

  const link = datos.ubicacionMaps !== undefined ? datos.ubicacionMaps : actual.ubicacionMaps;
  let coords = link ? await resolverLinkMaps(link) : null;
  if (!coords) coords = await geocodificar(datos.zona !== undefined ? datos.zona : actual.zona);
  return { ...datos, lat: coords?.lat ?? null, lng: coords?.lng ?? null };
}

router.post("/api/propiedades", upload.array("fotos", 8), async (req, res) => {
  const nombres = await convertirFotosAJpg(req.files);
  const fotos = nombres.map((n) => urlPublicaDeArchivo(req, n));
  const datos = await conCoordenadas({ ...req.body, fotos });
  const propiedad = await crearPropiedad(datos);
  res.json(propiedad);
});

router.put("/api/propiedades/:id", upload.array("fotos", 8), async (req, res) => {
  const propiedad = await obtenerPropiedad(req.params.id);
  if (!propiedad) return res.status(404).json({ error: "Propiedad no encontrada" });

  const nombres = await convertirFotosAJpg(req.files);
  const fotosNuevas = nombres.map((n) => urlPublicaDeArchivo(req, n));
  const fotosExistentes = req.body.fotosExistentes ? JSON.parse(req.body.fotosExistentes) : propiedad.fotos;
  const fotos = [...fotosExistentes, ...fotosNuevas];

  const datos = await conCoordenadas({ ...req.body, fotos }, propiedad);
  res.json(await actualizarPropiedad(req.params.id, datos));
});

router.delete("/api/propiedades/:id", async (req, res) => {
  await eliminarPropiedad(req.params.id);
  res.json({ ok: true });
});

// ---------- Categorias ----------
router.get("/api/categorias", (_req, res) => res.json(listarCategorias()));

router.post("/api/categorias", (req, res) => {
  try {
    res.json(crearCategoria(req.body.nombre));
  } catch (err) {
    res.status(400).json({ error: err.message.includes("UNIQUE") ? "Esa categoria ya existe" : err.message });
  }
});

router.delete("/api/categorias/:id", (req, res) => {
  res.json(eliminarCategoria(req.params.id));
});

// ---------- Disponibilidad ----------
router.get("/api/disponibilidad", async (_req, res) => res.json(await obtenerHorario()));

router.post("/api/disponibilidad", async (req, res) => {
  const { dias } = req.body;
  if (!Array.isArray(dias)) return res.status(400).json({ error: "Formato invalido" });
  res.json(await actualizarHorario(dias));
});

// ---------- Citas ----------
router.get("/api/citas", async (_req, res) => res.json(await listarCitas()));

router.post("/api/citas/:id/estado", async (req, res) => {
  const { estado } = req.body;
  if (!["confirmada", "cancelada", "completada"].includes(estado)) return res.status(400).json({ error: "Estado invalido" });
  await actualizarEstadoCita(req.params.id, estado);
  res.json({ ok: true });
});

// ---------- Resumen / estadisticas ----------
router.get("/api/resumen", async (_req, res) => {
  const leads = await listarLeads();
  const citas = await listarCitas();
  const propiedades = await listarPropiedades();

  const hoyISO = new Date().toLocaleDateString("en-CA", { timeZone: "America/La_Paz" });

  res.json({
    totalLeads: leads.length,
    leadsCalificados: leads.filter((l) => l.estadoLead === ESTADOS_LEAD.CALIFICADO).length,
    leadsDerivados: leads.filter((l) => l.estadoLead === ESTADOS_LEAD.DERIVADO).length,
    totalPropiedades: propiedades.length,
    propiedadesDisponibles: propiedades.filter((p) => p.estado === "disponible").length,
    citasConfirmadas: citas.filter((c) => c.estado === "confirmada").length,
    citasHoy: citas.filter((c) => c.estado === "confirmada" && c.fecha === hoyISO).length,
    totalCitas: citas.length,
  });
});

module.exports = router;
