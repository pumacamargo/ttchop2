# TTChop2 — Plan y estado

> Este archivo se mantiene actualizado en cada sesión de trabajo. Si una sesión de Claude Code se
> cierra, la siguiente debe leer esto primero para saber en qué quedó todo.
>
> **Última actualización: 2026-08-13.**

## Regla #1

`/root/ttchop` (la app original) es **INTOCABLE**. TTChop2 es un fork con su propio proyecto de
Firebase (`ttchop2`), su propio repo y sus propios datos. Verificar con
`git -C /root/ttchop status` ante cualquier duda.

Lo único compartido es `ttchop-server`, que decide a qué proyecto escribir según el `projectId`
que recibe en cada llamada.

## Qué se construyó

El rediseño partió de una copia de `ttchop` (MVP con navegación de 5 botones abajo, modos
prod/test/server y casi todo pensado para una sola cuenta) y lo convirtió en una herramienta de
operación diaria para vendedores de TikTok Shop, con datos reales.

Los cambios estructurales fueron cuatro:

1. **Panel lateral** en vez de bottom nav, con secciones nuevas (Dashboard, Analytics, Brand
   Concept, Reports, Calendario).
2. **Múltiples cuentas de TikTok** vía contenedores de datos, con el general como default y
   conectar cuenta como algo opcional.
3. **Clips y Renders dentro del Producto** (pestañas Info / Clips / Renders) en lugar de secciones
   sueltas del menú.
4. **Analytics real**: importar el `.xlsx` de TikTok Shop y cruzarlo contra los videos publicados.

## Estado por fase

| Fase | Qué es | Estado |
|---|---|---|
| 1 | Panel lateral, `ActiveTab` nuevo, eliminar modos prod/test/server | ✅ completa |
| 2 | Products con pestañas Info / Clips / Renders, `scrapedAt` | ✅ completa |
| 3 | Brand Concept y Reports | ✅ UI completa — Reports depende de un endpoint que no existe |
| 4 | Calendario con Estrategia y Populate | ✅ UI completa — Populate depende de un endpoint que no existe |
| 5 | Analytics: import de TikTok Shop, cruce con renders, Dashboard con datos reales | ✅ completa |
| 6 | OAuth de TikTok, subir a borradores, switch de cuenta | ✅ completa — la app está **pendiente de aprobación** de TikTok para producción |

Además, fuera del plan original: captura de estadísticas desde TikTok Studio vía extensión,
Manage Imports, páginas legales públicas y verificación de dominio para el trámite con TikTok.

## Pendientes reales

### Bloqueado por terceros

- **Aprobación de la app de TikTok.** El flujo de OAuth y subida a borradores está implementado y
  funciona en sandbox. Producción espera la revisión de TikTok.

### Bloqueado por `ttchop-server`

Detalle completo, con request y response esperados, en [`PENDIENTES-SERVIDOR.md`](PENDIENTES-SERVIDOR.md):

- `POST /calendar/populate` — el botón "Populate Calendar" ya llama, el servidor no lo implementa.
- `POST /reports/generate` — el botón de generar reporte ya llama, el servidor no lo implementa.
- `POST /ai/meta` — nunca existió en el servidor. El análisis de clips va a n8n directo vía
  `N8N_ONLY_FLOWS`; si se implementa en el servidor, sacarlo de ese set.

Ya resueltos y verificados el 2026-08-13: el CORS del servidor acepta `https://ttchop2.web.app`, y
el servidor soporta múltiples proyectos (`pipeline/firebase.js`), así que los renders de ttchop2
se escriben al proyecto correcto.

### Deuda conocida

- `SessionDetailModal.tsx` tiene strings en español hardcodeados de antes del i18n.
- El bundle pesa ~1.3MB; `xlsx` son ~460KB de eso y podría cargarse bajo demanda desde Analytics.
- **Datos del usuario**: la importación de TikTok Studio (215 videos) quedó en el contenedor
  General, mientras que las ventas fueron al contenedor de Art's Choice. Reasignarla desde
  Analytics → Manage Imports.

### Pospuesto explícitamente

- **Video Editor** (timeline real) y **Tools**: hoy son placeholders en el menú. Cuando se retome
  el editor: colección `edits/{id}` con `timeline: [{clipId, order, trimStart, trimEnd}]`, donde
  el trim es **por instancia**, copiado del default del clip al agregarse — no una referencia viva,
  para que editar el clip no altere ediciones ya hechas.
- Vision Worker (auto-tagging de clips).
- Videos de otras personas como referencia/inspiración.
- Decidir si los workers de render migran del VPS+n8n actual a algo gestionado. El usuario ya
  tiene VPS+n8n funcionando; **no forzar** esa migración.

## Decisiones que no hay que volver a discutir

- **Sin modos prod/test/server.** `ttchop-server.lemonsushi.com` es el único endpoint.
- **Contenedores sin migración.** `accountId` ausente, `null` o `''` es el contenedor general. Los
  tres casos son equivalentes; el chequeo vive solo en `isGeneralContainer()`.
- **El contenedor vive en la importación, no en cada documento.** Reasignar 500 órdenes tiene que
  ser una escritura, no 500.
- **Una sola noción de cuenta activa.** Cambiar de contenedor cambia también el destino de las
  subidas. Ya hubo un bug por tener dos preferencias separadas.
- **Agrupar importaciones por fecha, no por usuario.** Los datos de TikTok Studio no traen nombre
  de usuario; agrupar por usuario sería adivinar.
- **Extensión de Chrome en vez de scraper remoto.** Se evaluó Playwright headless con live view por
  CDP y se descartó: el riesgo real no es el captcha sino el fingerprint de datacenter. La
  extensión corre en el navegador real del usuario, con su IP y su sesión. Trade-off aceptado:
  solo funciona en Chrome de escritorio.
- **Períodos como ventanas móviles**, no de calendario: "últimos 15 días", no "este mes".

## Lecciones que costaron caro

- **Renombrar un campo en TypeScript no migra Firestore.** Rompió producción una vez
  (`Cannot read properties of undefined reading 'length'`). Todo rename en una colección con datos
  reales necesita su función de normalización al leer, **antes** de deployar.
- **`analytics_orders` es una subcolección** (`analytics_orders/{userId}/orders/`). Consultarla
  como colección de nivel superior devuelve cero y parece una base vacía cuando no lo está.
- **Firestore rechaza `undefined`** con un error que no nombra el campo. De ahí `stripUndefined()`.
- **En `firebase.json` gana la última regla de headers que matchea.** Si la de `/assets/**` no va
  al final, cada deploy deja a los usuarios con el bundle viejo.
- **Verificar lo que reporta un subagente.** Uno afirmó que ciertos archivos "ya existían" cuando
  los acababa de crear él mismo.
- **Subidas de archivos**: `File.slice(0)` no copia (es una vista perezosa), `arrayBuffer()`
  revienta la memoria en archivos grandes, y un detector de estancamiento demasiado agresivo mata
  subidas sanas. Registrar el render en cuanto sube, antes de enriquecerlo.

## Cómo desplegar

```bash
npm run build
firebase deploy --only hosting --project ttchop2
firebase deploy --only functions --project ttchop2       # solo si cambiaron
firebase deploy --only firestore:rules --project ttchop2
firebase deploy --only storage --project ttchop2
```

CLI autenticada como `puma.camargo@gmail.com`, en el VPS y en la máquina Windows del usuario.

Después de desplegar hay que forzar recarga (Ctrl+Shift+R) para ver los cambios.

## Recordatorios de proceso

- No hacer `git commit` ni `push` sin que el usuario lo pida, salvo que haya dado permiso para una
  tanda de trabajo.
- Verificar las afirmaciones de los subagentes de forma independiente antes de darlas por buenas.

---

## Roadmap: ttchop-bot — Sistema autónomo

> **Última actualización: 2026-09-29.**
>
> **Filosofía central:** ttchop-bot hace el 90% del negocio. Cacho hace el 10%: grabar videos y publicarlos.
> El bot no es una herramienta para que Cacho trabaje — es el negocio corriendo solo.
>
> **Interfaz de Cacho:** Telegram (reporte diario consolidado + alertas urgentes). La webapp es un dashboard de auditoría opcional, no el flujo principal.

### Qué hace Cacho (el 10%)
- Grabar los clips de video (físico)
- Diseño de arte / thumbnails
- Revisar y publicar los videos que el bot produjo
- Leer el reporte diario de Telegram y tomar decisiones si hay algo urgente
- Responder mensajes de marcas cuando el bot los marca como prioritarios

### Qué hace ttchop-bot (el 90%)
- Scout: descubrir productos, leer invitaciones, monitorear competidores, gestionar samples
- Intel: analizar qué funciona, calcular ROI, decidir qué producir hoy
- Producer: generar collage + overlay + thumbnail automáticamente
- Delivery: reporte diario en Telegram, alertas de riesgo

---

### Arquitectura ttchop-bot

```
ttchop-bot/
├── config/index.js          — configuración + lista de cuentas (multi-cuenta desde el inicio)
├── scheduler/index.js       — cron jobs: 06:00 scout, 08:00 producer, 20:00 reporte
├── modules/
│   ├── risk/index.js        — anti-ban: rate limiting, delays humanos, detección de warnings
│   ├── scout/
│   │   ├── adb.js           — helper ADB: unlock, tap, swipe, screenshot
│   │   ├── navigate.js      — secuencias de navegación en TikTok
│   │   ├── vision.js        — Claude Haiku Vision: leer screenshots → JSON estructurado
│   │   └── index.js         — orquestador del scout por cuenta
│   ├── intel/index.js       — ROI, scoring de productos, decisión de qué producir
│   ├── producer/index.js    — llama ttchop-server + ttchop-post
│   ├── delivery/index.js    — Telegram: reporte diario + alertas
│   └── data/firestore.js    — capa de datos Firestore compartida
```

**Infraestructura de celulares:**
- VPS → Pi (Tailscale `100.117.79.114`) → A35 (ADB via socat puerto 5038)
- Servicios systemd en el Pi: `adb-local` + `adb-proxy` (auto-start en boot)
- Multi-cuenta: agregar más entradas en `config.accounts[]` cuando haya más celulares

---

### Gestión de riesgo (TikTok ToS)

Cacho ha tenido problemas con TikTok — el riesgo es real. Estrategia:

| Riesgo | Mitigación |
|--------|-----------|
| Patrones de timing repetitivos | Delays aleatorios (800ms–3500ms) entre cada acción |
| Mismas páginas siempre | Browsear el feed 30s antes de navegar a Shop |
| Demasiadas acciones | Límite de 30 acciones/día por cuenta |
| Warning de TikTok no detectado | Vision AI revisa cada screenshot antes de procesarlo |
| Respuestas automáticas a marcas | Prohibido — el bot solo lee y alerta, Cacho responde |
| Múltiples cuentas en mismo device | Prohibido — una cuenta por celular físico |

---

### Colecciones Firestore nuevas (proyecto ttchop2)

| Colección | Qué guarda |
|-----------|-----------|
| `collab_invitations` | Mensajes de marcas con traducción y prioridad |
| `products_trending` | Productos trending de TikTok Shop con scorecard |
| `sample_requests` | Solicitudes de muestras gratis con estado |
| `competitor_videos` | Videos públicos de competidores para análisis |
| `risk_events` | Advertencias y eventos de riesgo por cuenta |

---

### Estado de implementación

| Módulo | Estado | Notas |
|--------|--------|-------|
| `config` (multi-cuenta) | ✅ listo | Galaxy A35 como primera cuenta |
| `risk/index.js` | ✅ listo | Rate limiting + delays humanos |
| `scout/adb.js` | ✅ listo | Helper ADB completo |
| `scout/navigate.js` | ✅ listo | Collab messages, affiliate, samples |
| `scout/vision.js` | ✅ listo | Claude Haiku Vision |
| `scout/index.js` | 🔄 parcial | Collab messages implementado; falta el resto |
| `delivery/index.js` | ✅ listo | Reporte diario + alertas |
| `data/firestore.js` | ✅ listo | collab_invitations, trending, samples, risk |
| `intel/index.js` | ⏳ pendiente | ROI + scoring |
| `producer/index.js` | ⏳ pendiente | Pipeline automático |
| Scout: affiliate invitations | ⏳ pendiente | |
| Scout: free samples mgmt | ⏳ pendiente | |
| Scout: competitor monitoring | ⏳ pendiente | Cacho provee las cuentas |
| Scout: trending products | ⏳ pendiente | |
| Scout: analytics propios | ⏳ pendiente | |
| Scout: tasks/missions | ⏳ pendiente | |

---

### Intel + Scout (roadmap webapp — SECUNDARIO)

### INTEL — conectar datos que ya existen

**Fase I-1: Vista centralizada de Video** ⏳ pendiente
Nueva vista "Videos" en el menú. Cruza las tres colecciones por `tiktokVideoId`:
- `renders` → receta: producto, template de guion, voz, overlay, clips, idioma
- `tiktok_videos` → stats: vistas, likes, shares, watch time
- `analytics_orders` → ventas: órdenes, GMV, comisión

Un solo objeto por video con todo adentro. Filtrable y ordenable por conversión, comisión o template.

**Fase I-2: Costo de producción + ROI** ⏳ pendiente
- Campo `productionCost` nuevo en el render (se llena al crear o editar)
- ROI = comisión generada - costo de producción
- Visible por video y agregado por producto

**Fase I-3: Semáforo de salud** ⏳ pendiente
- 🟢 Verde — tiene vistas Y ventas
- 🟡 Amarillo — tiene vistas pero sin ventas en 14 días
- 🔴 Rojo — sin vistas en 14 días
- Aparece en tarjeta de producto y en el Dashboard principal

**Fase I-4: `POST /reports/generate` en ttchop-server** ⏳ pendiente
- Spec completa ya en `PENDIENTES-SERVIDOR.md`
- El frontend ya lo llama y maneja el 404 con gracia
- Responde en markdown: qué funcionó, qué no, 2-4 recomendaciones concretas

---

### SCOUT — nuevo, requiere celular Android (Google Pixel 6a)

**Fase S-1: Infraestructura ADB** ⏳ pendiente (bloqueado: falta el celular)
Módulo nuevo `pipeline/adb.js` en `ttchop-server`:
- Conexión ADB over WiFi al Pixel 6a
- Health check cada 5 minutos con auto-reconexión
- Cola de tareas para cuando el celular estaba offline
- Endpoint `GET /scout/health` para monitoreo desde ttchop2

**Fase S-2: Vista Scout — Descubrimiento de productos** ⏳ pendiente (bloqueado: falta S-1)
Nueva sección "Scout" en el menú de ttchop2:
- Navega TikTok Shop vía ADB y extrae productos trending
- Scorecard por producto: comisión % · precio · número de competidores · reviews
- Botón "Producir" → agrega el producto directo al catálogo en Firestore

**Fase S-3: Gestión de marcas** ⏳ pendiente (bloqueado: falta S-1)
Subsección "Marcas" dentro de Scout:
- Lee bandeja de invitaciones de TikTok Shop vía ADB
- Califica cada invitación automáticamente (comisión, producto, historial)
- CRM simple: estado por marca (nueva / contactada / negociando / activa / descartada)
- Genera borrador de outreach basado en las mejores métricas del creador

---

### Orden de construcción

```
Sin celular (ahora):
  I-1  Vista centralizada de Video
  I-2  Costo de producción + ROI
  I-3  Semáforo de salud
  I-4  POST /reports/generate (en ttchop-server)

Con celular (cuando llegue el Pixel 6a):
  S-1  Infraestructura ADB
  S-2  Descubrimiento de productos
  S-3  Gestión de marcas
```
