const { google } = require("googleapis");
const menuLocal = require("../config/menu.json");

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

function getAuth() {
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

// Hoja "Leads" del sheet compartido entre todos los bots de demo: solo
// negocios reales interesados en tener su propio bot (no se registran aqui
// las conversaciones de prueba de cada demo, esas solo quedan en SQLite).
const LEADS_SHEET_NAME = "Leads";

async function registrarLeadNegocio({ bot, nombre, whatsapp, interes, fuente }) {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const fila = [
    new Date().toLocaleString("es-BO", { timeZone: "America/La_Paz" }),
    bot || "",
    nombre || "",
    whatsapp || "",
    interes || "",
    fuente || "",
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${LEADS_SHEET_NAME}!A:F`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [fila] },
  });
}

let cachePorHoja = {};
const CACHE_TTL_MS = 60 * 1000;

async function leerHojaConCache(nombreHoja, rango, columnas, datosLocalesFallback, filtro) {
  if (!SHEET_ID) {
    return datosLocalesFallback.filter(filtro);
  }

  const ahora = Date.now();
  const cache = cachePorHoja[nombreHoja];
  if (cache && ahora - cache.timestamp < CACHE_TTL_MS) {
    return cache.datos;
  }

  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${nombreHoja}!${rango}`,
    });

    const filas = res.data.values || [];
    const datos = filas
      .map((fila) =>
        columnas.reduce((obj, col, i) => {
          obj[col] = fila[i] ?? "";
          return obj;
        }, {})
      )
      .filter(filtro);

    cachePorHoja[nombreHoja] = { datos, timestamp: ahora };
    return datos;
  } catch (err) {
    // IMPORTANTE: si GOOGLE_SHEET_ID esta configurado pero la lectura falla
    // (credenciales, permisos, pestaña inexistente), NO mostramos datos
    // locales de ejemplo como si fueran reales -> el bot inventaria
    // propiedades/platos falsos sin darse cuenta. Mejor devolver vacio: el
    // bot dira honestamente que no tiene catalogo disponible en este momento.
    console.error(
      `ERROR: no se pudo leer la hoja "${nombreHoja}" de Google Sheets (revisa GOOGLE_SHEET_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY). El bot NO usara datos inventados, devuelve catalogo vacio:`,
      err.message
    );
    return [];
  }
}

const COLUMNAS_MENU = ["idPlato", "categoria", "nombre", "precio", "descripcion", "disponible"];

async function obtenerMenuDisponible() {
  return leerHojaConCache(
    "Menu",
    "A2:F",
    COLUMNAS_MENU,
    menuLocal,
    (p) => p.idPlato && p.disponible?.toLowerCase() === "si"
  );
}

module.exports = { registrarLeadNegocio, obtenerMenuDisponible };
