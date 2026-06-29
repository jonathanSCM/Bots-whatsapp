const ICONO_OJO = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const ICONO_OJO_TACHADO = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/><line x1="3" y1="3" x2="21" y2="21"/></svg>`;

document.getElementById("btn-ver-clave").addEventListener("click", (e) => {
  const input = document.getElementById("login-clave");
  const visible = input.type === "text";
  input.type = visible ? "password" : "text";
  e.currentTarget.innerHTML = visible ? ICONO_OJO : ICONO_OJO_TACHADO;
});

document.getElementById("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const usuario = document.getElementById("login-usuario").value;
  const clave = document.getElementById("login-clave").value;
  const errorBox = document.getElementById("login-error");
  errorBox.classList.add("hidden");

  const res = await fetch("login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario, clave }),
  });

  if (res.ok) {
    window.location.href = ".";
    return;
  }

  const data = await res.json().catch(() => ({}));
  errorBox.textContent = data.error || "No se pudo iniciar sesion.";
  errorBox.classList.remove("hidden");
});
