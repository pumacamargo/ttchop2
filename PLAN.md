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
