// Catalogo de bots mostrados en la web. Cada uno define el mensaje con el que
// se abre WhatsApp para iniciar esa demo especifica. El bot real (el que
// responde) vive en su propio proyecto (ver ../../ProyectoBotInmoviliaria,
// carpeta src/bots/<id>.js). El mensaje es texto natural (sin tags ni
// corchetes) para que se vea normal en el chat; el bot real reconoce la
// frase "vengo de la web de ProShop" + una palabra clave del nombre del bot
// para registrar el origen del lead y enrutar a la demo correcta. El campo
// "icon" referencia una clave del set de iconos SVG en public/js/icons.js
// (sin emojis).

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
  {
    id: "clinica",
    nombre: "Clínica / Salud",
    descripcion: "Agenda citas médicas y responde dudas frecuentes",
    icon: "heartPulse",
    status: "activo",
    saludoInicial: "Hola, soy el asistente virtual de Clínica Vitalis Demo. Puedo contarte nuestras especialidades, precios o ayudarte a agendar una cita. ¿En qué te ayudo?",
    mensajeWhatsapp: "Hola, vengo de la web de ProShop, quiero ver el demo del bot Clínica",
  },
  {
    id: "ecommerce",
    nombre: "Tienda Online",
    descripcion: "Recomienda productos y guía la compra",
    icon: "shoppingBag",
    status: "activo",
    saludoInicial: "Hola, soy el asistente virtual de Nimbo Tienda Demo. Puedo mostrarte el catálogo y ayudarte a armar tu pedido. ¿Qué estás buscando?",
    mensajeWhatsapp: "Hola, vengo de la web de ProShop, quiero ver el demo del bot Tienda Online",
  },
  {
    id: "soporte",
    nombre: "Soporte Técnico",
    descripcion: "Resuelve tickets y deriva casos complejos",
    icon: "wrench",
    status: "activo",
    saludoInicial: "Hola, soy el asistente de soporte técnico de Nimbo. Contame qué problema estás teniendo y vemos cómo resolverlo.",
    mensajeWhatsapp: "Hola, vengo de la web de ProShop, quiero ver el demo del bot Soporte Técnico",
  },
  {
    id: "gimnasio",
    nombre: "Gimnasio",
    descripcion: "Vende membresías y agenda clases",
    icon: "dumbbell",
    status: "activo",
    saludoInicial: "Hola, soy el asistente virtual de Forja Gym Demo. Te cuento nuestros planes y te ayudo a elegir el que más te conviene. ¿Cuál es tu objetivo?",
    mensajeWhatsapp: "Hola, vengo de la web de ProShop, quiero ver el demo del bot Gimnasio",
  },
  {
    id: "concesionaria",
    nombre: "Concesionaria",
    descripcion: "Agenda test drives y cotiza vehículos",
    icon: "car",
    status: "activo",
    saludoInicial: "Hola, soy el asistente virtual de Motors Demo. Puedo mostrarte nuestros modelos disponibles y agendar un test drive. ¿Qué tipo de vehículo buscas?",
    mensajeWhatsapp: "Hola, vengo de la web de ProShop, quiero ver el demo del bot Concesionaria",
  },
  {
    id: "hotel",
    nombre: "Hotel / Turismo",
    descripcion: "Cotiza estadías y gestiona reservas",
    icon: "building",
    status: "activo",
    saludoInicial: "Hola, soy el asistente virtual de Hotel Altavista Demo. Puedo cotizar tu estadía y ayudarte a reservar. ¿Para cuántas personas y qué fechas?",
    mensajeWhatsapp: "Hola, vengo de la web de ProShop, quiero ver el demo del bot Hotel",
  },
  {
    id: "academia",
    nombre: "Academia / Cursos",
    descripcion: "Informa programas y matricula alumnos",
    icon: "graduation",
    status: "activo",
    saludoInicial: "Hola, soy el asistente virtual de Academia Nova Demo. Te cuento nuestros cursos disponibles y te ayudo a matricularte. ¿Qué área te interesa?",
    mensajeWhatsapp: "Hola, vengo de la web de ProShop, quiero ver el demo del bot Academia",
  },
  {
    id: "delivery",
    nombre: "Delivery / Logística",
    descripcion: "Informa el estado de pedidos y envíos",
    icon: "package",
    status: "activo",
    saludoInicial: "Hola, soy el asistente de rastreo de pedidos de Nimbo Delivery Demo. Pásame tu número de pedido (ej: ND-1001) y te cuento en qué va.",
    mensajeWhatsapp: "Hola, vengo de la web de ProShop, quiero ver el demo del bot Delivery",
  },
];

function getBot(id) {
  return bots.find((b) => b.id === id);
}

module.exports = { bots, getBot };
