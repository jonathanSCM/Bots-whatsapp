const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const router = express.Router();

const { basicAuth } = require("./auth");
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
// basicAuth, que protege el resto del backoffice.
router.use("/uploads", express.static(UPLOADS_DIR));

router.use(basicAuth);
router.use(express.static(path.join(__dirname, "public")));

function urlPublicaDeArchivo(req, filename) {
  return `${req.protocol}://${req.get("host")}/admin/uploads/${filename}`;
}

// ---------- Leads ----------
router.get("/api/leads", (_req, res) => res.json(listarLeads()));

router.get("/api/leads/:id", (req, res) => {
  const lead = obtenerLeadPorId(req.params.id);
  if (!lead) return res.status(404).json({ error: "Lead no encontrado" });
  res.json(lead);
});

router.post("/api/leads/:id/estado", (req, res) => {
  const { estado } = req.body;
  if (!Object.values(ESTADOS_LEAD).includes(estado)) return res.status(400).json({ error: "Estado invalido" });
  res.json(updateLead(req.params.id, { estadoLead: estado }));
});

// ---------- Propiedades ----------
router.get("/api/propiedades", (_req, res) => res.json(listarPropiedades()));

router.get("/api/propiedades/:id", (req, res) => {
  const propiedad = obtenerPropiedad(req.params.id);
  if (!propiedad) return res.status(404).json({ error: "Propiedad no encontrada" });
  res.json(propiedad);
});

router.post("/api/propiedades", upload.array("fotos", 8), (req, res) => {
  const fotos = (req.files || []).map((f) => urlPublicaDeArchivo(req, f.filename));
  const propiedad = crearPropiedad({ ...req.body, fotos });
  res.json(propiedad);
});

router.put("/api/propiedades/:id", upload.array("fotos", 8), (req, res) => {
  const propiedad = obtenerPropiedad(req.params.id);
  if (!propiedad) return res.status(404).json({ error: "Propiedad no encontrada" });

  const fotosNuevas = (req.files || []).map((f) => urlPublicaDeArchivo(req, f.filename));
  const fotosExistentes = req.body.fotosExistentes ? JSON.parse(req.body.fotosExistentes) : propiedad.fotos;
  const fotos = [...fotosExistentes, ...fotosNuevas];

  res.json(actualizarPropiedad(req.params.id, { ...req.body, fotos }));
});

router.delete("/api/propiedades/:id", (req, res) => {
  eliminarPropiedad(req.params.id);
  res.json({ ok: true });
});

// ---------- Disponibilidad ----------
router.get("/api/disponibilidad", (_req, res) => res.json(obtenerHorario()));

router.post("/api/disponibilidad", (req, res) => {
  const { dias } = req.body;
  if (!Array.isArray(dias)) return res.status(400).json({ error: "Formato invalido" });
  res.json(actualizarHorario(dias));
});

// ---------- Citas ----------
router.get("/api/citas", (_req, res) => res.json(listarCitas()));

router.post("/api/citas/:id/estado", (req, res) => {
  const { estado } = req.body;
  if (!["confirmada", "cancelada", "completada"].includes(estado)) return res.status(400).json({ error: "Estado invalido" });
  actualizarEstadoCita(req.params.id, estado);
  res.json({ ok: true });
});

// ---------- Resumen / estadisticas ----------
router.get("/api/resumen", (_req, res) => {
  const leads = listarLeads();
  const citas = listarCitas();
  const propiedades = listarPropiedades();

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
