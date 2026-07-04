// Galeria web publica de una propiedad: /p/:id
// El bot manda este link por WhatsApp para que el cliente vea TODAS las fotos
// en grande sin que haya que enviarselas una por una por el chat.

const express = require("express");
const router = express.Router();
const business = require("../config/business.json");
const { obtenerPropiedad } = require("../state/propiedadStore");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

router.get("/:id", async (req, res) => {
  const p = await obtenerPropiedad(req.params.id.toUpperCase());
  if (!p || p.estado !== "disponible") {
    return res.status(404).send(paginaBase("Propiedad no disponible", `<div class="vacio"><h1>😕</h1><p>Esta propiedad ya no esta disponible.</p></div>`));
  }

  const fotos = p.fotos || [];
  const NOMBRE_OPERACION = { venta: "Venta", alquiler: "Alquiler", anticretico: "Anticretico" };
  const titulo = `${p.tipo} en ${NOMBRE_OPERACION[p.operacion] || p.operacion} · ${p.zona}`;
  const numeroBot = (process.env.WHATSAPP_NUMERO_PUBLICO || "").replace(/\D/g, "");
  const msgWa = encodeURIComponent(`Hola! Me interesa el ${p.tipo.toLowerCase()} en ${p.operacion} en ${p.zona} (${p.precio}) que vi en la galeria. Quiero agendar una visita.`);

  const contenido = `
  <header>
    <span class="marca">${esc(business.nombreNegocio)}</span>
  </header>

  ${fotos.length ? `<div class="hero"><img src="${esc(fotos[0])}" alt="${esc(titulo)}" onclick="ver(0)"></div>` : ""}

  <main>
    <h1>${esc(titulo)}</h1>
    <p class="precio">${esc(p.precio)}</p>

    <div class="datos">
      ${p.dormitorios ? `<span>🛏 ${esc(p.dormitorios)} dormitorios</span>` : ""}
      <span>📍 ${esc(p.zona)}</span>
      <span>${p.operacion === "venta" ? "🔑 Venta" : p.operacion === "anticretico" ? "🤝 Anticretico" : "📄 Alquiler"}</span>
      ${(p.caracteristicas || []).map((c) => `<span>${esc(c)}</span>`).join("")}
    </div>

    ${p.descripcion ? `<p class="descripcion">${esc(p.descripcion)}</p>` : ""}
    ${p.ubicacionMaps ? `<a class="maps" href="${esc(p.ubicacionMaps)}" target="_blank" rel="noopener">Ver ubicacion en Google Maps ↗</a>` : ""}

    ${fotos.length > 1 ? `
    <h2>Fotos (${fotos.length})</h2>
    <div class="galeria">
      ${fotos.map((f, i) => `<img src="${esc(f)}" loading="lazy" alt="Foto ${i + 1}" onclick="ver(${i})">`).join("")}
    </div>` : ""}

    ${numeroBot ? `<a class="cta" href="https://wa.me/${numeroBot}?text=${msgWa}">💬 Me interesa, agendar visita</a>` : ""}
  </main>

  <div id="visor" class="visor oculto" onclick="cerrar()">
    <img id="visor-img" alt="">
    <button class="visor-btn prev" onclick="mover(event,-1)">‹</button>
    <button class="visor-btn next" onclick="mover(event,1)">›</button>
    <button class="visor-btn cerrar" onclick="cerrar()">✕</button>
  </div>

  <script>
    const FOTOS = ${JSON.stringify(fotos)};
    let actual = 0;
    function ver(i){ actual = i; document.getElementById('visor-img').src = FOTOS[i]; document.getElementById('visor').classList.remove('oculto'); }
    function cerrar(){ document.getElementById('visor').classList.add('oculto'); }
    function mover(e,d){ e.stopPropagation(); actual = (actual + d + FOTOS.length) % FOTOS.length; document.getElementById('visor-img').src = FOTOS[actual]; }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') cerrar();
      if (e.key === 'ArrowLeft') mover(e,-1);
      if (e.key === 'ArrowRight') mover(e,1);
    });
  </script>`;

  res.send(paginaBase(titulo, contenido));
});

function paginaBase(titulo, contenido) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(titulo)}</title>
<style>
  :root{--fondo:#0f1117;--panel:#181b24;--tinta:#eef0f6;--tenue:#9aa1b5;--acento:#22c58b;}
  *{margin:0;padding:0;box-sizing:border-box;}
  body{background:var(--fondo);color:var(--tinta);font-family:'Segoe UI',system-ui,sans-serif;min-height:100vh;}
  header{display:flex;justify-content:space-between;align-items:center;padding:14px 20px;max-width:860px;margin:0 auto;}
  .marca{font-weight:700;letter-spacing:.4px;font-size:1.05rem;}
  .codigo{color:var(--tenue);font-size:.85rem;border:1px solid #2a2f3d;border-radius:999px;padding:3px 12px;}
  .hero{max-width:860px;margin:0 auto;padding:0 20px;}
  .hero img{width:100%;max-height:420px;object-fit:cover;border-radius:16px;cursor:pointer;display:block;}
  main{max-width:860px;margin:0 auto;padding:20px;}
  h1{font-size:1.5rem;font-weight:650;margin-bottom:6px;}
  .precio{color:var(--acento);font-size:1.6rem;font-weight:700;margin-bottom:14px;}
  .datos{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px;}
  .datos span{background:var(--panel);border:1px solid #262b38;border-radius:999px;padding:6px 14px;font-size:.9rem;color:var(--tinta);}
  .descripcion{color:var(--tenue);line-height:1.65;margin-bottom:16px;}
  .maps{color:var(--acento);text-decoration:none;font-size:.95rem;display:inline-block;margin-bottom:8px;}
  .maps:hover{text-decoration:underline;}
  h2{font-size:1.05rem;color:var(--tenue);font-weight:600;margin:22px 0 12px;}
  .galeria{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;}
  .galeria img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;cursor:pointer;transition:transform .15s ease,opacity .15s ease;}
  .galeria img:hover{transform:scale(1.03);opacity:.9;}
  .cta{display:block;text-align:center;background:var(--acento);color:#07130d;font-weight:700;font-size:1.05rem;text-decoration:none;border-radius:14px;padding:16px;margin:28px 0 12px;}
  .cta:hover{filter:brightness(1.08);}
  .visor{position:fixed;inset:0;background:rgba(5,7,12,.94);display:flex;align-items:center;justify-content:center;z-index:50;}
  .visor.oculto{display:none;}
  .visor img{max-width:94vw;max-height:88vh;border-radius:10px;}
  .visor-btn{position:absolute;background:rgba(255,255,255,.08);border:none;color:#fff;font-size:1.6rem;width:46px;height:46px;border-radius:50%;cursor:pointer;}
  .visor-btn:hover{background:rgba(255,255,255,.18);}
  .prev{left:14px;top:50%;transform:translateY(-50%);}
  .next{right:14px;top:50%;transform:translateY(-50%);}
  .cerrar{top:14px;right:14px;font-size:1.1rem;}
  .vacio{min-height:70vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--tenue);}
  .vacio h1{font-size:3rem;}
</style>
</head>
<body>${contenido}</body>
</html>`;
}

module.exports = router;
