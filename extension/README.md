# TTChop2 — Extensión de Chrome

Extensión (Manifest V3, sin build step) que hace dos cosas distintas:

1. **Importar productos** desde páginas de producto de TikTok Shop — botón flotante
   "+ Agregar a TTChop" que scrapea nombre, descripción y hasta 3 fotos, y crea el producto
   directo en Firestore.
2. **Capturar estadísticas de videos** desde TikTok Studio — vistas, likes, comentarios,
   compartidos y fecha de publicación de cada video, guardados como una importación agrupada.

Escribe al proyecto Firebase **`ttchop2`** (el mismo que usa https://ttchop2.web.app). No toca
el proyecto `ttchop` original.

## Instalación (modo desarrollador)

1. Abrir `chrome://extensions` en Chrome de escritorio.
2. Activar "Modo de desarrollador" (arriba a la derecha).
3. "Cargar descomprimida" → seleccionar esta carpeta (`extension/`).
4. Click en el ícono → iniciar sesión con el mismo email y contraseña de la webapp.

Después de editar cualquier archivo de la extensión hay que darle **recargar** en
`chrome://extensions` y refrescar la pestaña de TikTok.

## Uso: importar un producto

1. Navegar a una página de producto de TikTok Shop.
2. Cuando cargue (fotos y descripción visibles), aparece el botón "+ Agregar a TTChop" abajo a
   la derecha.
3. Click → el producto se crea en tu librería, con `scrapedAt` marcando la fecha de captura.
   La webapp avisa cuando ese dato tiene más de 30 días.

## Uso: capturar estadísticas de TikTok Studio

1. Entrar a https://www.tiktok.com/tiktokstudio con la cuenta cuyos videos querés medir.
2. Ir a la lista de videos y **desplazarse hasta cargar todos** los que interesan — la extensión
   lee lo que la página pide, así que solo captura lo que efectivamente cargó.
3. En el panel flotante: elegir el contenedor destino y guardar.

Cada captura crea **una importación** agrupada, no documentos sueltos. Desde
Analytics → Manage Imports se puede reasignar esa importación a otro contenedor o borrarla
completa, en una sola operación.

El contenedor se elige en el panel: "general" (compartido) o una cuenta de TikTok conectada. No
se pide nombre de usuario — los datos de TikTok Studio no lo incluyen, así que agrupar por
usuario sería adivinar.

## Cómo funciona por dentro

| Archivo | Rol |
|---|---|
| `content.js` | Botón de importar producto. Corre en `*.tiktok.com` **excepto** `/tiktokstudio/*` |
| `studio-interceptor.js` | Corre en `world: "MAIN"`, parcha `fetch`/`XHR` para leer las respuestas de la API interna de Studio |
| `studio-content.js` | Panel flotante y selector de contenedor en Studio |
| `background.js` | Service worker: escribe a Firestore vía REST, crea el registro de `imports` |
| `popup.js` / `popup.html` | Login |
| `firebase-config.js` | Configuración del proyecto `ttchop2` |

**Por qué un interceptor y no un scraper**: las peticiones de TikTok van firmadas con `msToken`,
`X-Bogus` y `X-Gnarly`, firmas que no se pueden generar fuera del navegador. Leer las respuestas
que la página ya está pidiendo evita el problema por completo.

El interceptor **siempre llama a la función original primero, lee únicamente `.clone()` de la
respuesta, y devuelve la promesa intacta**. Cualquier desviación de eso rompe TikTok Studio, que
es la página que estamos interceptando.

## Limitaciones conocidas

- Solo Chrome de escritorio: las extensiones no corren en Chrome Android/iOS.
- Si TikTok muestra un captcha, hay que resolverlo como usuario normal antes de usar la
  extensión. Es tu sesión real, no hay scraping headless.
- El detector de la descripción del producto busca el label "Product description"; si TikTok te
  muestra la UI en otro idioma puede no encontrarlo (el producto igual se crea, con la
  descripción vacía).
- Máximo 3 fotos por producto, el mismo límite de la webapp.
- En Studio solo se captura lo que la página cargó: sin scroll no hay datos.
