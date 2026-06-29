let leads = [];
let propiedadesCache = [];

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// ---------- Carga general ----------
async function cargarTodo() {
  const [resumen, leadsRes, propiedades, citas, disponibilidad] = await Promise.all([
    fetch("api/resumen").then((r) => r.json()),
    fetch("api/leads").then((r) => r.json()),
    fetch("api/propiedades").then((r) => r.json()),
    fetch("api/citas").then((r) => r.json()),
    fetch("api/disponibilidad").then((r) => r.json()),
  ]);
  leads = leadsRes;
  propiedadesCache = propiedades;
  renderStats(resumen);
  renderLeads(leads);
  renderPropiedades(propiedades);
  renderCitas(citas, propiedades);
  renderDisponibilidad(disponibilidad);
}

function renderStats(r) {
  document.getElementById("stats").innerHTML = `
    <div class="stat-card"><strong>${r.propiedadesDisponibles}</strong><span>Propiedades disponibles</span></div>
    <div class="stat-card"><strong>${r.citasHoy}</strong><span>Citas hoy</span></div>
    <div class="stat-card"><strong>${r.citasConfirmadas}</strong><span>Citas confirmadas</span></div>
    <div class="stat-card"><strong>${r.totalLeads}</strong><span>Leads totales</span></div>
    <div class="stat-card"><strong>${r.leadsDerivados}</strong><span>Derivados a asesor</span></div>
  `;
}

function fmtFecha(f) {
  if (!f) return "-";
  return f.replace("T", " ").slice(0, 16);
}

// ---------- Tabs ----------
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    document.querySelectorAll(".panel").forEach((p) => p.classList.add("hidden"));
    document.getElementById(`panel-${tab.dataset.tab}`).classList.remove("hidden");
  });
});

// ---------- Propiedades ----------
function renderPropiedades(lista) {
  document.getElementById("grid-propiedades").innerHTML = lista
    .map((p) => {
      const foto = p.fotos?.[0];
      return `
      <article class="prop-card" data-id="${p.id}">
        ${foto ? `<img class="foto" src="${foto}">` : `<div class="foto-placeholder">Sin fotos</div>`}
        <div class="body">
          <h3>${p.id} · ${p.tipo}</h3>
          <p>${p.operacion} · ${p.zona}</p>
          <p><span class="badge badge-${p.estado}">${p.estado}</span></p>
          <span class="precio">${p.precio}</span>
        </div>
      </article>`;
    })
    .join("");

  document.querySelectorAll(".prop-card").forEach((card) => {
    card.addEventListener("click", () => abrirModalPropiedad(card.dataset.id));
  });
}

function abrirModalPropiedad(id) {
  const modal = document.getElementById("modal-propiedad");
  const form = document.getElementById("form-propiedad");
  form.reset();
  document.getElementById("prop-fotos-existentes").innerHTML = "";

  if (id) {
    const p = propiedadesCache.find((x) => x.id === id);
    document.getElementById("modal-propiedad-titulo").textContent = `Editar ${p.id}`;
    document.getElementById("prop-id").value = p.id;
    document.getElementById("prop-tipo").value = p.tipo;
    document.getElementById("prop-operacion").value = p.operacion;
    document.getElementById("prop-zona").value = p.zona;
    document.getElementById("prop-precio").value = p.precio;
    document.getElementById("prop-dormitorios").value = p.dormitorios || "";
    document.getElementById("prop-descripcion").value = p.descripcion || "";
    document.getElementById("prop-estado").value = p.estado;
    document.getElementById("prop-fotos-existentes").innerHTML =
      (p.fotos || []).map((f) => `<img src="${f}">`).join("") +
      (p.fotos?.length ? `<button type="button" class="btn-danger" id="btn-borrar-fotos">Quitar todas</button>` : "");
    document.getElementById("prop-fotos-existentes").dataset.fotos = JSON.stringify(p.fotos || []);

    document.getElementById("btn-borrar-fotos")?.addEventListener("click", () => {
      document.getElementById("prop-fotos-existentes").innerHTML = "";
      document.getElementById("prop-fotos-existentes").dataset.fotos = "[]";
    });
  } else {
    document.getElementById("modal-propiedad-titulo").textContent = "Nueva propiedad";
    document.getElementById("prop-id").value = "";
    document.getElementById("prop-fotos-existentes").dataset.fotos = "[]";
  }

  modal.classList.remove("hidden");
}

document.getElementById("btn-nueva-propiedad").addEventListener("click", () => abrirModalPropiedad(null));
document.getElementById("modal-propiedad-close").addEventListener("click", () => {
  document.getElementById("modal-propiedad").classList.add("hidden");
});

document.getElementById("form-propiedad").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("prop-id").value;
  const fd = new FormData();
  fd.append("tipo", document.getElementById("prop-tipo").value);
  fd.append("operacion", document.getElementById("prop-operacion").value);
  fd.append("zona", document.getElementById("prop-zona").value);
  fd.append("precio", document.getElementById("prop-precio").value);
  fd.append("dormitorios", document.getElementById("prop-dormitorios").value);
  fd.append("descripcion", document.getElementById("prop-descripcion").value);
  fd.append("estado", document.getElementById("prop-estado").value);
  fd.append("fotosExistentes", document.getElementById("prop-fotos-existentes").dataset.fotos || "[]");

  const archivos = document.getElementById("prop-fotos").files;
  for (const archivo of archivos) fd.append("fotos", archivo);

  await fetch(id ? `api/propiedades/${id}` : "api/propiedades", {
    method: id ? "PUT" : "POST",
    body: fd,
  });

  document.getElementById("modal-propiedad").classList.add("hidden");
  cargarTodo();
});

// ---------- Citas ----------
let citasCache = [];

function linkWhatsapp(numero) {
  const limpio = (numero || "").replace(/\D/g, "");
  return `https://wa.me/${limpio}`;
}

function iconoWhatsapp() {
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17.6 6.32A8.86 8.86 0 0 0 12.05 4a8.94 8.94 0 0 0-7.74 13.41L3 21l3.7-1.27a8.93 8.93 0 0 0 5.35 1.79h0a8.94 8.94 0 0 0 8.94-8.94 8.86 8.86 0 0 0-2.39-6.26ZM12.05 20a7.41 7.41 0 0 1-4.5-1.54l-.32-.21-2.6.89.87-2.53-.22-.34a7.4 7.4 0 0 1-1.16-3.99 7.44 7.44 0 1 1 7.93 7.72Zm4.08-5.58c-.22-.11-1.31-.65-1.52-.72-.2-.07-.35-.11-.5.11-.15.22-.57.72-.7.86-.13.15-.26.16-.48.05-.22-.11-.93-.34-1.78-1.1-.66-.59-1.1-1.32-1.23-1.54-.13-.22-.01-.34.11-.45.11-.11.25-.28.37-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.07-.11-.6-1.45-.82-1.99-.22-.52-.45-.45-.62-.46-.16-.01-.35-.01-.54-.01-.18 0-.48.07-.73.34-.25.27-.97.95-.97 2.32 0 1.37 1 2.69 1.14 2.88.14.18 1.91 2.92 4.63 3.98 2.31.9 2.78.72 3.28.68.5-.05 1.6-.65 1.83-1.29.22-.63.22-1.17.15-1.29-.06-.12-.21-.18-.43-.29Z"/></svg>`;
}

function iconoOjo() {
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
}

function renderCitas(lista, propiedades) {
  citasCache = lista;
  document.getElementById("tabla-citas").innerHTML = lista
    .map((c) => {
      const propiedad = propiedades.find((p) => p.id === c.propiedadId);
      return `
      <tr>
        <td>${c.fecha}</td>
        <td>${c.hora}</td>
        <td>${c.nombre || "-"}</td>
        <td>${propiedad ? `${propiedad.id} - ${propiedad.tipo}` : c.propiedadId || "-"}</td>
        <td><span class="badge badge-${c.estado}">${c.estado}</span></td>
        <td>
          <select class="estado-select" data-id="${c.id}">
            ${["confirmada", "cancelada", "completada"].map((e) => `<option value="${e}" ${e === c.estado ? "selected" : ""}>${e}</option>`).join("")}
          </select>
        </td>
        <td class="acciones-celda">
          <button type="button" class="btn-icono btn-detalle-cita" data-id="${c.id}" title="Ver detalle">${iconoOjo()}</button>
          <a class="btn-icono btn-whatsapp" href="${linkWhatsapp(c.whatsapp)}" target="_blank" rel="noopener" title="Hablar por WhatsApp">${iconoWhatsapp()}</a>
        </td>
      </tr>`;
    })
    .join("");

  document.querySelectorAll("#tabla-citas .estado-select").forEach((sel) => {
    sel.addEventListener("change", async () => {
      await fetch(`api/citas/${sel.dataset.id}/estado`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: sel.value }),
      });
      cargarTodo();
    });
  });

  document.querySelectorAll(".btn-detalle-cita").forEach((btn) => {
    btn.addEventListener("click", () => abrirModalCita(btn.dataset.id, propiedades));
  });
}

function abrirModalCita(id, propiedades) {
  const c = citasCache.find((x) => x.id === id);
  if (!c) return;
  const propiedad = (propiedades || propiedadesCache).find((p) => p.id === c.propiedadId);

  document.getElementById("modal-cita-nombre").textContent = c.nombre || c.whatsapp;
  document.getElementById("modal-cita-meta").innerHTML = `
    <div><b>WhatsApp:</b> ${c.whatsapp}</div>
    <div><b>Fecha:</b> ${c.fecha} ${c.hora}</div>
    <div><b>Propiedad:</b> ${propiedad ? `${propiedad.id} - ${propiedad.tipo} en ${propiedad.zona}` : c.propiedadId || "-"}</div>
    <div><b>Estado:</b> <span class="badge badge-${c.estado}">${c.estado}</span></div>
    <div><b>Recordatorio enviado:</b> ${c.recordatorioEnviado ? "Si" : "No"}</div>
    <div><b>Creada:</b> ${fmtFecha(c.fechaCreacion)}</div>
  `;
  document.getElementById("modal-cita-whatsapp").href = linkWhatsapp(c.whatsapp);
  document.getElementById("modal-cita").classList.remove("hidden");
}

document.getElementById("modal-cita-close").addEventListener("click", () => {
  document.getElementById("modal-cita").classList.add("hidden");
});

// ---------- Leads ----------
function detalleLead(l) {
  return [l.tipoOperacion, l.tipoPropiedad, l.zonaInteres].filter(Boolean).join(" · ") || "-";
}

function renderLeads(lista) {
  document.getElementById("tabla-leads").innerHTML = lista
    .map(
      (l) => `
    <tr data-id="${l.idLead}">
      <td>${l.nombre || "-"}<br><span class="subtexto">${l.whatsapp}</span></td>
      <td>${detalleLead(l)}</td>
      <td><span class="badge badge-${l.estadoLead}">${l.estadoLead.replace(/_/g, " ")}</span></td>
      <td>${l.fuente || "-"}</td>
      <td>${fmtFecha(l.fechaActualizacion)}</td>
      <td class="acciones-celda">
        <button type="button" class="btn-icono btn-detalle-lead" data-id="${l.idLead}" title="Ver detalle">${iconoOjo()}</button>
        <a class="btn-icono btn-whatsapp" href="${linkWhatsapp(l.whatsapp)}" target="_blank" rel="noopener" title="Hablar por WhatsApp" onclick="event.stopPropagation()">${iconoWhatsapp()}</a>
      </td>
    </tr>`
    )
    .join("");

  document.querySelectorAll(".btn-detalle-lead").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      abrirModalLead(btn.dataset.id);
    });
  });
}

async function abrirModalLead(id) {
  const lead = await fetch(`api/leads/${id}`).then((r) => r.json());
  document.getElementById("modal-nombre").textContent = lead.nombre || lead.whatsapp;
  document.getElementById("modal-meta").innerHTML = `
    <div><b>WhatsApp:</b> ${lead.whatsapp}</div>
    <div><b>Estado:</b> ${lead.estadoLead}</div>
    <div><b>Detalle:</b> ${detalleLead(lead)}</div>
    <div><b>Presupuesto:</b> ${lead.presupuesto || "-"}</div>
    <div><b>Visita:</b> ${lead.fechaVisita ? `${lead.fechaVisita} ${lead.horaVisita}` : "-"}</div>
    <div><b>Fuente:</b> ${lead.fuente || "-"}</div>
  `;
  document.getElementById("modal-historial").innerHTML = lead.historial.map((h) => `<div class="msg ${h.rol}">${h.mensaje}</div>`).join("");
  document.getElementById("modal-lead-whatsapp").href = linkWhatsapp(lead.whatsapp);
  document.getElementById("modal-lead").classList.remove("hidden");
}

document.getElementById("modal-close").addEventListener("click", () => {
  document.getElementById("modal-lead").classList.add("hidden");
});

document.getElementById("filtro-leads").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase();
  renderLeads(leads.filter((l) => (l.nombre || "").toLowerCase().includes(q) || l.whatsapp.includes(q)));
});

// ---------- Disponibilidad ----------
function renderDisponibilidad(dias) {
  document.getElementById("form-disponibilidad").innerHTML = dias
    .map(
      (d) => `
    <div class="dia-row" data-dia="${d.diaSemana}">
      <label><input type="checkbox" class="dia-activo" ${d.activo ? "checked" : ""}></label>
      <span class="dia-nombre">${DIAS[d.diaSemana]}</span>
      <input type="time" class="dia-inicio" value="${d.horaInicio}" ${d.activo ? "" : "disabled"}>
      <span>a</span>
      <input type="time" class="dia-fin" value="${d.horaFin}" ${d.activo ? "" : "disabled"}>
    </div>`
    )
    .join("");

  document.querySelectorAll(".dia-activo").forEach((chk) => {
    chk.addEventListener("change", (e) => {
      const row = e.target.closest(".dia-row");
      row.querySelector(".dia-inicio").disabled = !e.target.checked;
      row.querySelector(".dia-fin").disabled = !e.target.checked;
    });
  });
}

document.getElementById("btn-guardar-disponibilidad").addEventListener("click", async () => {
  const dias = [...document.querySelectorAll(".dia-row")].map((row) => ({
    diaSemana: Number(row.dataset.dia),
    activo: row.querySelector(".dia-activo").checked,
    horaInicio: row.querySelector(".dia-inicio").value,
    horaFin: row.querySelector(".dia-fin").value,
  }));

  await fetch("api/disponibilidad", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dias }),
  });
  alert("Horario guardado");
});

document.getElementById("btn-logout").addEventListener("click", async () => {
  await fetch("logout", { method: "POST" });
  window.location.href = "login";
});

cargarTodo();
setInterval(cargarTodo, 15000);
