// Catalogo de bots mostrados en la web. Cada uno define el mensaje con el que
// se abre WhatsApp para iniciar esa demo especifica. El bot real (el que
// responde) vive en su propio proyecto (ver ../../ProyectoBotInmoviliaria).
// El mensaje es texto natural (sin tags ni corchetes) para que se vea normal
// en el chat; el bot real igualmente reconoce la frase "vengo de la web de
// ProShop" para registrar el origen del lead. El campo "icon" referencia una
// clave del set de iconos SVG en public/js/icons.js (sin emojis).

const bots = [
  {
    id: "inmobiliaria",
    nombre: "Inmobiliaria",
    descripcion: "Califica leads y agenda visitas a propiedades",
    icon: "home",
    status: "activo",
    saludoInicial: "Hola, soy el asistente virtual de Inmobiliaria Demo. Puedo ayudarte a encontrar una propiedad, contarte requisitos o agendar una visita. ¿Qué estás buscando hoy?",
    mensajeWhatsapp: "Hola, vengo de la web de ProShop, quiero ver el demo del bot Inmobiliario",
  },
  {
    id: "restaurante",
    nombre: "Restaurante",
    descripcion: "Reservas de mesa y pedidos para delivery",
    icon: "utensils",
    status: "activo",
    saludoInicial: "Hola, soy el asistente virtual de Sabores Demo. Puedo contarte el menú, ayudarte con un pedido o reservar una mesa. ¿Qué necesitas?",
    mensajeWhatsapp: "Hola, vengo de la web de ProShop, quiero ver el demo del bot Restaurante",
  },
  { id: "clinica", nombre: "Clínica / Salud", descripcion: "Agenda citas médicas y responde dudas frecuentes", icon: "heartPulse", status: "proximamente" },
  { id: "ecommerce", nombre: "Tienda Online", descripcion: "Recomienda productos y guía la compra", icon: "shoppingBag", status: "proximamente" },
  { id: "soporte", nombre: "Soporte Técnico", descripcion: "Resuelve tickets y deriva casos complejos", icon: "wrench", status: "proximamente" },
  { id: "gimnasio", nombre: "Gimnasio", descripcion: "Vende membresías y agenda clases", icon: "dumbbell", status: "proximamente" },
  { id: "concesionaria", nombre: "Concesionaria", descripcion: "Agenda test drives y cotiza vehículos", icon: "car", status: "proximamente" },
  { id: "hotel", nombre: "Hotel / Turismo", descripcion: "Cotiza estadías y gestiona reservas", icon: "building", status: "proximamente" },
  { id: "academia", nombre: "Academia / Cursos", descripcion: "Informa programas y matricula alumnos", icon: "graduation", status: "proximamente" },
  { id: "delivery", nombre: "Delivery / Logística", descripcion: "Informa el estado de pedidos y envíos", icon: "package", status: "proximamente" },
];

function getBot(id) {
  return bots.find((b) => b.id === id);
}

module.exports = { bots, getBot };
