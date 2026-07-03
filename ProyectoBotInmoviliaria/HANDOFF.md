# Bot Inmobiliario Habitad — Documento de traspaso (actualizado)

Bot de WhatsApp con IA para la inmobiliaria **Habitad**: califica leads, muestra propiedades reales (nunca inventadas), envía fotos con ficha, tiene galería web pública por propiedad, agenda visitas con Google Calendar y un panel admin. Este documento resume todo para que otra persona continúe el desarrollo.

## Stack

- **Node.js + Express** (`index.js`, puerto 3000)
- **SQLite** (`node:sqlite`, archivo `data/bot.db`) — NO usa Postgres. Los stores están escritos en estilo Postgres (`$1, $2`, `{ rows }`) y `src/state/db.js` tiene un **shim** que traduce eso a SQLite. No tocar los stores por esto.
- **OpenAI** `gpt-4o-mini` con function calling (`src/services/openai.js`)
- **WhatsApp Cloud API v20.0** (webhook Meta en `src/routes/webhook.js`)
- **Google Calendar** con service account JWT (`src/services/calendar.js`)
- **Nominatim/OpenStreetMap** (gratis) para geolocalización (`src/services/geo.js`)
- **Multer + Sharp** para fotos (convierte WEBP→JPEG automático; WhatsApp no entrega WEBP)

## Despliegue

- **Coolify** en servidor Contabo, repo GitHub `jonathanSCM/Bots-whatsapp`, rama `main`.
- URL pública: `https://bot.deliveryavaroa.xyz`
- Panel admin: `https://bot.deliveryavaroa.xyz/admin/` (login con sesión/cookie)
- Galería pública por propiedad: `https://bot.deliveryavaroa.xyz/p/P041`
- **CRÍTICO: volumen persistente en `/app/data`** (Coolify → Storages). Ahí viven `bot.db` y `data/uploads/`. Sin volumen, cada redeploy borra la base (ya pasó una vez).
- Tras un redeploy verificar en el log de deployment el hash del commit. El rolling update tarda ~30-40s extra después de "Finished": mensajes en ese lapso los atiende el contenedor viejo.

### Variables de entorno (Coolify)
- `OPENAI_API_KEY`
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `VERIFY_TOKEN`
- `GOOGLE_CALENDAR_ID`, `GOOGLE_CLIENT_EMAIL`, **`GOOGLE_PRIVATE_KEY_BASE64`** (PEM completo en base64 — evita el error "DECODER routines::unsupported")
- `PUBLIC_URL` (opcional; si falta, el link de galería se deduce del dominio de las fotos)
- `WHATSAPP_NUMERO_PUBLICO` (opcional; activa el botón "Me interesa" de la galería que abre WhatsApp)
- Credenciales del panel admin

## Arquitectura del bot (lo importante)

### Principio 1: el modelo NUNCA inventa propiedades
`buscarPropiedadesFiltradas()` en `src/bots/inmobiliaria.js` filtra en **código** según el lead. El modelo solo ve el resultado (máx. 3) en el system prompt. Búsqueda escalonada:
1. Exacta (zona + operación + tipo + dormitorios + presupuesto)
2. Relaja dormitorios
3. Relaja presupuesto (muestra entre +30% y +50% avisando)
4. Relaja zona (alternativas de otras zonas, aclarándolo)
5. Nada: ofrece cambiar tipo/operación (nunca un "no hay" seco)

### Principio 2: no confiar en el modelo para estado crítico
`extraerFiltros()` detecta **por código** (regex/keywords) zona, tipo, operación y dormitorios en cada mensaje del cliente y actualiza el lead ANTES de armar el prompt (`webhook.js`). La zona detectada se guarda con el nombre **canónico del catálogo**. Esto se agregó porque gpt-4o-mini a veces no llamaba `actualizar_datos_lead` y respondía "no hay nada" con el filtro viejo.

### Matching de zona (3 capas, cualquiera vale)
1. **Texto por palabras clave**: normaliza acentos/puntuación y descarta genéricos ("av", "avenida", "calle", "zona") — "avenida banzer" matchea "Av. Banzer". También busca en la descripción.
2. **Distancia real**: la zona pedida se geocodifica (Nominatim, cacheado en tabla `geocache`) y matchea si la propiedad está a ≤2.5 km (coordenadas del link de Maps).
3. **Zona macro geométrica**: "zona norte/sur/centro/este/oeste" se resuelve por posición respecto de la Plaza 24 de Septiembre (centro = radio 2.2 km).

### Presupuesto flexible (no binario)
`parsePrecio()` entiende "20000", "20k", "20 mil", "USD 136,500", "3500 bs". Tolerancia +30%; entre +30% y +50% solo en el escalón relajado; **más de +50% NUNCA se muestra**. Si las monedas difieren (Bs vs USD) no filtra por precio.

### Ranking
`scorePropiedad()`: zona +3, tipo +3, dormitorios +2, dentro de presupuesto +2; desempate por cercanía geográfica. Las 3 que se muestran son las mejores, no las primeras de la BD.

### Prompt: verdades calculadas por código
- `resumenInventario()`: conteo real de zonas y tipos con stock (respetando operación/tipo del lead) para que el bot ofrezca alternativas VERDADERAS como menú numerado.
- Advertencia anti-sesgo: si el bot dijo antes "no hay disponible", el bloque actual manda ("eso quedó OBSOLETO... corrígete y muestra").
- Historial acotado a los **últimos 12 mensajes** (30 sesgaban al modelo a repetir respuestas viejas).
- Segunda pasada: si el modelo llamó `actualizar_datos_lead`, se regenera la respuesta con el catálogo recalculado.

### Envío de fotos y ficha
- Al mostrar interés, el bot manda **1 sola foto de portada** cuyo caption es la **ficha** (formato portal: negritas de WhatsApp, precio, dormitorios, zona, link de Maps, descripción) + link a la **galería web** con todas las fotos.
- Anti-loop: `datosBot.fotosEnviadas` registra qué propiedades ya recibieron fotos; si pide de nuevo, responde con menú (más info / visita / similares) en vez de reenviar.
- Etapas de conversión: tras fotos pregunta opinión; solo ofrece visita con reacción positiva.
- **Sanitizador de formato** en `whatsapp.js` (`formatoWhatsApp`): convierte Markdown del modelo (`**bold**`, `## titulos`) al formato real de WhatsApp (`*bold*`) en TODOS los mensajes y captions.
- **Códigos internos (P001...) nunca van al cliente**: solo se usan para las tools; los mensajes describen por tipo/zona/precio.

### Galería web pública (`/p/:id`)
`src/routes/propiedadPublica.js`: página oscura responsive con hero, precio, chips, descripción, link Maps, grid de fotos y visor a pantalla completa. 404 amable si la propiedad ya no está disponible. Botón CTA a WhatsApp si está `WHATSAPP_NUMERO_PUBLICO`.

### Tools del modelo
`actualizar_datos_lead`, `agendar_visita`, `reprogramar_visita`, `enviar_fotos_propiedad`, `derivar_a_asesor`.

## Mapa de archivos

```
index.js                          arranque, trust proxy, monta /webhook /admin /p
src/routes/webhook.js             webhook Meta, extracción de filtros por código,
                                  historial (últimos 12), segunda pasada
src/routes/propiedadPublica.js    galería web pública por propiedad
src/bots/inmobiliaria.js          prompt, motor de búsqueda, extracción, ficha, tools
src/services/openai.js            gpt-4o-mini
src/services/whatsapp.js          envío + sanitizador formatoWhatsApp + pausa 1.2s
                                  entre imágenes (sin pausa Meta solo entrega la última)
src/services/geo.js               Nominatim + parser links Maps + haversine + zona macro
src/services/calendar.js          Google Calendar (clave base64)
src/state/db.js                   SQLite + shim estilo Postgres + init/migraciones
src/state/leadStore.js            leads + historial + datosBot
src/state/propiedadStore.js       propiedades (con ubicacionMaps, lat, lng)
src/state/citaStore.js            citas + disponibilidad de horarios
src/state/disponibilidadStore.js  horario de atención por día
src/state/categoriaStore.js       categorías de tipo de propiedad
src/admin/router.js               API panel; /admin/uploads PÚBLICO (antes del auth,
                                  Meta descarga las fotos sin credenciales); al guardar
                                  propiedad resuelve link Maps → coordenadas
src/admin/public/                 frontend del panel (campo "Ubicación (link Maps)")
scripts/seed-propiedades.js       104 propiedades de prueba (idempotente, combos garantizados)
scripts/asignar-fotos.js          asigna 3 fotos por tipo (PUBLIC_URL=... node scripts/...)
scripts/geocodificar-propiedades.js  backfill de coordenadas (correr 1 vez tras seed)
scripts/replicar-fotos.js         replica fotos subidas a mano a propiedades sin fotos
assets/seed-fotos/                19 fotos libres (Unsplash) por tipo
data/                             bot.db + uploads/ (volumen en el server)
```

## Tablas (SQLite)
`leads`, `propiedades` (+ `ubicacionMaps`, `lat`, `lng`), `citas`, `disponibilidad`, `categorias`, `geocache` (caché de Nominatim). Identificadores camelCase entre comillas en todas las queries.

## Bugs resueltos (no reintroducir)

1. **Fotos no llegaban**: `/admin/uploads` debe ir ANTES del middleware de auth.
2. **Solo llegaba la última foto**: pausa ~1.2s entre envíos.
3. **URLs http**: `app.set("trust proxy", true)` (Traefik).
4. **WEBP no se entrega**: conversión a JPEG con Sharp al subir.
5. **Clave Google corrupta**: `GOOGLE_PRIVATE_KEY_BASE64`.
6. **BD borrada en redeploy**: volumen persistente `/app/data`.
7. **"avenida banzer" no matcheaba "Av. Banzer"**: matching por palabras clave.
8. **Modelo no guardaba filtros nuevos** ("no hay nada en X" con filtro viejo): extracción determinista por código antes del prompt.
9. **Modelo repetía "no hay disponible" del historial** aunque el prompt tuviera resultados: advertencia anti-sesgo + historial cortado a 12.
10. **Asteriscos literales en WhatsApp**: sanitizador Markdown→WhatsApp.
11. **Presupuesto no filtraba** (mostraba 68k a quien pidió 20k): filtro +30%/tope +50%.
12. **Migración accidental a Postgres** rompió el deploy: se revirtió a SQLite con shim de compatibilidad.

## Puesta en marcha de un servidor desde cero

```bash
# 1. Volumen /app/data en Coolify (Storages) — ANTES del primer deploy
# 2. Variables de entorno (ver arriba) y Deploy
# 3. En la Terminal de Coolify:
node scripts/seed-propiedades.js
PUBLIC_URL=https://bot.deliveryavaroa.xyz node scripts/asignar-fotos.js
node scripts/geocodificar-propiedades.js   # ~2 min (1 req/seg a Nominatim)
```

## Estado actual / pendiente

- Verificar en producción el fix anti-sesgo del historial (commit `e8b8bfa`+): preguntar por una zona con stock y confirmar que muestra las opciones.
- Probar de punta a punta: fotos proactivas, sugerencia de similares, agendado/reprogramación con Calendar, recordatorios 12h antes.
- El panel permite editar leads (PUT `/api/leads/:id`) para resetear filtros guardados de pruebas viejas.
- **Idea futura (SaaS multi-tenant)**: hay un plan por fases discutido — `empresaId` en todas las tablas, login real, webhook ruteando por `phone_id`, config del negocio en BD (hoy está en `src/config/business.json`), migrar a Postgres (los stores ya están en sintaxis Postgres), suscripciones con Stripe. Ver conversación/commits para contexto.
- **Idea futura (WhatsApp Flows)**: para formulario de búsqueda y elección de fecha/hora de visita; para fotos se decidió galería web (mejor experiencia y sin límites).

## Cómo probar en local

```bash
npm install
node index.js                        # web + webhook + panel + galería en :3000
node scripts/seed-propiedades.js
PUBLIC_URL=http://localhost:3000 node scripts/asignar-fotos.js
```

El system prompt se puede probar sin WhatsApp: `await bot.systemPrompt(props, lead)` en un script Node (init de db primero). La extracción: `bot.extraerFiltros(texto, propiedades)`.
