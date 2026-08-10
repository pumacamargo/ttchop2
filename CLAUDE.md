# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **In active migration** toward "AI Video Studio" (Productos / Templates / Videos, with Video AI + real timeline editing). See `PLAN.md` at repo root for the full phased plan, current progress, and known pending items before touching product/template/editing code.

## Project Overview

**TTChop** is an AI-powered UGC (User-Generated Content) video creation platform that helps brands generate master marketing videos and create multiple variations by combining different B-roll sequences. Key features:
- AI-powered script generation (Gemini API)
- Text-to-speech voiceovers (ElevenLabs API)
- Product library management with technical specifications
- Video template system with marketing psychology guidelines
- Duplicate video combination prevention for algorithmic safety
- **Status**: MVP with mocked AI/video rendering

## Technology Stack

- **Frontend**: React 19 + TypeScript 6 + Vite 8
- **Database**: Firebase (Authentication, Firestore, Cloud Storage)
- **UI**: lucide-react for icons, CSS3 with dark theme
- **Build**: Vite with @vitejs/plugin-react (Oxc-based)
- **Linting**: ESLint 10.3 + typescript-eslint

## Common Development Commands

```bash
npm run dev       # Start dev server (localhost:5173) with HMR
npm run build     # Type-check (tsc) then bundle with Vite
npm run lint      # Run ESLint (no auto-fix)
npm run preview   # Preview production build locally
```

**Notes on build pipeline**: The build runs `tsc -b` first for type checking, then `vite build` for bundling. Vite automatically handles code splitting, minification, and tree-shaking.

## Code Architecture

### Simplified Responsive Layout

The app uses a single-column responsive layout for consistency across all screen sizes:
- **Main Container**: Full-width centered panel with tab navigation and views
- **Consistent UX**: Same layout on desktop and mobile for predictable user experience
- **Modal Overlays**: Product details, templates, and video creators show as inline panels (not overlays)

Implemented in `App.tsx` with responsive CSS using Flexbox. All views adapt to screen size using media queries.

### Tab Navigation

> **Migration in progress**: see `PLAN.md` at repo root for the full "AI Video Studio" phased plan. Fase 1 (this section) is done and deployed to `https://ttchop.web.app`; Fase 2/3 are pending.

Three main tabs controlled by state in `App.tsx` (`ActiveTab = 'products' | 'templates' | 'videos'`):
1. **Productos**: `ProductsView.tsx` / `ProductDetailModal.tsx` - Manage products with model sheets and a `videos[]` library organized by section
2. **Templates**: `TemplatesView.tsx` / `TemplateDetailModal.tsx` - 3 sub-tabs by `type`: script, voice, ai_prompt
3. **Videos**: contains a sub-nav (local state `videosSubTab`) between:
   - **Video AI** (`MasterCreatorView.tsx`) - generates a clip via Seedance/Veo3 webhooks (n8n)
   - **Edición** (`VariationsMatrixView.tsx`) - combines clips into a video (currently still the legacy B-Roll-combination flow; will become a real timeline editor in Fase 3)

### Data Flow Architecture

**Core data models in Firestore:**
- `products/{id}`: Product metadata, 3 model sheet images, `videos[]` clip library (recorded or ai_generated, organized by `section`)
- `templates/{id}`: discriminated by `type` (`script` | `voice` | `ai_prompt`)
- `master_videos/{id}`: AI-generated base videos (script + audio) with deduplication tracking
- `video_variations/{id}`: Individual video outputs combining audio + specific clip sequences (will be replaced by `edits/{id}` in Fase 3)

**Key architectural pattern**: No global state management (Redux/Context). Uses:
- Singleton `databaseService.ts` instance for CRUD operations
- Component-level React hooks (`useState`, `useEffect`)
- Polling mechanism in `VariationsMatrixView.tsx` (1s interval) to check Firestore for async job completion
- Deduplication via `usedCombinations` array in master video documents (prevents duplicate clip combinations)

**Legacy data normalization (important)**: documents created before the Fase 1 migration still have the old field names (`bRolls` instead of `videos`, no `type` on templates). `getProducts()`/`getTemplates()` run every doc through `normalizeProduct()`/`normalizeTemplate()` (top of `databaseService.ts`) to backfill the new shape on read. **Any future field rename/restructure on a collection with real production data must add an equivalent normalization function** — renaming the TypeScript interface alone does not migrate already-stored Firestore documents, and this exact class of bug already broke production once (see `PLAN.md`).

### Database Schema

**Firestore Collections:**
```
products/{id}
  ├── userId: string
  ├── name, description: string
  ├── modelSheetUrls: string[] (Cloud Storage URLs, max 3)
  ├── videos: {id, name, downloadUrl, duration, section, source: 'recorded'|'ai_generated',
  │            trimStart, trimEnd, storagePath?, createdAt}[]
  └── createdAt: ISO timestamp

templates/{id}
  ├── userId, title, description: string
  ├── type: 'script' | 'voice' | 'ai_prompt'
  ├── referenceVideoUrl?: string (style reference, mainly for ai_prompt)
  ├── voiceId?: string (ElevenLabs voice ID, only for type 'voice')
  └── createdAt: ISO timestamp

master_videos/{id}
  ├── userId, productId, templateId: string
  ├── scriptText: string (from Gemini)
  ├── audioUrl: string (from ElevenLabs)
  ├── usedCombinations: string[] (dedup tracking: ["broll_1->broll_3->broll_2"])
  ├── variationsCount: number
  └── createdAt: ISO timestamp

video_variations/{id}
  ├── masterVideoId, userId, productId: string
  ├── bRollCombination: string[] (clip IDs)
  ├── combinationKey: string (dedup hash)
  ├── status: 'pending' | 'rendering' | 'completed' | 'failed'
  ├── videoUrl: string | null
  └── createdAt, updatedAt: ISO timestamp
```

**Cloud Storage**: `gs://project-bucket/users/{userId}/products/{productId}/model_sheets/` and clip videos.

## File Structure

```
src/
├── components/          # React view components
│   ├── ProductsView.tsx (list and add products)
│   ├── ProductDetailModal.tsx (view/edit/delete product details)
│   ├── TemplatesView.tsx
│   ├── MasterCreatorView.tsx
│   ├── VariationsMatrixView.tsx
│   └── SequencePlayer.tsx (video player with audio sync)
├── services/
│   └── databaseService.ts (singleton with Firestore CRUD + AI integration)
├── config/
│   └── firebase.ts (Firebase SDK initialization)
├── App.tsx (main layout and tab routing)
├── App.css
├── index.css (global styles, CSS variables)
├── main.tsx (React entry point)
└── firestore.rules (security rules for Firestore)
```

## Key Implementation Details

### Product Management (CRUD Operations)

`ProductDetailModal.tsx` provides inline editing interface for products:
- **View**: Click any product card to see full details (name, description, model sheets, B-rolls)
- **Edit**: Toggle edit mode to update product information
- **Delete**: Remove products with confirmation dialog
- Data changes immediately persist to Firestore via `updateProduct()` and `deleteProduct()` methods

### Firestore Security Rules

`firestore.rules` enforces user-scoped data isolation:
```firestore
match /products/{document=**} {
  allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
  allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
}
```
Applies same pattern to templates, master_videos, and video_variations. All queries are scoped by `userId` for security.

### Performance Optimization: Seeding Cache

`seedUserDatabase()` in databaseService uses localStorage to avoid repeated Firestore queries:
- First load: Checks Firestore if user has existing products, creates seed data if needed, saves flag to localStorage
- Subsequent loads: Reads from localStorage (instant), skips Firestore check
- Survives page reloads and browser sessions for same user

### AI Integration (Currently Mocked)

In `databaseService.ts`:
- `generateMasterVideo()`: Simulates Gemini Pro script generation with 2s delay
- `startVariationGeneration()`: Simulates ElevenLabs voiceover + video composition with 5s delay
- **TODO**: Replace mock timings with actual API calls

### Video Variation Deduplication

The `VariationsMatrixView` prevents algorithmic penalties by checking for duplicate B-roll combinations:
```typescript
const combinationKey = bRollIds.join('->'); // e.g., "broll_1->broll_3"
if (master.usedCombinations.includes(combinationKey)) {
  throw new Error("Combinación Duplicada!");
}
```

### Polling Pattern for Async Jobs

`VariationsMatrixView.tsx` uses `setInterval` to poll Firestore for video rendering status:
```typescript
const interval = setInterval(async () => {
  const variations = await db.getVariationsForMaster(masterId);
  // Update UI when status changes to 'completed'
}, 1000);
```

### File Upload Handling

Files are uploaded as base64 to Firebase Storage via `databaseService.ts`:
- Images: PNG (model sheets)
- Videos: MP4 (B-rolls, reference videos)
- Signed URLs stored in Firestore for retrieval

### Authentication

`AuthView.tsx` exists with Firebase email/password auth but is **not integrated into app initialization**. Currently, no auth check before rendering main app.

## Common Development Tasks

### Adding a New View/Tab

1. Create new component in `src/components/` (e.g., `NewView.tsx`)
2. Add tab case in `App.tsx` switch statement
3. Update tab list in `App.tsx` navigation
4. Import databaseService for data operations

### Adding Firebase Queries

Add methods to `databaseService.ts` singleton class:
```typescript
async getDataByUser(userId: string) {
  const q = query(collection(db, 'collectionName'),
    where('userId', '==', userId));
  return getDocs(q);
}
```

Always scope queries by `userId` for security (enforce in Firestore rules).

### Handling Async Operations

Use `useEffect` in components with proper cleanup:
```typescript
useEffect(() => {
  const controller = new AbortController();
  fetchData().then(...);
  return () => controller.abort();
}, [dependencies]);
```

The polling pattern in `VariationsMatrixView` is specific to async job tracking.

## Important Known Limitations

1. **No Authentication Integration**: AuthView exists but app doesn't check `auth.currentUser` on startup
2. **No Error Boundaries**: App crashes on unhandled Firebase errors
3. **No Real Video Rendering**: `startVariationGeneration()` is simulated (no actual FFmpeg/n8n webhook)
4. **No Real AI APIs**: Gemini and ElevenLabs calls are mocked
5. **No Pagination**: All data loaded at once from Firestore
6. **Spanish Hardcoded**: No i18n setup, UI text is hard-coded Spanish
7. **No Testing**: Zero unit/integration/E2E tests
8. **Manual Polling**: Uses interval instead of Firestore real-time listeners (cheaper but higher latency)
9. **No Image/Video Upload in Detail Modal**: Can only view/remove existing files, not add new ones in edit mode

## Environment Setup

Create `.env.local` with Firebase configuration:
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Variables must be prefixed with `VITE_` to be exposed to the client.

## UI/UX Details

### Color System (CSS Custom Properties)

```css
--bg-space: #070a13          /* Very dark background */
--primary: #6366f1           /* Indigo (buttons, primary actions) */
--secondary: #06b6d4         /* Cyan (secondary UI) */
--accent: #a855f7            /* Purple (highlights) */
--success: #10b981           /* Green (success states) */
```

### Design Patterns

- **Glass Cards**: `background: rgba(17, 24, 39, 0.75)` with backdrop blur
- **Font**: 'Outfit' for headings, 'Inter' for body (system fallback)
- **Dark Theme Only**: No light mode support
- **Icons**: lucide-react components (consistent visual language)
- **Typography Smoothing**: `-webkit-font-smoothing: antialiased`

## Debugging Tips

- **Firestore Queries**: Check browser DevTools > Firebase tab for real-time listener activity
- **HMR Issues**: Clear `dist/` folder and restart dev server
- **Type Errors**: Run `npm run build` to see full TypeScript errors (ESLint doesn't catch all)
- **Storage URLs**: Verify signed URLs in Firestore documents match Cloud Storage paths
- **Polling Stalls**: Check browser console for Firebase errors in `VariationsMatrixView` polling loop

## Performance Considerations

- **Code Splitting**: Vite automatically chunks components, but large views may cause slower initial load
- **Image Optimization**: Model sheets are base64-encoded (fine for MVP, not scalable)
- **Firestore Reads**: All data fetched at component mount (no lazy loading)
- **Polling Cost**: 1s interval on `VariationsMatrixView` can accumulate read costs at scale
- **Seeding Cache**: localStorage prevents repeated Firestore queries on page reloads (key: `ttchop_seeded_{userId}`)
- **No In-Memory Cache**: Removed per-request caching to ensure always-fresh data from Firestore
