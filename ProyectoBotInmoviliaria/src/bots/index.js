const inmobiliaria = require("./inmobiliaria");
const restaurante = require("./restaurante");
const clinica = require("./clinica");
const ecommerce = require("./ecommerce");
const soporte = require("./soporte");
const gimnasio = require("./gimnasio");
const concesionaria = require("./concesionaria");
const hotel = require("./hotel");
const academia = require("./academia");
const delivery = require("./delivery");

const bots = {
  inmobiliaria,
  restaurante,
  clinica,
  ecommerce,
  soporte,
  gimnasio,
  concesionaria,
  hotel,
  academia,
  delivery,
};

const DEFAULT_BOT_ID = "inmobiliaria";

function getBot(id) {
  return bots[id] || bots[DEFAULT_BOT_ID];
}

// Metadata para el menu de seleccion (lista interactiva de WhatsApp) que se
// manda cuando alguien escribe sin especificar a que demo se refiere. Titulo
// max 24 caracteres, descripcion max 72 (limites de WhatsApp Cloud API).
const MENU_BOTS = [
  { id: "inmobiliaria", nombre: "🏡 Inmobiliaria", descripcion: "Califica leads y agenda visitas a propiedades" },
  { id: "restaurante", nombre: "🍽️ Restaurante", descripcion: "Reservas de mesa, delivery y menú" },
  { id: "clinica", nombre: "🏥 Clínica / Salud", descripcion: "Agenda citas médicas por especialidad" },
  { id: "ecommerce", nombre: "🛍️ Tienda Online", descripcion: "Recomienda productos y cierra ventas" },
  { id: "soporte", nombre: "🔧 Soporte Técnico", descripcion: "Resuelve problemas y abre tickets" },
  { id: "gimnasio", nombre: "💪 Gimnasio", descripcion: "Asesora planes y procesa membresías" },
  { id: "concesionaria", nombre: "🚗 Concesionaria", descripcion: "Cotiza vehículos y agenda test drives" },
  { id: "hotel", nombre: "🏨 Hotel / Turismo", descripcion: "Cotiza habitaciones y toma reservas" },
  { id: "academia", nombre: "🎓 Academia / Cursos", descripcion: "Informa programas y matricula alumnos" },
  { id: "delivery", nombre: "🚚 Delivery / Logística", descripcion: "Rastrea pedidos y atiende reclamos" },
];

module.exports = { bots, getBot, DEFAULT_BOT_ID, MENU_BOTS };
