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
function renderCitas(lista, propiedades) {
  document.getElementById("tabla-citas").innerHTML = lista
    .map((c) => {
      const propiedad = propiedades.find((p) => p.id === c.propiedadId);
      return `
      <tr>
        <td>${c.fecha}</td>
        <td>${c.hora}</td>
        <td>${c.nombre || "-"}</td>
        <td>${c.whatsapp}</td>
        <td>${propiedad ? `${propiedad.id} - ${propiedad.tipo}` : c.propiedadId || "-"}</td>
        <td><span class="badge badge-${c.estado}">${c.estado}</span></td>
        <td>
          <select class="estado-select" data-id="${c.id}">
            ${["confirmada", "cancelada", "completada"].map((e) => `<option value="${e}" ${e === c.estado ? "selected" : ""}>${e}</option>`).join("")}
          </select>
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
}

// ---------- Leads ----------
function detalleLead(l) {
  return [l.tipoOperacion, l.tipoPropiedad, l.zonaInteres].filter(Boolean).join(" · ") || "-";
}

function renderLeads(lista) {
  document.getElementById("tabla-leads").innerHTML = lista
    .map(
      (l) => `
    <tr data-id="${l.idLead}">
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
    <div><b>WhatsApp:</b> ${lead.whatsapp}</div>
    <div><b>Estado:</b> ${lead.estadoLead}</div>
    <div><b>Detalle:</b> ${detalleLead(lead)}</div>
    <div><b>Presupuesto:</b> ${lead.presupuesto || "-"}</div>
    <div><b>Visita:</b> ${lead.fechaVisita ? `${lead.fechaVisita} ${lead.horaVisita}` : "-"}</div>
    <div><b>Fuente:</b> ${lead.fuente || "-"}</div>
  `;
  document.getElementById("modal-historial").innerHTML = lead.historial.map((h) => `<div class="msg ${h.rol}">${h.mensaje}</div>`).join("");
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

cargarTodo();
setInterval(cargarTodo, 15000);
