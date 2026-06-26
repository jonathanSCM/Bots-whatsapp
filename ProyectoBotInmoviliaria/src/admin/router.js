const express = require("express");
const path = require("path");
const router = express.Router();

const { basicAuth } = require("./auth");
const { listarLeads, obtenerLeadPorId, updateLead, ESTADOS_LEAD } = require("../state/leadStore");

router.use(basicAuth);
router.use(express.static(path.join(__dirname, "public")));

router.get("/api/leads", (_req, res) => {
  res.json(listarLeads());
});

router.get("/api/leads/:id", (req, res) => {
  const lead = obtenerLeadPorId(req.params.id);
  if (!lead) return res.status(404).json({ error: "Lead no encontrado" });
  res.json(lead);
});

router.post("/api/leads/:id/estado", (req, res) => {
  const { estado } = req.body;
  if (!Object.values(ESTADOS_LEAD).includes(estado)) {
    return res.status(400).json({ error: "Estado invalido" });
  }
  const lead = updateLead(req.params.id, { estadoLead: estado });
  res.json(lead);
});

router.get("/api/resumen", (_req, res) => {
  const leads = listarLeads();
  res.json({
    totalLeads: leads.length,
    leadsCalificados: leads.filter((l) => l.estadoLead === ESTADOS_LEAD.CALIFICADO).length,
    leadsInteresados: leads.filter((l) => l.estadoLead === ESTADOS_LEAD.INTERESADO_COTIZACION).length,
    leadsDerivados: leads.filter((l) => l.estadoLead === ESTADOS_LEAD.DERIVADO).length,
  });
});

module.exports = router;
