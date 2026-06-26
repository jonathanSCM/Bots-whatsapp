const { google } = require("googleapis");
const propiedadesLocales = require("../config/propiedades.json");
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
    // Si la pestaña no existe o hay un problema de permisos, no tumbamos el
    // bot: usamos los datos locales de respaldo y seguimos funcionando.
    console.error(`No se pudo leer la hoja "${nombreHoja}" de Sheets, usando datos locales de respaldo:`, err.message);
    return datosLocalesFallback.filter(filtro);
  }
}

const COLUMNAS_PROPIEDADES = [
  "idPropiedad", "tipo", "operacion", "zona", "precio",
  "dormitorios", "descripcion", "estado", "linkFotos",
];

async function obtenerPropiedadesDisponibles() {
  return leerHojaConCache(
    "Propiedades",
    "A2:I",
    COLUMNAS_PROPIEDADES,
    propiedadesLocales,
    (p) => p.idPropiedad && p.estado?.toLowerCase() === "disponible"
  );
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

module.exports = { registrarLeadNegocio, obtenerPropiedadesDisponibles, obtenerMenuDisponible };
