// Geolocalizacion para el motor de busqueda: convierte links de Google Maps
// y nombres de lugares (via Nominatim/OpenStreetMap, gratis) en coordenadas,
// y deduce la zona macro de Santa Cruz (Centro/Norte/Sur/Este/Oeste) por
// geometria. Todo con cache en BD para no repetir consultas externas.

const axios = require("axios");
const { query } = require("../state/db");

// Plaza 24 de Septiembre, centro de Santa Cruz de la Sierra
const CENTRO_SCZ = { lat: -17.783313, lng: -63.182129 };
const RADIO_CENTRO_KM = 2.2; // aprox hasta el segundo anillo

function distanciaKm(lat1, lng1, lat2, lng2) {
  const rad = (g) => (g * Math.PI) / 180;
  const R = 6371;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Zona macro por geometria: dentro del radio del centro es "centro"; fuera,
// el punto cardinal dominante respecto de la plaza.
function zonaMacroDe(lat, lng) {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return null;
  if (distanciaKm(lat, lng, CENTRO_SCZ.lat, CENTRO_SCZ.lng) <= RADIO_CENTRO_KM) return "centro";
  const dLat = lat - CENTRO_SCZ.lat; // + = norte
  const dLng = lng - CENTRO_SCZ.lng; // + = este
  if (Math.abs(dLat) >= Math.abs(dLng)) return dLat > 0 ? "norte" : "sur";
  return dLng > 0 ? "este" : "oeste";
}

// Si el cliente pidio una zona macro ("zona norte", "el centro"), devuelve la
// clave normalizada; null si pidio un lugar especifico (avenida, barrio).
function zonaMacroDeTexto(texto) {
  const t = (texto || "").toLowerCase();
  if (/\bcentro\b/.test(t)) return "centro";
  if (/\bnorte\b/.test(t)) return "norte";
  if (/\bsur\b/.test(t)) return "sur";
  if (/\beste\b/.test(t)) return "este";
  if (/\boeste\b/.test(t)) return "oeste";
  return null;
}

// Extrae lat/lng de un link de Google Maps. Los links largos las traen en la
// URL (@lat,lng o !3dlat!4dlng o q=lat,lng); los cortos (maps.app.goo.gl)
// se resuelven siguiendo el redirect primero.
function coordsDeUrl(url) {
  const patrones = [/@(-?\d+\.\d+),(-?\d+\.\d+)/, /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/, /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/];
  for (const re of patrones) {
    const m = url.match(re);
    if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
  }
  return null;
}

async function resolverLinkMaps(url) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const directo = coordsDeUrl(url);
  if (directo) return directo;
  try {
    // Link corto: seguir redirects hasta la URL larga con coordenadas.
    const resp = await axios.get(url, { maxRedirects: 5, timeout: 8000, validateStatus: () => true });
    const urlFinal = resp.request?.res?.responseUrl || resp.request?.responseURL || "";
    return coordsDeUrl(urlFinal);
  } catch (err) {
    console.error("No se pudo resolver el link de Maps:", err.message);
    return null;
  }
}

// Geocodifica un texto libre ("avenida banzer", "equipetrol") a coordenadas
// usando Nominatim, acotado a Santa Cruz de la Sierra. Cachea en BD el
// resultado (tambien los fallidos, para no reintentar en cada mensaje).
async function geocodificar(texto) {
  if (!texto || !texto.trim()) return null;
  const clave = texto.trim().toLowerCase();

  const { rows } = await query(`SELECT * FROM geocache WHERE "consulta" = $1`, [clave]);
  if (rows.length) {
    const c = rows[0];
    return c.encontrado ? { lat: c.lat, lng: c.lng } : null;
  }

  let resultado = null;
  try {
    const resp = await axios.get("https://nominatim.openstreetmap.org/search", {
      params: { q: `${texto}, Santa Cruz de la Sierra, Bolivia`, format: "json", limit: 1 },
      headers: { "User-Agent": "HabitadBot/1.0 (bot inmobiliario WhatsApp)" },
      timeout: 8000,
    });
    if (resp.data?.length) {
      resultado = { lat: Number(resp.data[0].lat), lng: Number(resp.data[0].lon) };
    }
  } catch (err) {
    console.error("Error geocodificando con Nominatim:", err.message);
    return null; // error de red: no cachear, reintentar en otro momento
  }

  await query(
    `INSERT INTO geocache ("consulta","lat","lng","encontrado","fecha") VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT ("consulta") DO NOTHING`,
    [clave, resultado?.lat ?? null, resultado?.lng ?? null, resultado ? 1 : 0, new Date().toISOString()]
  );
  return resultado;
}

module.exports = { geocodificar, resolverLinkMaps, distanciaKm, zonaMacroDe, zonaMacroDeTexto, CENTRO_SCZ };
