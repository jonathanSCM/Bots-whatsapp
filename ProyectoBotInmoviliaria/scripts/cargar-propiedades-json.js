// Borra los datos existentes y carga el catalogo de propiedades desde el JSON
// (scripts/data/propiedades_scz.json). Las coordenadas ya vienen en el archivo,
// asi que NO hay que geocodificar.
//
// Uso: node scripts/cargar-propiedades-json.js
//
// Borra: propiedades, leads, citas, geocache (arranca en limpio para el catalogo
// nuevo). NO toca categorias ni disponibilidad (son configuracion).

const path = require("path");
const fs = require("fs");

(async () => {
  const { init, query } = require("../src/state/db");
  await init();

  const archivo = path.join(__dirname, "data", "propiedades_scz.json");
  const raw = JSON.parse(fs.readFileSync(archivo, "utf8"));

  // Soporta dos formatos: (a) array plano de propiedades, o (b) agrupado por
  // zonas -> calles -> propiedades. Se aplana a una lista unica.
  let datos;
  if (Array.isArray(raw)) {
    datos = raw;
  } else if (Array.isArray(raw.zonas)) {
    datos = raw.zonas.flatMap((z) => (z.calles || []).flatMap((c) => c.propiedades || []));
  } else {
    throw new Error("Formato de JSON no reconocido (se esperaba un array o { zonas: [...] }).");
  }

  // Normalizaciones al formato interno del bot
  const normalizarOperacion = (op) => {
    const t = (op || "").toLowerCase();
    if (t.includes("anticr")) return "anticretico";
    if (t.includes("alqui")) return "alquiler";
    return "venta";
  };
  // "PROP-001" -> "P001" (para que el detector de codigos y la galeria funcionen)
  const normalizarId = (codigo, i) => {
    const n = String(codigo || "").match(/(\d+)/);
    return `P${String(n ? Number(n[1]) : i + 1).padStart(3, "0")}`;
  };
  const formatearPrecio = (usd, operacion) => {
    const monto = Number(usd).toLocaleString("en-US");
    return operacion === "alquiler" ? `USD ${monto}/mes` : `USD ${monto}`;
  };

  console.log(`Cargando ${datos.length} propiedades desde ${path.basename(archivo)}...`);

  // Limpieza (orden: primero lo que referencia a otras cosas)
  await query("DELETE FROM citas");
  await query("DELETE FROM leads");
  await query("DELETE FROM propiedades");
  await query("DELETE FROM geocache");
  console.log("Datos anteriores borrados (propiedades, leads, citas, geocache).");

  const ahora = new Date().toISOString().slice(0, 19).replace("T", " ");
  const insertar = `INSERT INTO propiedades
    ("id","tipo","operacion","zona","precio","dormitorios","descripcion","estado","fotos","caracteristicas","ubicacionMaps","lat","lng","fechaCreacion","fechaActualizacion")
    VALUES ($1,$2,$3,$4,$5,$6,$7,'disponible','[]','[]',$8,$9,$10,$11,$12)`;

  let n = 0;
  for (let i = 0; i < datos.length; i++) {
    const p = datos[i];
    const operacion = normalizarOperacion(p.operacion);
    const u = p.ubicacion || {};
    await query(insertar, [
      normalizarId(p.codigo, i),
      p.tipo || "",
      operacion,
      // Zona: "Zona Sur - Av. 4to Anillo Sur" (macro + calle) para que matchee
      // tanto "zona sur" como "4to anillo"; el macro tambien sale por coordenadas.
      p.direccion_visible || p.calle || u.referencia_zona || p.zona || "",
      formatearPrecio(p.precio_usd, operacion),
      p.dormitorios != null ? String(p.dormitorios) : "",
      p.detalle || "",
      u.google_maps_url || null,
      u.latitud ?? null,
      u.longitud ?? null,
      ahora,
      ahora,
    ]);
    n++;
  }

  const total = (await query(`SELECT COUNT(*) AS c FROM propiedades`)).rows[0].c;
  console.log(`Listo: ${n} propiedades cargadas. Total en la base: ${total}.`);
  console.log("Nota: quedan sin fotos; subelas desde el panel a las que quieras mostrar en la galeria.");
})().catch((e) => {
  console.error("Error cargando propiedades:", e.message);
  process.exit(1);
});
