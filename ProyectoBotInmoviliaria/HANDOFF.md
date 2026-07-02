# Bot Inmobiliario Habitad — Documento de traspaso

Bot de WhatsApp con IA para la inmobiliaria **Habitad**: califica leads, muestra propiedades reales (nunca inventadas), envía fotos, agenda visitas con Google Calendar y tiene un panel admin web. Este documento resume todo para que otra persona continúe el desarrollo.

## Stack

- **Node.js + Express** (`index.js` arranca todo en el puerto 3000)
- **SQLite** (`node:sqlite`, archivo `data/bot.db`) — NO usa Postgres. Hubo una migración a Postgres que se revirtió; los stores quedaron escritos en estilo Postgres (`$1, $2`, `{ rows }`) y `src/state/db.js` tiene un **shim** que traduce eso a SQLite. No cambiar los stores, el shim lo maneja.
- **OpenAI** `gpt-4o-mini` con function calling (`src/services/openai.js`)
- **WhatsApp Cloud API v20.0** (webhook de Meta en `src/routes/webhook.js`)
- **Google Calendar** con service account JWT (`src/services/calendar.js`)
- **Multer + Sharp** para subir fotos (convierte WEBP→JPEG automáticamente, WhatsApp no entrega WEBP)

## Despliegue

- **Coolify** en un servidor Contabo, app `bots-whatsapp` (repo GitHub `jonathanSCM/Bots-whatsapp`, rama `main`).
- URL pública: `https://bot.deliveryavaroa.xyz`
- Panel admin: `https://bot.deliveryavaroa.xyz/admin/` (login con sesión/cookie, credenciales en variables de entorno del panel).
- **CRÍTICO: volumen persistente en `/app/data`** (Coolify → Storages). Ahí viven `bot.db` y `data/uploads/` (fotos). Sin volumen, cada redeploy borra la base — ya pasó una vez.
- Redeploy: botón "Redeploy" en Coolify. Verificar en el log de deployment que tome el commit esperado.

### Variables de entorno (Coolify)
- `OPENAI_API_KEY`
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `VERIFY_TOKEN` (webhook Meta)
- `GOOGLE_CALENDAR_ID`, `GOOGLE_CLIENT_EMAIL`, y **`GOOGLE_PRIVATE_KEY_BASE64`** (el PEM completo en base64; evita el error "DECODER routines::unsupported" que da `GOOGLE_PRIVATE_KEY` con `\n` escapados)
- Credenciales del panel admin

## Arquitectura del bot (lo importante)

### Principio central: el modelo NUNCA inventa propiedades
`src/bots/inmobiliaria.js` → `buscarPropiedadesFiltradas()` filtra en **código** (no en el prompt) las propiedades según el lead (operación, tipo, zona, dormitorios). El modelo solo ve el resultado ya filtrado (máx. 3) dentro del system prompt. Búsqueda escalonada:
1. Coincidencia exacta (zona + operación + tipo + dormitorios)
2. Relaja dormitorios
3. Relaja zona (muestra alternativas de otras zonas, avisando)
4. Si nada, el prompt le ordena ofrecer ajustar filtros

La zona se compara por **palabras clave** (`coincideTexto` + `palabrasClave`): normaliza acentos/puntuación y descarta genéricos ("av", "avenida", "calle", "zona", artículos), así "avenida banzer" matchea "Av. Banzer". También busca la zona dentro de la **descripción** de la propiedad.

### Flujo de conversación (impuesto por prompt)
zona → operación → tipo → características → presupuesto (siempre al final) → mostrar máx. 3 opciones → validar interés → conversión (info / agendar visita / similares). Tono: humano, 2-3 emojis por mensaje, menús numerados, proactivo (envía fotos automáticamente ante interés, sugiere similares sin que lo pidan).

### Segunda pasada tras actualizar el lead
En `webhook.js`: si el modelo llamó `actualizar_datos_lead` en el turno, el texto que generó se descartó (miraba el catálogo viejo) y se **regenera** el mensaje con el prompt recalculado con el lead nuevo. Sin esto el bot decía "no hay nada" con datos recién corregidos.

### Tools del modelo (function calling)
`actualizar_datos_lead`, `agendar_visita`, `reprogramar_visita`, `enviar_fotos_propiedad`, `derivar_a_asesor` (ver TOOLS en `src/bots/inmobiliaria.js`).

### Multi-bot
`src/bots/` soporta varios bots (inmobiliaria, restaurante) con menú de selección al primer contacto. **Solo importa el de inmobiliaria**; el resto es secundario.

## Mapa de archivos

```
index.js                        arranque, trust proxy (HTTPS detrás de Traefik)
src/routes/webhook.js           webhook Meta, orquestación del turno, segunda pasada
src/bots/inmobiliaria.js        system prompt, motor de búsqueda, tools, ejecutarFuncion
src/services/openai.js          llamada a gpt-4o-mini
src/services/whatsapp.js        envío de mensajes e imágenes (pausa ~1.2s entre fotos:
                                sin pausa Meta solo entrega la última)
src/services/calendar.js        Google Calendar (clave por base64)
src/state/db.js                 SQLite + shim estilo Postgres + init de tablas
src/state/leadStore.js          leads + historial (últimos 30 mensajes)
src/state/propiedadStore.js     propiedades
src/state/citaStore.js          citas + validación de disponibilidad
src/state/disponibilidadStore.js horarios de atención por día
src/state/categoriaStore.js     categorías de tipo de propiedad (panel)
src/admin/router.js             API + estáticos del panel; /admin/uploads es PÚBLICO
                                (antes del auth) para que Meta descargue las fotos
src/admin/public/               frontend del panel (leads, propiedades, citas,
                                disponibilidad, categorías, estadísticas)
scripts/seed-propiedades.js     regenera 104 propiedades de prueba (idempotente,
                                con combinaciones garantizadas ej. depa venta Av. Banzer)
scripts/asignar-fotos.js        asigna 3 fotos por tipo desde assets/seed-fotos
                                (uso: PUBLIC_URL=https://bot.deliveryavaroa.xyz node scripts/asignar-fotos.js)
scripts/replicar-fotos.js       replica fotos subidas a mano hacia propiedades sin fotos
assets/seed-fotos/              19 fotos libres (Unsplash) por tipo de propiedad
data/                           bot.db + uploads/ (en el server es el volumen)
```

## Tablas (SQLite, identificadores camelCase entre comillas)
`leads` (datos del prospecto + `historial` JSON + `datosBot` JSON), `propiedades` (con `fotos` JSON de URLs públicas), `citas` (con `googleEventId`, `recordatorioEnviado`), `disponibilidad` (horario por día de semana), `categorias`.

## Bugs ya resueltos (no reintroducir)

1. **Fotos no llegaban**: `/admin/uploads` debe registrarse ANTES del middleware de auth (Meta las descarga sin credenciales).
2. **Solo llegaba la última foto**: pausa de ~1.2s entre envíos consecutivos (`enviarImagenes`).
3. **URLs http en vez de https**: `app.set("trust proxy", true)` (Traefik).
4. **WEBP no se entrega**: conversión automática a JPEG con Sharp al subir.
5. **"No hay disponible" con datos recién corregidos**: regla crítica en el prompt (guardar todo dato mencionado aunque venga en una pregunta) + segunda pasada del prompt.
6. **Clave de Google corrupta**: usar `GOOGLE_PRIVATE_KEY_BASE64`.
7. **"avenida banzer" no matcheaba "Av. Banzer"**: matching por palabras clave.
8. **BD borrada en redeploy**: volumen persistente en `/app/data`.

## Estado actual / pendiente

- **PENDIENTE — verificar en producción la búsqueda por zona**: en local, con el lead real del cliente (zona "Avenida Banzer", depto, venta, 3 dormitorios), el motor SÍ encuentra P083/P041 vía el nivel "relaja dormitorios". Pero en el servidor el bot seguía respondiendo "no tengo departamentos en Av. Banzer". Lo más probable: el deploy corriendo no incluye los últimos commits (verificar que el deployment tome ≥ `89aec6f`) o el proceso necesita reinicio. Diagnóstico útil: los logs imprimen `--- [inmobiliaria] function call:` y `<<< [inmobiliaria] BOT:` por cada turno.
- Probar de punta a punta: fotos proactivas al mostrar interés, sugerencia automática de similares, agendado/reprogramación de visitas con Calendar, recordatorios 12h antes.
- Los leads viejos pueden tener filtros guardados (dormitorios, presupuesto) que condicionan la búsqueda; el panel permite editarlos (PUT `/api/leads/:id`).

## Cómo probar en local

```bash
npm install
node index.js            # levanta web + webhook + panel en :3000
node scripts/seed-propiedades.js
```

El system prompt se puede probar sin WhatsApp llamando `bot.systemPrompt(props, lead)` en un script de Node (ver historial de commits para ejemplos).
