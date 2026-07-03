// Calcula coordenadas para las propiedades que no las tienen: usa el link de
// Maps si existe, y si no, geocodifica el texto de la zona con Nominatim.
// Uso: node scripts/geocodificar-propiedades.js
// Respeta el limite de Nominatim (1 consulta/seg) y cachea en BD, asi que se
// puede correr las veces que haga falta.

(async () => {
  const { init, query } = require("../src/state/db");
  await init();
  const { resolverLinkMaps, geocodificar } = require("../src/services/geo");

  const { rows } = await query(`SELECT "id","zona","ubicacionMaps","lat" FROM propiedades`);
  const pendientes = rows.filter((p) => p.lat === null || p.lat === undefined);
  console.log(`Propiedades sin coordenadas: ${pendientes.length} de ${rows.length}`);

  let ok = 0;
  for (const p of pendientes) {
    let coords = p.ubicacionMaps ? await resolverLinkMaps(p.ubicacionMaps) : null;
    if (!coords) coords = await geocodificar(p.zona);
    if (coords) {
      await query(`UPDATE propiedades SET "lat"=$1,"lng"=$2 WHERE "id"=$3`, [coords.lat, coords.lng, p.id]);
      ok++;
      console.log(`${p.id} (${p.zona}) -> ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
    } else {
      console.log(`${p.id} (${p.zona}) -> no se pudo geocodificar (seguira matcheando por texto)`);
    }
    await new Promise((r) => setTimeout(r, 1100)); // limite de cortesia de Nominatim
  }
  console.log(`Listo: ${ok} propiedades geocodificadas.`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
