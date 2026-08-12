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
 */
export function getVisibleForContainer<T extends { accountId?: string | null }>(
  docs: T[],
  activeAccountId: string | null | undefined
): T[] {
  if (!activeAccountId) return docs.filter(d => isGeneralContainer(d.accountId));
  return docs.filter(d => isGeneralContainer(d.accountId) || d.accountId === activeAccountId);
}
