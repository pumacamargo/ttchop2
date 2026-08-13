# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Regla #1 del proyecto: `/root/ttchop` (la app original) es INTOCABLE.** TTChop2 es un fork
> independiente con su propio proyecto de Firebase. Nada de lo que se haga aquí puede tocar el
> repo, el proyecto de Firebase, ni los datos de `ttchop`. Verificar con `git -C /root/ttchop status`
> si hay cualquier duda.

## Qué es TTChop2

Webapp **móvil-first** para vendedores de TikTok Shop: gestiona productos y clips, genera videos
de marketing (guion + voz + render), los agenda, y cruza las ventas reales de TikTok Shop contra
los videos publicados para saber qué está funcionando.

- **Producción**: https://ttchop2.web.app (proyecto Firebase `ttchop2`)
- **Estado**: en producción con datos reales. El rediseño de secciones está completo; ver `PLAN.md`
  para el estado por fase y lo que queda pendiente.

## Stack

- **Frontend**: React 19 + TypeScript + Vite 8 (plugin de React basado en Oxc)
- **Backend**: Firebase (Auth, Firestore, Storage, Cloud Functions) + `ttchop-server` (VPS externo)
- **UI**: `lucide-react`, CSS plano con variables en `index.css`, dark theme
- **Datos**: `xlsx` para importar los reportes de TikTok Shop del lado del cliente
- **Extensión**: Chrome MV3, JS plano sin build (carpeta `extension/`)

## Comandos

```bash
npm run dev       # dev server en localhost:5173
npm run build     # tsc -b (type check) + vite build — SIEMPRE correrlo antes de deployar
npm run lint      # eslint
firebase deploy --only hosting --project ttchop2    # deploy de la webapp
firebase deploy --only functions --project ttchop2  # deploy de las Cloud Functions
```

`npm run build` corre `tsc -b` primero, así que cualquier error de tipos rompe el build. **Ojo**:
`src/i18n.ts` es un objeto plano — una key que falta en un idioma compila sin problema y aparece
como `undefined` en pantalla en tiempo de ejecución. Al agregar keys hay que agregarlas en los
**tres** idiomas y verificarlo a mano.

## Arquitectura

### Navegación

No hay router. `main.tsx` decide por `window.location.pathname` entre tres cosas:

| Path | Qué renderiza | Auth |
|---|---|---|
| `/p/:productId` | `PublicProductPage` | pública |
| `/terms`, `/privacy` | `LegalPages` | pública (TikTok y las tiendas de extensiones las leen anónimamente — **no pueden quedar detrás del login**) |
| todo lo demás | `AuthProvider` → `App` | requiere sesión |

Dentro de `App.tsx` la navegación es un estado `ActiveTab` (definido en `src/types/navigation.ts`,
fuera de `App.tsx` para evitar el import circular con `SidePanel.tsx`), y el menú es un **panel
lateral** que sale del botón de hamburguesa — no hay bottom nav.

`sessions` y `renders` son rutas internas sin item en el panel: se llega a ellas desde dentro de
un producto.

### Contenedores (separación de datos por cuenta de TikTok)

Concepto central, implementado en `src/utils/containerVisibility.ts` y `ContainerContext.tsx`.

Un **contenedor** es o el general/compartido, o una cuenta de TikTok conectada (identificada por
su `openId`). Reglas:

- `accountId` ausente, `null` o `''` significa **contenedor general**. Los tres casos son
  equivalentes y `isGeneralContainer()` es el único lugar donde se hace ese chequeo tri-estado.
  Esto es lo que permitió introducir contenedores con **cero migración** de los datos existentes.
- Conectar una cuenta de TikTok es **opcional**: todo usuario arranca en el general.
- Hay **una sola** noción de cuenta activa. Cambiar de contenedor cambia también el destino de las
  subidas a TikTok. No volver a introducir dos preferencias separadas.

### Importaciones (`imports`)

`analytics_orders` y `tiktok_videos` **no llevan el contenedor encima**. Cada documento apunta a
un `imports/{id}` con su `importId`, y ese registro es el que tiene el `accountId`. Así reasignar
una importación de 500 órdenes es **una** escritura, no 500.

Documentos anteriores a esta función no tienen `importId` y resuelven directo desde su propio
`accountId`. `getEffectiveContainer()` maneja ambos casos.

### Capa de datos

`databaseService.ts` es un singleton grande (~4000 líneas) con todo el CRUD. Patrones que hay que
respetar:

- **Toda query filtra por `userId`.** Es el límite de seguridad, reforzado en `firestore.rules`.
- **`stripUndefined()` antes de escribir.** Firestore rechaza `undefined` con un error que no dice
  qué campo fue. Esto ya rompió la creación de collages una vez.
- **Normalización al leer.** `normalizeProduct()` / `normalizeTemplate()` migran documentos con el
  shape viejo al leerlos. Renombrar la interfaz de TypeScript **no migra** los documentos ya
  guardados en Firestore — este bug rompió producción una vez. Cualquier rename o reestructura de
  un campo en una colección con datos reales necesita su función de normalización **antes** de
  deployar.
- **`projectId: FIREBASE_PROJECT_ID` en todo payload al servidor.** `ttchop-server` atiende a
  `ttchop` y `ttchop2`; sin ese campo cae al default (`ttchop`) y escribe el resultado al proyecto
  equivocado.

### Endpoints externos

`ttchop-server.lemonsushi.com` es el único endpoint. **No hay modos prod/test/server** — se
eliminaron; no reintroducirlos.

La excepción es `N8N_ONLY_FLOWS` en `databaseService.ts`: flujos que el servidor nunca implementó
y siguen yendo a n8n directo. Hoy contiene `ttchop_videoMetaExtractor` (`/ai/meta`). Si se agrega
ese endpoint al servidor, sacarlo del set.

Ver `PENDIENTES-SERVIDOR.md` para los endpoints que la webapp ya llama pero el servidor todavía
no implementa.

### Cloud Functions (`functions/index.js`)

`productPage` (SSR de `/p/**` para el link público), `tiktokExchange`, `tiktokAccounts`,
`tiktokDisconnect`, `tiktokUpload`. Los tokens de TikTok viven **solo** del lado del servidor en
`tiktok_accounts` — nunca se exponen al cliente.

## Firestore

```
products/{id}              userId, name, description, region?, modelSheetUrls[], videos[], sourceUrl?, scrapedAt?, accountId?
sessions/{id}              userId, name, productIds[], videos[], accountId?
templates/{id}             userId, title, type: 'script'|'voice'|'ai_prompt', voiceId?   ← sin accountId: los templates son compartidos entre contenedores
renders/{id}               userId, productId, type, status, videoUrl, tiktokVideoId?, publishedAt?, accountId?
scheduled_renders/{id}     userId, fecha/hora programada, estado, accountId?
master_videos/{id}         userId, productId, templateId, scriptText, audioUrl, usedCombinations[]
video_variations/{id}      legacy del flujo viejo de combinaciones
imports/{id}               userId, importedAt, source, accountId?   ← el contenedor vive acá
analytics_orders/{userId}/orders/{compositeKey}    órdenes de TikTok Shop, con importId
tiktok_videos/{id}         stats capturadas de TikTok Studio, con importId
reports/{userId}/history/{id}
brand_concepts/{userId}    doc único
calendar_strategy/{userId} doc único
user_prefs/{userId}        cuenta/contenedor activo
tiktok_accounts/{id}       SOLO servidor: tokens de OAuth
```

**`analytics_orders` es una subcolección.** Consultarla como colección de nivel superior devuelve
cero documentos aunque haya datos — la ruta real es `analytics_orders/{userId}/orders/`. Este
error ya llevó a reportar "la base está vacía" cuando no lo estaba.

## Analytics

`src/utils/analytics.ts` tiene toda la matemática, compartida entre `AnalyticsView` y
`DashboardView`. `src/components/shared/AnalyticsUI.tsx` tiene los componentes visuales comunes.

- **Períodos**: `'d7' | 'd15' | 'd30' | 'm6' | 'all'`, ventanas **móviles** (últimos N días desde
  ahora), no períodos de calendario. Los días salen de `PERIOD_DAYS`; agregar un período nuevo es
  una línea en ese mapa.
- **Default**: `'d15'` en Dashboard y en Analytics.
- **Merge TTChop ↔ TikTok**: `Content ID` del reporte de TikTok Shop = `tiktokVideoId` del render.
- Solo las filas con `Order settlement status = Settled` cuentan como ingreso real.
- Las gráficas usan `preserveAspectRatio="none"` para llenar el ancho, lo que **deforma cualquier
  forma dentro del SVG**. Texto y puntos van como overlay HTML posicionado por porcentaje, no como
  `<text>` o `<circle>`.

## Extensión de Chrome

Tres content scripts con trabajos distintos (ver `extension/README.md` para instalación y uso):

- `content.js` — botón para importar productos en páginas de TikTok Shop. **Excluye** el dominio
  de TikTok Studio.
- `studio-interceptor.js` — corre en `world: "MAIN"` y parcha `fetch`/`XHR` para leer las
  respuestas de la API interna de TikTok Studio. **Siempre llama al original primero, lee solo
  `.clone()`, y devuelve la promesa intacta** — cualquier otra cosa rompe la página que está
  interceptando.
- `studio-content.js` — panel flotante con el selector de contenedor.

Las firmas anti-bot de TikTok (`msToken`, `X-Bogus`, `X-Gnarly`) **no se pueden replicar** desde
fuera del navegador. Por eso la captura de stats es una extensión y no un scraper en el servidor.

## Deploy y caché

`firebase.json` sirve `index.html` con `no-cache` y `/assets/**` como `immutable`. **Gana la
última regla que matchea**, por eso la de assets va al final. Si se invierte el orden, cada deploy
deja a los usuarios con el bundle viejo.

Tras un deploy hay que forzar recarga (Ctrl+Shift+R) para ver los cambios.

## Idiomas

Tres: `'English' | 'Spanish (Mexico)' | 'Japanese'`, en `src/i18n.ts`, vía el hook `useT()`. Cero
strings hardcodeados en UI nueva.

Deuda conocida: `SessionDetailModal.tsx` tiene strings en español hardcodeados de antes del i18n.

## Trampas conocidas

1. **`analytics_orders` es subcolección** — ver arriba.
2. **`undefined` en escrituras de Firestore** — usar `stripUndefined()`.
3. **Renombrar campos no migra datos** — hace falta normalización al leer.
4. **Keys de i18n faltantes no rompen el build** — se ven como `undefined` en pantalla.
5. **Falta `projectId`** → el servidor escribe al proyecto equivocado.
6. **Orden de las reglas de caché en `firebase.json`** — la última gana.
7. **Formas dentro de un SVG con `preserveAspectRatio="none"`** salen deformadas.
8. **Subir archivos**: `File.slice(0)` no copia (es una vista perezosa) y `arrayBuffer()` revienta
   la memoria en archivos grandes. La estrategia actual depende del tamaño: ≤25MB se leen a
   memoria, más grandes se pasan directo. Registrar el render **inmediatamente** después de subir,
   antes de enriquecerlo — si no, un fallo en el thumbnail deja el video huérfano.
9. **Verificar lo que reporta un subagente.** Ya pasó que uno afirmara que unos archivos "ya
   existían" cuando los acababa de crear él mismo.

## Tareas comunes

**Agregar una sección al menú**: agregar el valor a `ActiveTab` en `src/types/navigation.ts`,
el item en `SidePanel.tsx`, el caso en el switch de `App.tsx`, y las keys de i18n en los tres
idiomas.

**Agregar una query de Firestore**: método nuevo en `databaseService.ts`, siempre filtrando por
`userId`, con `stripUndefined()` en las escrituras y la regla correspondiente en `firestore.rules`.

**Agregar un período de analytics**: una entrada en `PERIOD_DAYS`, la opción en los dos
`PeriodSelector`, y las keys de i18n.
