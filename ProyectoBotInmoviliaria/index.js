require("dotenv").config();
const express = require("express");
const webhookRouter = require("./src/routes/webhook");
const adminRouter = require("./src/admin/router");

const app = express();
app.use(express.json());

app.get("/", (_req, res) => res.send("Agente IA Inmobiliario - activo"));
app.use("/webhook", webhookRouter);
app.use("/admin", adminRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
