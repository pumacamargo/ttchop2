// Container visibility — shared by every view once they start scoping data by TikTok account
// (see PLAN.md / the "Contenedores por cuenta" task). A "container" is either the general/shared
// one (every user starts here, connecting TikTok is optional) or a specific connected TikTok
// account, identified by its `openId`.
//
// Documents predating this concept (i.e. all of them today) have no `accountId` field at all, so
// absent/null/empty-string must all mean "lives in the general container" — that is what keeps
// every existing user's data exactly where it is today with zero migration. `isGeneralContainer`
// is the single place that tri-state check happens so every other piece of code can rely on it.
//
// Pure and framework-free on purpose (no Firebase import): it's the function every view will call
// right after fetching, so it needs to be trivial to unit test.

/** True when `accountId` denotes the general/shared container (absent, null, or empty string). */
export function isGeneralContainer(accountId?: string | null): boolean {
  return !accountId;
}

// ── Manage Imports: container-by-import ─────────────────────────────────────
// `analytics_orders` and `tiktok_videos` documents no longer carry the container on themselves —
// reassigning an import of 500 orders needs to be ONE write, not 500 (see PLAN.md "Manage
// Imports"). Instead each doc carries an `importId` pointing at an `imports/{id}` record, and
// THAT record has the `accountId`. Documents written before this feature existed have no
// `importId` at all, so they keep resolving straight from their own `accountId` field — the same
// tri-state absent/null/'' rule `isGeneralContainer` already enforces, zero migration required.

/** Minimal shape of an `imports/{id}` record needed to resolve a document's effective container. */
export interface ImportContainerRef {
  accountId?: string | null;
}

/**
 * Resolves the container a document actually lives in: if it has an `importId` AND that import
 * is present in `importsById`, the import's `accountId` wins; otherwise (no `importId`, or the
 * import it points to no longer exists) it falls back to the document's own `accountId`. This is
 * the ONE place that dual-path logic lives — every filtering/display site should call this (or
 * `getVisibleForContainer` below, which already does) instead of reading `doc.accountId` raw.
 */
export function getEffectiveContainer<T extends { accountId?: string | null; importId?: string }>(
  doc: T,
  importsById: Map<string, ImportContainerRef>
): string | null {
  if (doc.importId) {
    const imp = importsById.get(doc.importId);
    if (imp) return imp.accountId || null;
  }
  return doc.accountId || null;
}

/**
 * Filters `docs` down to what's visible in `activeAccountId`'s container:
 *  - General container active (`activeAccountId` is null/undefined) → only general documents.
 *  - An account container active → that account's own documents PLUS the general ones, merged
 *    into a single list (general content is shared across every account by design).
 *
 * Callers are expected to have already fetched `docs` scoped by `userId` (via the normal
 * Firestore query) — this only ever narrows further by `accountId`, in memory. See the comment
 * on `getVisibleForContainer` re-export in databaseService.ts for why that split (userId in the
 * query, accountId in JS) was the deliberate choice instead of a Firestore OR/`in` query.
 *
 * `importsById` is optional and only relevant for collections that can carry `importId`
 * (`analytics_orders`, `tiktok_videos`) — pass the map built from `db.getImports()` so those
 * docs resolve through their import instead of their own (possibly absent) `accountId`. Callers
 * for collections that never had this concept (products, renders, sessions...) simply omit it.
 */
export function getVisibleForContainer<T extends { accountId?: string | null; importId?: string }>(
  docs: T[],
  activeAccountId: string | null | undefined,
  importsById?: Map<string, ImportContainerRef>
): T[] {
  const effectiveContainer = (d: T): string | null => importsById ? getEffectiveContainer(d, importsById) : (d.accountId || null);
  if (!activeAccountId) return docs.filter(d => isGeneralContainer(effectiveContainer(d)));
  return docs.filter(d => {
    const c = effectiveContainer(d);
    return isGeneralContainer(c) || c === activeAccountId;
  });
}
