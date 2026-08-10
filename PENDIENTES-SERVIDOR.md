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
