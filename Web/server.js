require("dotenv").config();
const express = require("express");
const path = require("path");
const { bots } = require("./bots");

const app = express();
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/bots", (_req, res) => {
  res.json(
    bots.map(({ id, nombre, descripcion, icon, status, saludoInicial, mensajeWhatsapp }) => ({
      id,
      nombre,
      descripcion,
      icon,
      status,
      saludoInicial: saludoInicial || null,
      mensajeWhatsapp: mensajeWhatsapp || null,
    }))
  );
});

app.get("/api/config", (_req, res) => {
  res.json({ whatsappNumero: process.env.WHATSAPP_NUMERO || "" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Web de demos corriendo en http://localhost:${PORT}`));
