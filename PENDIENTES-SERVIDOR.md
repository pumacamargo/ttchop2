# Pendientes del servidor (ttchop-server)

> **Importante**: `ttchop-server` es un proyecto aparte que **no vive en este repositorio** (`ttchop2`). Este archivo documenta, desde el lado del cliente, qué endpoints faltan implementar allá para que funciones ya construidas en el frontend dejen de estar "apagadas". El cliente ya está preparado para consumirlos — solo falta el lado del servidor.

---

## `POST /calendar/populate` (Phase 4 — Calendario con Estrategia)

### Estado actual
El endpoint **no existe todavía**. El cliente (`src/services/databaseService.ts`, método `populateCalendar()`, y `src/components/CalendarStrategyPanel.tsx`) ya hace el `fetch` correspondiente, y maneja el 404/error de forma controlada mostrando un mensaje de "función no disponible aún" — no hay ningún crash del lado del cliente mientras este endpoint no exista.

La URL completa se resuelve con `resolveWebhookUrl('ttchop_calendar_populate', '/calendar/populate')` en `databaseService.ts`, es decir: `{TTCHOP_SERVER_URL}/calendar/populate` (hoy `TTCHOP_SERVER_URL = 'https://ttchop-server.lemonsushi.com'`).

### Qué debe hacer
Recibe la estrategia en texto libre del usuario, su catálogo de productos y templates disponibles, y el timezone/horizonte de planeación. Debe usar un LLM para **proponer** un plan de videos a futuro (fecha, hora, producto, tipo de video) que respete la estrategia del usuario y evite duplicar lo que ya está programado. **El endpoint solo propone — nunca debe escribir nada en Firestore.** La aprobación final y la creación de los `scheduled_renders` la hace el cliente, después de que el usuario revisa y aprueba manualmente la propuesta.

### Request

```
POST {TTCHOP_SERVER_URL}/calendar/populate
Content-Type: application/json
```

```ts
{
  strategy: string;              // texto libre del usuario: cuántos videos/semana, qué productos priorizar, horarios, tono, etc.
  timezone: string;              // IANA timezone del calendario del usuario, ej. "America/Mexico_City" o "Asia/Tokyo"
  horizonDays: number;           // cuántos días hacia adelante debe planear (el cliente ofrece 7 / 14 / 30)
  products: {
    id: string;
    name: string;
    description: string;
    region: string;              // código de país del producto, ej. "mx" | "jp", puede venir vacío
  }[];
  templates: {
    id: string;
    type: 'aiGen' | 'collage' | 'voice' | 'overlay';
    title: string;
  }[];
  existingJobs: {
    localDate: string;            // "YYYY-MM-DD" en el timezone del usuario
    productId: string;
  }[];                             // lo que el usuario ya tiene programado — el LLM debe evitar proponer lo mismo (mismo producto + fecha)
}
```

### Response esperado (HTTP 200)

```ts
{
  jobs: {
    localDate: string;        // "YYYY-MM-DD", debe estar entre hoy y hoy+horizonDays en el timezone recibido
    time: string;             // "HH:mm" en la timezone del usuario (24h)
    productId: string;        // debe ser uno de los IDs recibidos en `products`
    type: 'collage' | 'overlay' | 'collage+overlay' | 'ai';
    voiceTemplateId?: string;    // id de un template type "voice", solo relevante si type incluye "collage"
    collageTemplateId?: string; // id de un template type "collage", solo relevante si type incluye "collage"
    aiTemplateId?: string;      // id de un template type "aiGen", solo relevante si type === "ai"
    overlayTemplateId?: string; // id de un template type "overlay", solo relevante si type incluye "overlay"
    language?: string;          // "spanish" | "japanese" | "english"
    extraNotes?: string;        // notas libres para ese render puntual (ej. "outdoor, sunset")
  }[];
  reasoning?: string;   // explicación corta (1-3 frases) de por qué se propuso este plan — se le muestra al usuario antes de aprobar
}
```

### Reglas para el LLM que arma la propuesta
1. **Nunca** proponer un `localDate` + `productId` que ya aparezca en `existingJobs`.
2. Respetar la cadencia/volumen que el usuario describe en `strategy` (ej. "3 videos por semana" → no proponer 20).
3. Solo usar `productId` de la lista `products` recibida, y solo usar `voiceTemplateId` / `collageTemplateId` / `aiTemplateId` / `overlayTemplateId` de la lista `templates` recibida, filtrando por su `type` correspondiente.
4. Todas las fechas propuestas deben caer dentro de `[hoy, hoy + horizonDays]` en la timezone recibida.
5. Si `strategy` menciona horarios preferidos, usarlos; si no, elegir horarios razonables (mañana o tarde/noche, hora del público objetivo según `region` del producto).
6. Devolver siempre un JSON válido con la forma exacta de arriba — el cliente descarta (sin romperse) cualquier `job` individual que no tenga `localDate` o `productId` válidos, pero si la respuesta entera no tiene un array `jobs`, la trata como "función no disponible" y no muestra nada.

### Validación que ya hace el cliente (no hace falta duplicarla en el servidor, pero ayuda a saber qué tan estricto puede ser el LLM)
- Descarta cualquier `job` cuyo `localDate` no tenga formato `YYYY-MM-DD`, esté en el pasado, o esté más allá de `hoy + horizonDays`.
- Descarta cualquier `job` cuyo `productId` no exista en la lista de productos del usuario.
- Descarta cualquier `job` cuyo `type` no sea uno de `'collage' | 'overlay' | 'collage+overlay' | 'ai'`.
- Cuenta y muestra al usuario cuántas propuestas se descartaron por inválidas.
- El resto de campos opcionales que no sean `string` se normalizan a cadena vacía.

---

## Firestore: colección nueva `calendar_strategy`

No requiere cambios en `ttchop-server` — es leída/escrita directo por el cliente vía Firestore SDK — pero se documenta aquí para contexto de cualquier backend dev que también toque reglas de Firestore o scripts de administración:

```
calendar_strategy/{userId}
  ├── strategy: string   // texto libre del usuario
  └── updatedAt: string  // ISO timestamp
```

Un documento por usuario. Reglas en `firestore.rules`: solo el propio usuario puede leer/escribir su documento (mismo patrón que `user_prefs`).

---

## `POST /reports/generate` (Phase 3 — Reports)

### Estado actual
El endpoint **no existe todavía**. El cliente (`src/services/databaseService.ts`, método `generateReport()`, y `src/components/ReportsView.tsx`) ya hace el `fetch` correspondiente, valida la forma de la respuesta, y maneja cualquier fallo (404, error de red, JSON con forma inesperada) mostrando un mensaje de "no se pudo generar el reporte" con botón de reintentar — no hay ningún crash del lado del cliente mientras este endpoint no exista.

La URL completa se resuelve con `resolveWebhookUrl('ttchop_reports_generate', '/reports/generate')` en `databaseService.ts`, es decir: `{TTCHOP_SERVER_URL}/reports/generate` (hoy `TTCHOP_SERVER_URL = 'https://ttchop-server.lemonsushi.com'`).

### Qué debe hacer
Recibe la estrategia de contenido del usuario, su concepto de marca (si existe), un resumen de sus ventas recientes y sus renders (videos generados/publicados con su metadata de TTChop). Debe usar un LLM para redactar un **reporte en markdown** que le diga al usuario, en el idioma pedido: qué está funcionando (qué tipo de contenido/producto/plantilla genera más GMV o revenue), qué no, y 2-4 recomendaciones concretas y accionables para su próxima tanda de videos. El endpoint es de **solo lectura/análisis** — nunca debe escribir nada en Firestore; el cliente es quien guarda el reporte devuelto en su historial.

### Request

```
POST {TTCHOP_SERVER_URL}/reports/generate
Content-Type: application/json
```

```ts
{
  strategy: string;          // texto libre de calendar_strategy — puede venir vacío si el usuario no lo ha llenado
  brandConcept: {            // de brand_concepts, o null si el usuario no tiene uno guardado
    description: string;
    niche: string;
    style: string;
  } | null;
  orders: {                  // resumen agregado de analytics_orders — NUNCA las filas crudas
    contentId: string;       // id del video/showcase de TikTok
    gmv: number;
    revenue: number;         // solo la parte de gmv ya "Settled"
    itemsSold: number;
    productId: string;
    productName: string;
    contentType: string;     // "Video" | "Showcase"
    orderType: string;       // "Shop ads order" | "Affiliate order"
    settled: boolean;
    orderDate: string | null; // ISO — si venían varias órdenes agrupadas bajo el mismo contentId, es la más reciente
  }[];
  renders: {                 // renders con su metadata de TTChop (plantilla, voz, idioma) — todos los del usuario, sin límite de fecha
    id: string;
    productId: string;
    productName: string;
    type: string;             // "ai" | "collage" | "overlay" | "collage+overlay"
    tiktokVideoId?: string;   // si el usuario ya publicó y vinculó este render, coincide con `orders[].contentId`
    scriptTemplateId?: string;
    voiceTemplateId?: string;
    aiTemplateId?: string;
    language?: string;
    createdAt: string;        // ISO
  }[];
  language: string;          // idioma en el que debe responder el reporte, ej. "English" | "Spanish (Mexico)" | "Japanese"
}
```

**Sobre el volumen de `orders`**: el cliente ya limita esto antes de enviarlo — solo manda órdenes de los últimos 90 días, y si aun así son muchas (más de 250 líneas), las agrupa por `contentId` sumando `gmv`/`revenue`/`itemsSold` antes de mandarlas. El servidor puede asumir que `orders` nunca va a traer miles de filas crudas por request.

### Response esperado (HTTP 200)

```ts
{
  report: string;   // el reporte completo en Markdown (encabezados, listas, negritas), en el idioma de `language`
}
```

El cliente renderiza este markdown con un parser mínimo propio (sin librería, sin `dangerouslySetInnerHTML`) que soporta encabezados, listas y **negritas** — evita sintaxis markdown más exótica (tablas, código, links) porque el cliente no la renderiza.

### Qué debe hacer el LLM al redactar el reporte
1. Cruzar `orders` (por `contentId`) con `renders` (por `tiktokVideoId`) para saber qué plantilla/voz/idioma/tipo de render generó cada resultado de ventas.
2. Identificar qué combinaciones (tipo de contenido, plantilla, producto, idioma) tienen mejor GMV/revenue por video, y cuáles tienen renders publicados sin ninguna venta asociada.
3. Si `brandConcept` viene con datos, usarlo como contexto de tono/estilo al redactar (no evaluar si el contenido "respeta la marca", solo usarlo como marco).
4. Si `strategy` viene con texto, comentar si las ventas recientes respaldan o contradicen esa estrategia.
5. Si `orders` viene vacío pero `renders` no, enfocar el reporte en actividad de creación (cadencia, variedad) en vez de ventas.
6. Cerrar con 2-4 recomendaciones concretas y accionables para la siguiente tanda de contenido.
7. Responder siempre en el idioma indicado por `language`, y devolver siempre `{ report: string }` — si la respuesta no tiene esa forma exacta, el cliente la descarta como "función no disponible" sin mostrar nada roto.

---

## Firestore: colección nueva `reports/{userId}/history/{reportId}`

No requiere cambios en `ttchop-server` — es leída/escrita directo por el cliente vía Firestore SDK — pero se documenta aquí para contexto:

```
reports/{userId}/history/{reportId}
  ├── generatedAt: string  // ISO timestamp
  └── report: string       // el markdown devuelto por /reports/generate
```

Reglas en `firestore.rules`: mismo patrón que `analytics_orders` (path-scoped por `userId`, sin chequear `resource.data.userId`).

---

## `POST /ai/meta` (análisis de clips) — FALTA EN EL SERVIDOR

### Estado actual
Este endpoint **no existe** en `ttchop-server` (devuelve 404). El análisis de clips sigue funcionando
porque el cliente lo dirige al flujo de n8n `https://flows.lemonsushi.com/webhook/ttchop_videoMetaExtractor`,
que es donde vivía originalmente.

Es la única llamada que no pasa por `ttchop-server`. La excepción está declarada en
`src/services/databaseService.ts`, en el set `N8N_ONLY_FLOWS` junto a `resolveWebhookUrl`.

### Por qué quedó así
Al eliminar los modos prod/test/server se mandaron todas las llamadas a `ttchop-server`, pero ese
servidor nunca implementó `/ai/meta`. El resultado fue que todos los clips subidos quedaban con
`metadataStatus: 'error'`. Se revirtió esa llamada a n8n como corrección.

### Qué debe hacer si se implementa
Recibe un clip ya subido a Storage y devuelve el análisis de su contenido, que la app guarda en
`SessionVideo.aiMetadata` y muestra en la tarjeta del clip.

Request:
```ts
{ sessionId: string; videoId: string; videoUrl: string; videoName: string; duration: number }
```
Response: JSON libre con el análisis (se guarda tal cual en `aiMetadata`).

Cuando exista, basta con quitar `'ttchop_videoMetaExtractor'` del set `N8N_ONLY_FLOWS` para que la
llamada vuelva a `ttchop-server` sin ningún otro cambio.
