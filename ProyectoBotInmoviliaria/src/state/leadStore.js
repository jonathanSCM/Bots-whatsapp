// Almacenamiento persistente de leads (Postgres) y su estado de conversacion.

const { query } = require("./db");
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

function filaToLead(fila) {
  if (!fila) return null;
  return {
    ...fila,
    historial: JSON.parse(fila.historial || "[]"),
    datosBot: JSON.parse(fila.datosBot || "{}"),
  };
}

async function persistir(lead) {
  const { rows } = await query(`SELECT "idLead" FROM leads WHERE "idLead" = $1`, [lead.idLead]);
  const historialJSON = JSON.stringify(lead.historial || []);
  const datosBotJSON = JSON.stringify(lead.datosBot || {});
  lead.fechaActualizacion = ahoraLaPaz();

  if (!rows.length) {
    await query(
      `INSERT INTO leads ("idLead","whatsapp","bot","nombre","tipoOperacion","tipoPropiedad","zonaInteres",
        "presupuesto","dormitorios","personas","tipoPedido","zonaDelivery","observaciones","datosBot","nivelInteres",
        "fechaVisita","horaVisita","fuente","estadoLead","estadoConversacion","historial","fechaRegistro",
        "fechaActualizacion")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
      [
        lead.idLead, lead.whatsapp, lead.bot, lead.nombre, lead.tipoOperacion, lead.tipoPropiedad,
        lead.zonaInteres, lead.presupuesto, lead.dormitorios, lead.personas, lead.tipoPedido,
        lead.zonaDelivery, lead.observaciones, datosBotJSON, lead.nivelInteres, lead.fechaVisita,
        lead.horaVisita, lead.fuente, lead.estadoLead, lead.estadoConversacion, historialJSON,
        lead.fechaRegistro, lead.fechaActualizacion,
      ]
    );
  } else {
    await query(
      `UPDATE leads SET "whatsapp"=$1,"bot"=$2,"nombre"=$3,"tipoOperacion"=$4,"tipoPropiedad"=$5,"zonaInteres"=$6,
        "presupuesto"=$7,"dormitorios"=$8,"personas"=$9,"tipoPedido"=$10,"zonaDelivery"=$11,"observaciones"=$12,
        "datosBot"=$13,"nivelInteres"=$14,"fechaVisita"=$15,"horaVisita"=$16,"fuente"=$17,"estadoLead"=$18,
        "estadoConversacion"=$19,"historial"=$20,"fechaActualizacion"=$21
       WHERE "idLead"=$22`,
      [
        lead.whatsapp, lead.bot, lead.nombre, lead.tipoOperacion, lead.tipoPropiedad, lead.zonaInteres,
        lead.presupuesto, lead.dormitorios, lead.personas, lead.tipoPedido, lead.zonaDelivery,
        lead.observaciones, datosBotJSON, lead.nivelInteres, lead.fechaVisita, lead.horaVisita,
        lead.fuente, lead.estadoLead, lead.estadoConversacion, historialJSON, lead.fechaActualizacion,
        lead.idLead,
      ]
    );
  }
  return lead;
}

async function getOrCreateLead(numeroWhatsapp) {
  const { rows } = await query(`SELECT * FROM leads WHERE "idLead" = $1`, [numeroWhatsapp]);
  if (rows.length) return filaToLead(rows[0]);

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
    datosBot: {},
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

async function updateLead(numeroWhatsapp, data) {
  const lead = await getOrCreateLead(numeroWhatsapp);
  Object.assign(lead, data);
  return persistir(lead);
}

// Campo generico (JSON libre) para que cada bot vertical (clinica, ecommerce,
// gimnasio, etc.) guarde sus propios datos de conversacion sin necesitar una
// columna nueva en la tabla por cada vertical nuevo.
async function updateDatosBot(numeroWhatsapp, data) {
  const lead = await getOrCreateLead(numeroWhatsapp);
  lead.datosBot = { ...(lead.datosBot || {}), ...data };
  return persistir(lead);
}

async function appendHistorial(numeroWhatsapp, rol, mensaje) {
  const lead = await getOrCreateLead(numeroWhatsapp);
  lead.historial.push({ rol, mensaje, fecha: ahoraLaPaz() });
  if (lead.historial.length > 30) lead.historial.shift();
  return persistir(lead);
}

async function listarLeads() {
  const { rows } = await query(`SELECT * FROM leads ORDER BY "fechaActualizacion" DESC`);
  return rows.map(filaToLead);
}

async function obtenerLeadPorId(idLead) {
  const { rows } = await query(`SELECT * FROM leads WHERE "idLead" = $1`, [idLead]);
  return filaToLead(rows[0]);
}

module.exports = {
  ESTADOS_LEAD,
  ESTADOS_CONVERSACION,
  getOrCreateLead,
  updateLead,
  updateDatosBot,
  appendHistorial,
  listarLeads,
  obtenerLeadPorId,
};
