# AI Video Studio — Plan de fases (evolución de ttchop)

> Este archivo se mantiene actualizado en cada sesión de trabajo. Si una sesión de Claude Code se cierra, la siguiente debe leer esto primero para saber en qué quedó todo.

## Contexto

El usuario quiere transformar `ttchop` (hoy un MVP con casi todo mockeado) en una plataforma real de producción de video para TikTok Shop, operable desde el celular.

**Estructura actual (5 secciones, cambiada el 2026-07-26 — ver sección de esa fecha más abajo para el detalle):** Products, Recordings, Templates, Projects, Renders.

- **Recordings** (antes videos vivían dentro de Productos): colección propia `sessions/{id}`, cada Sesión tiene su propia librería de clips y puede vincularse a cero, uno o varios productos (link muchos-a-muchos, no ownership — borrar un producto nunca borra una sesión, solo remueve el link).
- **Projects** (antes "Videos") tiene dos caminos: **Video AI** (genera un clip nuevo con IA a partir de imágenes de referencia + modelos como Veo3/Seedance) y **Edit** (toma clips —de Sesiones vinculadas al producto elegido— + script + audio + overlays, en un timeline editable, y termina en un render).
- Overlays (texto animado, gráficos, precio) solo aplican en Edit, nunca en Video AI puro.
- Cada clip guarda un trim *default* (a nivel de sesión). Cada uso dentro de una edición copia ese trim al agregarse y queda desacoplado — cambios futuros al default NO tocan ediciones ya creadas (patrón "copiar y desacoplar", no referencia en vivo).
- Videos de ejemplo de otras personas (referencia/inspiración): pospuesto explícitamente, no es parte del alcance actual.
- **Idioma default: inglés** (cambiado el 2026-07-25, ver abajo). Español/japonés se agregan después, con infraestructura de i18n real — todavía no armada, por ahora es reemplazo directo de texto.
- **Decisión pospuesta explícitamente por el usuario**: si los Workers/render corren sobre su VPS+n8n actual o algo gestionado (Cloud Functions/Cloud Run). El usuario ya tiene VPS+n8n funcionando y desconfía de promesas de "en Firebase es más fácil" — no forzar esa migración, seguir usando n8n mientras no se decida lo contrario.

**Piezas reales ya existentes y reutilizables (no es un rewrite desde cero):**
- `AuthView.tsx` + `AuthContext.tsx`: auth real con Firebase, funcional.
- `databaseService.ts` → `generatePromptFromWebhook()` y `createMasterVideoFromWebhook()`: ya llaman webhooks reales de n8n (`n8n.lemonsushi.com/webhook/ttchop_videoSeedance` y `.../ttchop_videoVeo3`) con toggle TEST/PROD. Esto ES el flujo de "Video AI" — el resultado hoy se avisa por Telegram y no se guarda en Firestore ni se agrega a ninguna sesión (eso es justo lo que falta, ver Fase 2 — ojo que Fase 2 fue escrita antes de la migración a Sessions, hay que adaptarla).
- `VariationsMatrixView.tsx` + `runSimulatedRenderPipeline()`: embrión de "Edit", combina clips sueltos tomados de las Sesiones vinculadas al producto (no un timeline real) y el render está simulado con `sleep()`.
- Pipeline externo `cacho_inmotion` (repo separado, Remotion + overlays + FTP) ya hace el trabajo de "Overlay Worker + Render Worker", aunque hoy se dispara a mano vía Telegram/n8n en vez de automático desde la app.
- Extensión de Chrome (`extension/`) para importar productos desde TikTok Shop — ver sección propia más abajo.

---

## Estado actual (última actualización: 2026-07-26)

### ✅ Fase 1 — Reestructurar navegación y datos: COMPLETA, deployada

- `App.tsx`: 3 tabs (`products`, `templates`, `videos`), con `videos` conteniendo sub-nav local (`videosSubTab`) entre "Video AI" (`MasterCreatorView`) y "Edición" (`VariationsMatrixView`).
- `databaseService.ts`: `Product.bRolls` → `Product.videos: ProductVideo[]` (con `section`, `source: 'recorded'|'ai_generated'`, `trimStart`, `trimEnd`). `Template` ahora tiene `type: 'script'|'voice'|'ai_prompt'` + `voiceId` opcional.
- `TemplatesView.tsx`/`TemplateDetailModal.tsx`: sub-tabs por tipo, formulario específico por tipo (voiceId solo en `voice`).
- `ProductsView.tsx`/`ProductDetailModal.tsx`: UI de videos por sección con inputs de trim (`trimStart`/`trimEnd`) por clip.
- **Deploy**: `https://ttchop.web.app` (proyecto Firebase `ttchop`, ya autenticado vía `firebase` CLI global en este VPS). Deploy con `npm run build && firebase deploy --only hosting`.

### 🐛 Bug encontrado y corregido: migración de datos ya existentes en Firestore

Renombrar campos en la interfaz TypeScript **no migra los documentos ya guardados en producción**. Esto rompió la app en vivo (`Cannot read properties of undefined reading 'length'`) porque el usuario ya tenía productos reales con el campo viejo `bRolls`.

**Fix aplicado**: `normalizeProduct()` y `normalizeTemplate()` en `databaseService.ts` (llamadas desde `getProducts()`/`getTemplates()`) — detectan el shape viejo y lo migran al leer:
- Producto sin `videos` pero con `bRolls` → mapea a `videos[]` con defaults (`section: 'General'`, `source: 'recorded'`, `trimStart: 0`, `trimEnd: duration`).
- Template sin `type` → asume `type: 'script'` (único tipo que existía antes).

**Regla para el futuro**: cualquier rename/restructure de un campo en una colección con datos reales de producción necesita una función de normalización equivalente ANTES de deployar. No basta con cambiar el tipo de TypeScript.

**Estado de los datos verificado directamente en Firestore (solo lectura, vía REST API con el token del `firebase` CLI) el 2026-07-24:**
- `products`: 2 documentos — son los productos de **demo/seed** por default ("Suplemento Focus Alpha", "Auriculares Peak Sound ANC"), no reales. El usuario ya borró sus productos reales. **Pendiente de decidir**: ¿borrar también estos 2 de demo? (no se hizo porque es una acción destructiva que requiere confirmación explícita).
- `templates`: 5 documentos, todos sin `type` (ahora normalizados a `'script'` al leer) — 3 son reales del usuario ("SPOUSE DISCOUNT REGRET UGC", "Template Example", "TIKTOK SHOP PRICE GLITCH UGC"), 2 son seed.
- `master_videos` y `video_variations`: vacíos, limpio.

### ✅ Importar productos desde TikTok Shop — extensión de Chrome (armada, falta probar por el usuario)

**Decisión de arquitectura (cambio de rumbo respecto a lo pospuesto en "Fuera de alcance")**: se evaluaron 3 approaches para traer datos+fotos de un producto de TikTok Shop dado su link:
1. Browser remoto (Playwright headless en el VPS) con live view por CDP para resolver el captcha a control remoto desde el celular — descartado. El VPS no tiene GUI (no es problema per se, CDP screencast funciona headless), pero el verdadero riesgo es el fingerprint de bot (IP de datacenter, `navigator.webdriver`, etc.) que TikTok puede detectar aparte del captcha, sin garantía de que el approach funcione de forma estable.
2. Bookmarklet — mobile-friendly pero UX rara.
3. **Extensión de Chrome (elegida)**: corre en el navegador real del usuario (fingerprint real, IP residencial real), el captcha —si aparece— lo resuelve el usuario como persona normal navegando, sin relay de nada. Mucho más simple y confiable. **Trade-off aceptado**: solo funciona en Chrome de escritorio (las extensiones no corren en Chrome Android/iOS), así que importar productos por este camino es una tarea de escritorio, no de celular.

**Implementación** (`extension/`, Manifest V3, sin build step — JS plano cargable como "extensión descomprimida"):
- `background.js`: login contra Firebase Auth vía REST (`identitytoolkit`/`securetoken` googleapis, mismo proyecto `ttchop`), guarda el token en `chrome.storage.local`, refresca el `idToken` cuando expira, y escribe el producto directo a Firestore vía REST API (respeta las mismas reglas de seguridad `userId`-scoped que ya existen).
- `popup.html`/`popup.js`: formulario de login/logout.
- `content.js`: se inyecta en `*.tiktok.com`, detecta cuándo la página de producto cargó (busca `h1` + label "Product description"), agrega un botón flotante "+ Agregar a TTChop". Al click, scrapea `name` (del `h1`), `description` (bloque siguiente al label "Product description") y hasta 3 fotos (`img[alt === name]`, deduplicadas), y llama a `background.js` para crear el producto.
- El producto se crea con `videos: []` — los b-rolls se siguen agregando manualmente en la webapp como hoy.

**Selectores verificados en vivo** contra una página real de producto (`p16-oec-*.ibyteimg.com` para imágenes, label "Product description" en inglés aunque el contenido esté en japonés). **Limitación conocida**: el detector de descripción solo busca el label en inglés/español/japonés (`DESCRIPTION_LABELS` en `content.js`); si TikTok muestra la UI en otro idioma, el producto se crea igual pero sin descripción.

**✅ Probada por el usuario y funcionando**: cargada como "extensión descomprimida" en `chrome://extensions`, importó productos reales (Japón y México) con fotos, descripción completa (todo el texto de la página, no solo la descripción del producto) y detección automática de región (`jp`/`mx`, extraída de la URL canónica `shop.tiktok.com/{region}/pdp/{id}`). Tiene deduplicación por `sourceId` (re-scrapear el mismo producto actualiza en vez de duplicar).

### ✅ Sessions (Recordings) + nav de 4 tabs + inglés por default — COMPLETA (2026-07-25)

**Motivación**: el usuario quiso sacar los videos de adentro de Productos y darles su propia sección ("Recordings"), con clips organizados en Sesiones que opcionalmente se vinculan a uno o más productos (no ownership). De paso: renombrar el tab "Videos" a "Projects", agregar el 4to tab, y cambiar toda la UI a inglés (español/japonés quedan para después).

**Modelo de datos nuevo** (`databaseService.ts`): colección `sessions/{id}` — `{ id, userId, name, productIds: string[], videos: SessionVideo[], createdAt }`. `SessionVideo` es básicamente el viejo `ProductVideo` (id, name, downloadUrl, duration, section, source, trimStart, trimEnd, createdAt) pero ahora vive en la sesión, no en el producto.

**Componentes nuevos**: `SessionsView.tsx` (lista + crear sesión + checklist de productos a vincular) y `SessionDetailModal.tsx` (vincular/desvincular productos, dropzone de subida de video a Firebase Storage con `uploadSessionVideoFile`, clips agrupados por `section`).

**`ProductDetailModal.tsx` simplificado**: ya no gestiona videos (se movió todo a Sessions) — solo queda header/título (clamp 50 + modal), fotos (thumbnails + lightbox), descripción (clamp + modal) y borrar producto. `ProductsView.tsx` perdió el formulario manual de "Agregar" (los productos solo entran por la extensión de Chrome) y el badge de conteo de videos.

**`VariationsMatrixView.tsx` (Edit) rewireado**: ya no lee `product.videos` (ese campo queda legacy/vacío para productos nuevos) — cuando se elige un producto, hace `db.getSessionsForProduct(productId)` y junta (`flatMap`) los clips de todas las sesiones vinculadas. `runSimulatedRenderPipeline()` en `databaseService.ts` también se cambió para resolver la URL final del clip buscando en sesiones en vez de en productos.

**Cascada al borrar un producto**: `deleteProduct()` ahora busca sesiones con ese `productId` en su `productIds` (query `array-contains`) y les hace `arrayRemove` — la sesión sobrevive, solo pierde el link. Verificado en vivo (se borró y recreó el producto Tabwee sin perder la sesión de prueba).

**Nav** (`App.tsx` + `.sticky-nav` en `index.css`): `ActiveTab` ahora es `'products' | 'sessions' | 'templates' | 'projects'`, grid de 4 columnas. El sub-nav interno de Projects pasó de "Video AI / Edición" a "Video AI / Edit".

**Storage**: Cloud Storage no estaba habilitado en el proyecto Firebase (`ttchop` estaba en plan Spark, gratis) — se subió a plan **Blaze** y se activó Storage desde la consola, con `storage.rules` nuevas (mismo patrón `userId`-scoped que Firestore, path `users/{uid}/...`) desplegadas vía `firebase deploy --only storage`. El pipeline de subida real (`uploadBytes` + `getDownloadURL`, que genera un link directo con token, apto para que n8n lo descargue sin auth) se armó primero para productos y se reusó para sesiones bajo `users/{uid}/sessions/{sessionId}/videos/...`. Se le agregó un timeout de 8s a `getVideoDuration()` (podía colgarse indefinidamente con archivos de video corruptos/no decodificables).

**Traducción a inglés**: barrido completo de todos los componentes (`App.tsx`, `ProductsView.tsx`, `ProductDetailModal.tsx`, `TemplatesView.tsx`, `TemplateDetailModal.tsx`, `MasterCreatorView.tsx`, `VariationsMatrixView.tsx`, `SequencePlayer.tsx`, `AuthView.tsx`) y de los mensajes de error/progreso en `databaseService.ts`, incluyendo el contenido de `SEED_TEMPLATES` y `REGION_LABELS`. Sin librería de i18n todavía — reemplazo directo de strings.

**⏳ Pendiente de decidir**: los 2 templates de demo/seed que ya estaban guardados en Firestore de antes ("Tutorial 3 Pasos Sencillos", etc.) siguen en español, porque traducir `SEED_TEMPLATES` en el código solo afecta a cuentas nuevas, no a documentos ya escritos. Preguntado al usuario si borrarlos o traducirlos a mano — sin respuesta aún al cierre de esta sesión.

**Riesgo conocido, no arreglado**: al probar el flujo de creación de sesión con clicks automatizados encontré que **borré por error el producto real "Tabwee Android 16" del usuario** mientras probaba el comportamiento de desvinculación — el usuario lo tuvo que re-scrapear con la extensión. Confirmado con el usuario que ya está recuperado, pero es una lección para no volver a probar `deleteProduct` contra datos reales sin aislar mejor las pruebas.

### ✅ Sesión 2026-07-27 — Collage pipeline ffmpeg + Renders integración + fixes menores

#### Pipeline de producción de Collage (ffmpeg)

Arquitectura definida y construida en dos pasos:

1. **Agente AI en n8n** genera un `ffmpegRecipe` JSON con: `meta` (outputPath, fps, width, height), `audio` (src local), `clips[]` (role, clipId, src, trimStart, trimEnd, speed, firebaseUrl). El agente decide cuáles clips usar, en qué orden y qué segmento de cada uno.
2. **`/root/media/scripts/collage_builder.py`** (Python 3 + ffmpeg) lee ese JSON, descarga cada clip desde `firebaseUrl` si no existe localmente, trimea exactamente de `trimStart` a `trimEnd`, aplica `speed` si ≠ 1, escala a 1080×1920, concatena todos los clips en orden y mezcla el audio. Acepta el JSON completo del validador (array con `ffmpegRecipe` anidado) o directo el objeto receta. Logs en `/home/node/.n8n-files/logs/collage_builder.log`.

**Cómo llamarlo desde n8n (Execute Command):**
```bash
python3 /media/scripts/collage_builder.py '{{ JSON.stringify($json) }}'
```

**Nota sobre Remotion**: se evaluó usar Remotion (ya existe el repo `cacho_inmotion` con overlays animados en JSX). Decisión: Remotion es para animaciones React (textos animados, gráficas, overlays). Para concatenar clips + audio, ffmpeg es más rápido y simple. Los dos son complementarios: ffmpeg para el video base, Remotion encima si se necesitan overlays animados.

#### Renders — integración del Collage

- `databaseService.ts` → `generateCollageVideo()`: ahora crea el doc `renders/{renderId}` en Firestore con `status: 'pending'` **antes** de mandar el webhook (el render aparece en el tab inmediatamente). El `renderId` se incluye en el payload para que n8n lo use al actualizar el doc cuando termina. Retorno cambiado de `void` a `string` (el renderId).
- `RendersView.tsx` → `isStorageUrl()`: ampliado para también aceptar `lemonsushi.com` como URL permanente (no intenta archivarla via fetch — causaba error CORS porque el servidor no tiene el header `Access-Control-Allow-Origin`). Videos de Kie.ai (temporales) sí se archivan; videos servidos desde `lemonsushi.com` se muestran directamente.
- El auto-polling de 5s ya existente en `RendersView` detecta el render pendiente y actualiza la UI cuando n8n lo marca como `done`.

**Lo que n8n debe hacer al terminar el collage:**
Actualizar `renders/{renderId}` en Firestore con `{ status: "done", videoUrl: "<url>", updatedAt: "..." }`.

#### Fixes menores (2026-07-27)

- **Nav bottom**: tab "Projects" renombrado a "Create".
- **Logout bug**: `handleLogout` en `App.tsx` usaba `catch` para resetear `isLoggingOut` pero no `finally` — si el logout era exitoso, el estado quedaba en `true` y al volver a logearse el botón seguía mostrando "Logging out...". Fix: usar `finally`.

### ✅ Fase 3 (parcial) — Renders tab + Kie.ai callback flow + Collage rewrite — COMPLETA (2026-07-26)

#### Renders tab (5ª sección)

- Nueva colección Firestore `renders/{taskId}` con campos: `id, userId, type ('ai'|'collage'), status ('pending'|'processing'|'done'|'failed'), productId, productName, videoUrl?, thumbnailUrl?, errorMessage?, createdAt, updatedAt`.
- `databaseService.ts`: `Render` interface + `getRenders()`, `createRender(data, customId?)`, `updateRender()`, `deleteRender()`. `customId` permite usar el taskId de Kie.ai como document ID.
- `RendersView.tsx`: nuevo componente con filtros (All/Video AI/Collage), badge de estado, video player cuando `status: done`, confirmación de borrado. **Auto-polling cada 5s** mientras haya renders en `pending`/`processing`.
- `App.tsx`: `ActiveTab` ahora es `'products'|'sessions'|'templates'|'projects'|'renders'`. Nav grid cambiado a `repeat(5, 1fr)`. Icono `Film` para Renders.
- `firestore.rules`: regla `renders/{document=**}` añadida — create/read/delete scoped a `userId`, update permitida a cualquier usuario autenticado (n8n necesita actualizarlo con OAuth2).

#### Video AI — ciclo cerrado con Kie.ai callback

- **Webhook cambiado**: de `n8n.lemonsushi.com/webhook/ttchop_videoSeedance|Veo3` a `flows.lemonsushi.com/webhook[-test]/ttchop_aiGen_videoGen`. El `videoProvider` (Seedance/Veo3) ahora va en el payload, no en la URL.
- `createMasterVideoFromWebhook` ahora retorna `string` (taskId) en vez de `MasterVideo`. Parsea `data[0].data.taskId` de la respuesta del webhook y crea `renders/{taskId}` con `status: 'pending'`.
- `MasterCreatorView.tsx`: banner verde sticky al hacer submit exitoso con el taskId y botón "Go to Renders". Error detallado en el alert si falla. Prop `onGoToRenders` callback para navegar al tab.
- **Flujo n8n completo** (configurado y verificado):
  1. Webhook callback de Kie.ai llega con `body.data.taskId` + `body.data.resultJson` (Seedance) o `body.data.info.resultUrls` (Veo3).
  2. Code node JS parsea ambos formatos: `if (data.resultJson) { JSON.parse(data.resultJson).resultUrls[0] } else { data.info.resultUrls[0] }`.
  3. Google Cloud Firestore node ("Create or Update"): Collection `renders`, **Update Key = `taskId` (Fixed, no Expression)**, Columns `status, videoUrl, updatedAt`. IMPORTANTE: el Update Key es el nombre del campo en el JSON de entrada, NO una expresión con el valor.
  4. Credencial: "Google Firebase Cloud Firestore OAuth2 API" con Client ID/Secret del proyecto `ttchop`, autenticada vía "Sign in with Google" en n8n. Tester añadido en Google Cloud Console → OAuth consent screen.

#### Collage — reescrito como flujo en dos secciones (2026-07-26)

- `VariationsMatrixView.tsx` reescrito completamente. Stage machine: `'setup' | 'generating_dialogue' | 'review' | 'generating_collage' | 'done'`.
- **Sección 1 (Setup)**: Producto → Sesiones (multi-select) → Collage Template → Language → botón "Generate Dialogue".
- **Sección 2 (Dialogue & Collage)**: textarea editable con el diálogo generado → Voice selector → botón "Generate Collage".
- Webhook diálogo: `flows.lemonsushi.com/webhook[-test]/ttchop_collage_dialogue`. Payload: `{ product, collageTemplate, language }`. Respuesta: `[{ "output": "..." }]`.
- Auto-detect idioma por región del producto: `jp → Japanese`, `mx → Spanish (Mexico)`. El usuario puede sobreescribir.
- Voice Announcer como default al cargar. Voice selector movido a Sección 2.
- Tab renombrado de "Edit" a "Collage".

#### Otros cambios (2026-07-26)

- `SessionDetailModal.tsx`: confirmación de dos pasos para borrar un video (× → aparece "Confirm Delete" + "Cancel" inline, sin modal).
- Webhook "Generate Prompt" (Video AI): `flows.lemonsushi.com/webhook[-test]/ttchop_aiGen_prompt`. Payload: `{ productDescription, aiTemplate, language, extraNotes }`. Respuesta: `[{ "output": "..." }]`.

### ⏳ Fase 2 — Video AI: conectar el flujo existente y cerrar el ciclo (PENDIENTE, ajustar a Sessions)

**Objetivo**: que el flujo que ya llama a Seedance/Veo3 (`MasterCreatorView.tsx` + `createMasterVideoFromWebhook`) termine agregando el clip resultante a una sesión (`source: 'ai_generated'`) en vez de solo avisar por Telegram. **Nota**: este plan se escribió antes de la migración a Sessions (2026-07-25) — donde decía "agregar a `product.videos[]`" ahora debería ser "crear o elegir una sesión vinculada al producto y agregarle el clip a `session.videos[]`". Definir con el usuario si se crea una sesión nueva automáticamente por cada generación de IA, o se elige una existente.

Pasos:
1. Adaptar `MasterCreatorView.tsx` para usar templates `type: 'ai_prompt'` (hoy usa cualquier template genérico).
2. Crear doc `video_ai_jobs/{jobId}` en Firestore antes de llamar al webhook (status `pending`).
3. **Dependencia cruzada, fuera de este repo**: el workflow de n8n debe hacer un update a ese doc cuando Seedance/Veo3 termine — coordinar con el usuario, no es código de `ttchop`.
4. Polling (mismo patrón ya usado en `VariationsMatrixView`, `setInterval` 1s) que al completarse agregue el video nuevo a la sesión correspondiente (`updateSession`, no `updateProduct`).

### ⏳ Fase 4 — Editor de video online (POSPUESTO, decisión 2026-07-26)

**Decisión del usuario**: Projects queda dividido en **Video AI** y **Collage** como estructura definitiva por ahora. El editor de video online (timeline real) es una fase futura, no inmediata.

Cuando se retome:
- Nueva colección `edits/{id}`: `{ productId, templateId (script), timeline: [{clipId, order, trimStart, trimEnd}], audioUrl, sfxUrls, status, renderUrl }`. El trim aquí es **por-instancia**, copiado del default del clip al agregarse (no referencia en vivo).
- Agregar `@remotion/player` + composición `src/remotion/EditPreview.tsx` para preview interactivo en el navegador.
- Nuevo componente `EditorView.tsx`: lista de escenas reordenable + trim por escena, botón Preview vs botón Render.
- Render final: vía webhook de n8n, mismo patrón de job doc que el flujo de Renders actual.
- Se agregaría como 3er sub-tab en Projects: Video AI | Collage | Editor.

---

## Fuera de alcance (pospuesto explícitamente por el usuario)

- Videos de ejemplo de otras personas como referencia/inspiración.
- Vision Worker (auto-tagging de clips).
- Browser remoto (Playwright + live view por CDP) para resolver CAPTCHAs a control remoto — se evaluó y se descartó a favor de la extensión de Chrome (ver sección arriba).
- i18n, analytics, aprendizaje automático sobre métricas de TikTok Shop.
- Decisión de infraestructura (VPS+n8n actual vs. servicios gestionados) para los Workers.

## Cómo desplegar

```bash
npm run build
firebase deploy --only hosting
firebase deploy --only firestore:rules
firebase deploy --only storage
```

Proyecto Firebase: `ttchop` (ya en `.firebaserc`). CLI autenticado como `puma.camargo@gmail.com` — tanto en el VPS como, desde el 2026-07-25, en la máquina Windows local del usuario (`firebase-tools` instalado global vía npm, login interactivo hecho por el usuario).

## Recordatorios de proceso (pedidos explícitos del usuario)

- No hacer `git commit`/`push` sin que el usuario lo pida explícitamente (excepto este guardado, que sí se pidió).
