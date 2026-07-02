require("dotenv").config();
const express = require("express");
const webhookRouter = require("./src/routes/webhook");
const adminRouter = require("./src/admin/router");
const { iniciarJobRecordatorios } = require("./src/jobs/recordatorios");
const db = require("./src/state/db");

const app = express();
app.set("trust proxy", true);
app.use(express.json());

app.get("/", (_req, res) => res.send("Agente IA Inmobiliario - activo"));
app.use("/webhook", webhookRouter);
app.use("/admin", adminRouter);

const PORT = process.env.PORT || 3000;

db.init()
  .then(() => {
    app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
    iniciarJobRecordatorios();
  })
  .catch((err) => {
    console.error("No se pudo inicializar la base de datos (revisa DATABASE_URL):", err.message);
    process.exit(1);
  });
