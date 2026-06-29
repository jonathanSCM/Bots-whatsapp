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
