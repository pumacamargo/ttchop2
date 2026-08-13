# TTChop2

Webapp móvil-first para vendedores de TikTok Shop: gestiona productos y clips, genera videos de
marketing con IA, los agenda, y cruza las ventas reales de la tienda contra los videos publicados
para saber qué está funcionando.

**Producción:** https://ttchop2.web.app

> TTChop2 es un fork independiente de `ttchop`, con su propio proyecto de Firebase. Los dos
> comparten el `ttchop-server`, que decide a qué proyecto escribir según el `projectId` que
> recibe en cada llamada.

## Secciones

| Sección | Qué hace |
|---|---|
| **Dashboard** | KPIs de ventas del período (GMV, comisión, % de comisión, unidades, órdenes, vistas), tendencia período a período y desempeño diario |
| **Products** | Librería de productos con pestañas de Info, Clips y Renders |
| **Templates** | Plantillas de guion, voz y prompt de IA |
| **Create Video** | Generación de video: guion → voz → render |
| **Calendario** | Agenda de publicaciones, con estrategia en texto y propuesta automática |
| **Analytics** | Importación de los reportes `.xlsx` de TikTok Shop, cruzados con los renders |
| **Brand Concept** | Moodboard, paleta, tipografías y descripción del canal |
| **Reports** | Reportes generados por LLM sobre qué está funcionando |
| **Video Editor / Tools** | Placeholders, pendientes |

Además: cuentas múltiples de TikTok (contenedores de datos separados), páginas públicas de
producto en `/p/:id`, y páginas legales en `/terms` y `/privacy`.

## Requisitos

- Node 20+
- CLI de Firebase autenticada con acceso al proyecto `ttchop2`

## Setup

```bash
npm install
cp .env.example .env         # completar con las credenciales del proyecto ttchop2
npm run dev                  # http://localhost:5173
```

`.env` necesita las variables de Firebase, todas con prefijo `VITE_` (está en
`.gitignore`; no commitear valores reales):

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

## Comandos

```bash
npm run dev       # dev server con HMR
npm run build     # type check (tsc -b) + bundle
npm run lint      # eslint
npm run preview   # sirve el build de producción localmente
```

## Deploy

```bash
npm run build
firebase deploy --only hosting --project ttchop2
firebase deploy --only functions --project ttchop2   # solo si cambiaron las Cloud Functions
```

Después de un deploy hace falta forzar recarga en el navegador (Ctrl+Shift+R): `index.html` se
sirve sin caché, pero la pestaña abierta puede seguir con el bundle anterior.

## Extensión de Chrome

En `extension/` hay una extensión MV3 (sin build) que importa productos desde TikTok Shop y
captura las estadísticas de los videos desde TikTok Studio. Instalación y uso en
[`extension/README.md`](extension/README.md).

## Documentación

- [`CLAUDE.md`](CLAUDE.md) — arquitectura, esquema de datos y trampas conocidas
- [`PLAN.md`](PLAN.md) — estado por fase y pendientes
- [`PENDIENTES-SERVIDOR.md`](PENDIENTES-SERVIDOR.md) — lo que la webapp ya llama y `ttchop-server`
  todavía no implementa
