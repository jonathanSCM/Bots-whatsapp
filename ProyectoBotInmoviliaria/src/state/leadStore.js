// Almacenamiento persistente de leads (SQLite) y su estado de conversacion.

const db = require("./db");
const { ahoraLaPaz } = require("../utils/fecha");
const { DEFAULT_BOT_ID } = require("../bots");

const ESTADOS_LEAD = {
  NUEVO: "nuevo",
  EN_CONVERSACION: "en_conversacion",
  DATOS_INCOMPLETOS: "datos_incompletos",
  CALIFICADO: "calificado",
  VISITA_SOLICITADA: "visita_solicitada",
  VISITA_AGENDADA: "visita_agendada",
  INTERESADO_COTIZACION: "interesado_en_cotizacion",
  DERIVADO: "derivado_a_asesor",
  CERRADO: "cerrado",
  NO_INTERESADO: "no_interesado",
};

const ESTADOS_CONVERSACION = {
  INICIO: "inicio",
  TIPO_PROPIEDAD: "buscando_tipo_propiedad",
  ZONA: "consultando_zona",
  PRESUPUESTO: "consultando_presupuesto",
  DATOS_PERSONALES: "solicitando_datos_personales",
  AGENDANDO_VISITA: "agendando_visita",
  ESPERANDO_CONFIRMACION: "esperando_confirmacion",
  DERIVADO: "derivado_a_humano",
  CERRADO: "conversacion_cerrada",
};

const selectStmt = db.prepare("SELECT * FROM leads WHERE idLead = ?");
const insertStmt = db.prepare(`
  INSERT INTO leads (idLead, whatsapp, bot, nombre, tipoOperacion, tipoPropiedad, zonaInteres,
    presupuesto, dormitorios, personas, tipoPedido, zonaDelivery, observaciones, nivelInteres,
    fechaVisita, horaVisita, fuente, estadoLead, estadoConversacion, historial, fechaRegistro,
    fechaActualizacion)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const updateStmt = db.prepare(`
  UPDATE leads SET whatsapp=?, bot=?, nombre=?, tipoOperacion=?, tipoPropiedad=?, zonaInteres=?,
    presupuesto=?, dormitorios=?, personas=?, tipoPedido=?, zonaDelivery=?, observaciones=?,
    nivelInteres=?, fechaVisita=?, horaVisita=?, fuente=?, estadoLead=?, estadoConversacion=?,
    historial=?, fechaActualizacion=?
  WHERE idLead=?
`);

function filaToLead(fila) {
  if (!fila) return null;
  return { ...fila, historial: JSON.parse(fila.historial || "[]") };
}

function persistir(lead) {
  const fila = selectStmt.get(lead.idLead);
  const historialJSON = JSON.stringify(lead.historial || []);
  lead.fechaActualizacion = ahoraLaPaz();

  if (!fila) {
    insertStmt.run(
      lead.idLead, lead.whatsapp, lead.bot, lead.nombre, lead.tipoOperacion, lead.tipoPropiedad,
      lead.zonaInteres, lead.presupuesto, lead.dormitorios, lead.personas, lead.tipoPedido,
      lead.zonaDelivery, lead.observaciones, lead.nivelInteres, lead.fechaVisita, lead.horaVisita,
      lead.fuente, lead.estadoLead, lead.estadoConversacion, historialJSON, lead.fechaRegistro,
      lead.fechaActualizacion
    );
  } else {
    updateStmt.run(
      lead.whatsapp, lead.bot, lead.nombre, lead.tipoOperacion, lead.tipoPropiedad, lead.zonaInteres,
      lead.presupuesto, lead.dormitorios, lead.personas, lead.tipoPedido, lead.zonaDelivery,
      lead.observaciones, lead.nivelInteres, lead.fechaVisita, lead.horaVisita, lead.fuente,
      lead.estadoLead, lead.estadoConversacion, historialJSON, lead.fechaActualizacion, lead.idLead
    );
  }
  return lead;
}

function getOrCreateLead(numeroWhatsapp) {
  const fila = selectStmt.get(numeroWhatsapp);
  if (fila) return filaToLead(fila);

  const nuevoLead = {
    idLead: numeroWhatsapp,
    whatsapp: numeroWhatsapp,
    bot: DEFAULT_BOT_ID,
    nombre: null,
    tipoOperacion: null,
    tipoPropiedad: null,
    zonaInteres: null,
    presupuesto: null,
    dormitorios: null,
    personas: null,
    tipoPedido: null,
    zonaDelivery: null,
    observaciones: null,
    nivelInteres: "frio",
    fechaVisita: null,
    horaVisita: null,
    fuente: "whatsapp",
    estadoLead: ESTADOS_LEAD.NUEVO,
    estadoConversacion: ESTADOS_CONVERSACION.INICIO,
    historial: [],
    fechaRegistro: ahoraLaPaz(),
  };
  return persistir(nuevoLead);
}

function updateLead(numeroWhatsapp, data) {
  const lead = getOrCreateLead(numeroWhatsapp);
  Object.assign(lead, data);
  return persistir(lead);
}

function appendHistorial(numeroWhatsapp, rol, mensaje) {
  const lead = getOrCreateLead(numeroWhatsapp);
  lead.historial.push({ rol, mensaje, fecha: ahoraLaPaz() });
  if (lead.historial.length > 30) lead.historial.shift();
  return persistir(lead);
}

function listarLeads() {
  const filas = db.prepare("SELECT * FROM leads ORDER BY fechaActualizacion DESC").all();
  return filas.map(filaToLead);
}

function obtenerLeadPorId(idLead) {
  return filaToLead(selectStmt.get(idLead));
}

module.exports = {
  ESTADOS_LEAD,
  ESTADOS_CONVERSACION,
  getOrCreateLead,
  updateLead,
  appendHistorial,
  listarLeads,
  obtenerLeadPorId,
};
