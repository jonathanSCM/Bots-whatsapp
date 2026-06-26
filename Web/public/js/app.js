const botGrid = document.getElementById("bot-grid");
const featureGrid = document.getElementById("feature-grid");
const carouselPrev = document.getElementById("carousel-prev");
const carouselNext = document.getElementById("carousel-next");
const carouselDots = document.getElementById("carousel-dots");

let whatsappNumero = "";

const FEATURES = [
  { icon: "userCheck", title: "Calificación de leads", text: "Detecta intención de compra y prioriza a quienes están listos para avanzar." },
  { icon: "calendarCheck", title: "Agenda y recordatorios", text: "Reserva citas, visitas o turnos y envía recordatorios automáticos." },
  { icon: "creditCard", title: "Cobros por WhatsApp", text: "Genera cotizaciones y links de pago dentro de la misma conversación." },
  { icon: "imageStack", title: "Catálogo con fotos", text: "Envía imágenes, precios y disponibilidad real, sin inventar nada." },
  { icon: "headset", title: "Derivación a humano", text: "Reconoce cuándo escalar la conversación a tu equipo y lo hace solo." },
  { icon: "languages", title: "Multi-idioma", text: "Atiende a cada cliente en el idioma en el que te escribe." },
  { icon: "barChart", title: "Reportes en vivo", text: "Backoffice con leads, citas y métricas actualizadas en tiempo real." },
  { icon: "plug", title: "Integraciones", text: "Se conecta a tu CRM, Google Sheets, Calendar o sistema de pagos." },
];

function buildWhatsappLink(mensaje) {
  return `https://wa.me/${whatsappNumero}?text=${encodeURIComponent(mensaje)}`;
}

function renderBots(bots) {
  botGrid.innerHTML = bots
    .map((bot, i) => {
      const disabled = bot.status !== "activo";
      return `
      <article class="bot-card ${disabled ? "is-disabled" : ""}" data-id="${bot.id}" style="animation-delay:${i * 60}ms">
        ${disabled ? '<span class="badge-soon">Próximamente</span>' : '<span class="badge-live"></span>'}
        <span class="icon">${ICONS[bot.icon] || ICONS.home}</span>
        <h3>${bot.nombre}</h3>
        <p>${bot.descripcion}</p>
        <span class="cta-line">${disabled ? "En construcción" : "Hablar por WhatsApp"} <span class="arrow">${ICONS.arrow}</span></span>
      </article>`;
    })
    .join("");

  botGrid.querySelectorAll(".bot-card:not(.is-disabled)").forEach((card) => {
    card.addEventListener("click", () => {
      const bot = bots.find((b) => b.id === card.dataset.id);
      if (!bot || !whatsappNumero) return;
      window.open(buildWhatsappLink(bot.mensajeWhatsapp || `Hola, vengo de la web de ProShop, quiero ver el demo de ${bot.nombre}`), "_blank", "noopener");
    });
  });

  setupCarousel(bots.length);
}

function setupCarousel(itemCount) {
  const card = botGrid.querySelector(".bot-card");
  if (!card) return;

  const scrollByCard = (dir) => {
    const gap = parseFloat(getComputedStyle(botGrid).gap || 16);
    botGrid.scrollBy({ left: dir * (card.offsetWidth + gap), behavior: "smooth" });
  };
  carouselPrev.onclick = () => scrollByCard(-1);
  carouselNext.onclick = () => scrollByCard(1);
  carouselPrev.innerHTML = ICONS.chevronLeft;
  carouselNext.innerHTML = ICONS.chevronRight;

  const dotsCount = Math.ceil(itemCount / cardsPerView());
  carouselDots.innerHTML = Array.from({ length: dotsCount })
    .map((_, i) => `<button class="dot ${i === 0 ? "active" : ""}" data-i="${i}"></button>`)
    .join("");

  carouselDots.querySelectorAll(".dot").forEach((dot) => {
    dot.addEventListener("click", () => {
      const card = botGrid.querySelector(".bot-card");
      const gap = parseFloat(getComputedStyle(botGrid).gap || 16);
      botGrid.scrollTo({ left: Number(dot.dataset.i) * cardsPerView() * (card.offsetWidth + gap), behavior: "smooth" });
    });
  });

  botGrid.addEventListener("scroll", () => {
    const card = botGrid.querySelector(".bot-card");
    const gap = parseFloat(getComputedStyle(botGrid).gap || 16);
    const step = cardsPerView() * (card.offsetWidth + gap);
    const active = Math.round(botGrid.scrollLeft / step);
    carouselDots.querySelectorAll(".dot").forEach((d, i) => d.classList.toggle("active", i === active));
  });
}

function cardsPerView() {
  const w = window.innerWidth;
  if (w < 640) return 1;
  if (w < 980) return 2;
  return 3;
}

function renderFeatures() {
  featureGrid.innerHTML = FEATURES.map(
    (f, i) => `
    <div class="feature-card" style="animation-delay:${i * 50}ms">
      <span class="feature-icon">${ICONS[f.icon]}</span>
      <h3>${f.title}</h3>
      <p>${f.text}</p>
    </div>`
  ).join("");
}

function wireContactButtons() {
  document.querySelectorAll(".js-contact-whatsapp").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      if (!whatsappNumero) return;
      e.preventDefault();
      const mensaje = "Hola, vengo de la web de ProShop, quiero un agente de WhatsApp con IA para mi negocio";
      window.open(buildWhatsappLink(mensaje), "_blank", "noopener");
    });
  });
}

async function init() {
  renderFeatures();
  try {
    const [bots, config] = await Promise.all([
      fetch("/api/bots").then((r) => r.json()),
      fetch("/api/config").then((r) => r.json()),
    ]);
    whatsappNumero = config.whatsappNumero;
    renderBots(bots);
  } catch (err) {
    botGrid.innerHTML = "";
  }
  wireContactButtons();
}

init();
