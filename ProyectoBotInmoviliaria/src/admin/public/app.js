let leads = [];

async function cargarTodo() {
  const [resumen, leadsRes] = await Promise.all([
    fetch("api/resumen").then((r) => r.json()),
    fetch("api/leads").then((r) => r.json()),
  ]);
  leads = leadsRes;
  renderStats(resumen);
  renderLeads(leads);
}

function renderStats(r) {
  document.getElementById("stats").innerHTML = `
    <div class="stat-card"><strong>${r.totalLeads}</strong><span>Conversaciones totales</span></div>
    <div class="stat-card"><strong>${r.leadsCalificados}</strong><span>Calificados</span></div>
    <div class="stat-card"><strong>${r.leadsInteresados}</strong><span>Interesados en cotizar</span></div>
    <div class="stat-card"><strong>${r.leadsDerivados}</strong><span>Derivados a asesor</span></div>
  `;
}

function fmtFecha(f) {
  if (!f) return "-";
  return f.replace("T", " ").slice(0, 16);
}

function detalleLead(l) {
  if (l.bot === "restaurante") {
    return [l.tipoPedido, l.personas ? `${l.personas} personas` : null].filter(Boolean).join(" · ") || "-";
  }
  return [l.tipoOperacion, l.tipoPropiedad, l.zonaInteres].filter(Boolean).join(" · ") || "-";
}

function renderLeads(lista) {
  document.getElementById("tabla-leads").innerHTML = lista
    .map(
      (l) => `
    <tr data-id="${l.idLead}">
      <td><span class="badge badge-bot">${l.bot || "-"}</span></td>
      <td>${l.nombre || "-"}</td>
      <td>${l.whatsapp}</td>
      <td>${detalleLead(l)}</td>
      <td><span class="badge badge-${l.estadoLead}">${l.estadoLead.replace(/_/g, " ")}</span></td>
      <td>${l.fuente || "-"}</td>
      <td>${fmtFecha(l.fechaActualizacion)}</td>
    </tr>`
    )
    .join("");

  document.querySelectorAll("#tabla-leads tr").forEach((tr) => {
    tr.addEventListener("click", () => abrirModalLead(tr.dataset.id));
  });
}

async function abrirModalLead(id) {
  const lead = await fetch(`api/leads/${id}`).then((r) => r.json());
  document.getElementById("modal-nombre").textContent = lead.nombre || lead.whatsapp;
  document.getElementById("modal-meta").innerHTML = `
    <div><b>Bot:</b> ${lead.bot || "-"}</div>
    <div><b>WhatsApp:</b> ${lead.whatsapp}</div>
    <div><b>Estado:</b> ${lead.estadoLead}</div>
    <div><b>Detalle:</b> ${detalleLead(lead)}</div>
    <div><b>Presupuesto:</b> ${lead.presupuesto || "-"}</div>
    <div><b>Observaciones:</b> ${lead.observaciones || "-"}</div>
    <div><b>Fuente:</b> ${lead.fuente || "-"}</div>
  `;
  document.getElementById("modal-historial").innerHTML = lead.historial
    .map((h) => `<div class="msg ${h.rol}">${h.mensaje}</div>`)
    .join("");
  document.getElementById("modal-lead").classList.remove("hidden");
}

document.getElementById("modal-close").addEventListener("click", () => {
  document.getElementById("modal-lead").classList.add("hidden");
});

document.getElementById("filtro-leads").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase();
  renderLeads(leads.filter((l) => (l.nombre || "").toLowerCase().includes(q) || l.whatsapp.includes(q)));
});

cargarTodo();
setInterval(cargarTodo, 15000);
