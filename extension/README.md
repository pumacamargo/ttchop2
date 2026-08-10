# TTChop - Extensión de importación de productos

Extensión de Chrome (Manifest V3) que agrega un botón flotante "+ Agregar a TTChop"
en las páginas de producto de TikTok Shop. Al hacer clic, scrapea nombre, descripción
y hasta 3 fotos, y crea el producto directo en Firestore (mismo proyecto `ttchop` que
usa la webapp).

## Cómo instalarla (modo desarrollador, sin build)

1. Abrí `chrome://extensions` en Chrome (escritorio).
2. Activá "Modo de desarrollador" (arriba a la derecha).
3. Click en "Cargar descomprimida" y seleccioná esta carpeta (`extension/`).
4. El ícono de TTChop aparece en la barra de extensiones.

## Uso

1. Click en el ícono de la extensión → iniciá sesión con el mismo email/contraseña
   que usás en la webapp de TTChop.
2. Navegá a cualquier página de producto de TikTok Shop.
3. Cuando cargue el producto (fotos + descripción visibles), aparece el botón
   "+ Agregar a TTChop" abajo a la derecha.
4. Click → el producto se crea en tu librería. Abrí la webapp para agregarle los
   videos (b-rolls) como ya hacés normalmente.

## Notas / limitaciones conocidas

- Solo funciona en Chrome de escritorio — las extensiones no corren en Chrome Android/iOS.
- Si TikTok te pide un captcha, resolvelo vos mismo como usuario normal antes de
  hacer clic en "Agregar a TTChop" (es tu sesión real, no hay scraping headless).
- El detector de la descripción busca el label "Product description" en la página;
  si TikTok te muestra la UI en otro idioma puede no encontrarla (queda `description`
  vacío, pero el producto igual se crea con nombre y fotos).
- Máximo 3 fotos por producto, mismo límite que ya aplica la webapp.
