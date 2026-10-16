import { getVisibleForContainer } from './containerVisibility.ts';

export type SalesImport = {
  id: string;
  type: 'sales_file' | 'sales_reference' | 'studio_scrape';
  accountId?: string | null;
  sourceKind?: 'own' | 'external';
  sourceLabel?: string;
};

/** A legacy reference stays unverified regardless of where it was filed. */
export function referenceProvenance(imp: SalesImport): 'external' | 'unverified' {
  return imp.sourceKind === 'external' && !!imp.sourceLabel?.trim() ? 'external' : 'unverified';
}

/** Shared-container visibility is a filing rule, not evidence of the workbook's origin. */
export function visibleReferences<T extends SalesImport>(imports: T[], accountId?: string | null): T[] {
  return getVisibleForContainer(imports.filter(imp => imp.type === 'sales_reference'), accountId);
}

/** All own-sales consumers use this gate before totals, rankings, reports or charts.
 * Legacy order rows without an importId keep their historical behavior; orphaned imported
 * rows fail closed. References never qualify even if a malformed row points to them.
 */
export function visibleOwnOrders<T extends { accountId?: string | null; importId?: string }>(
  orders: T[], accountId: string | null | undefined, imports: SalesImport[],
): T[] {
  const byId = new Map(imports.map(imp => [imp.id, imp]));
  return getVisibleForContainer(orders.filter(order => {
    if (!order.importId) return true;
    const imp = byId.get(order.importId);
    return imp?.type === 'sales_file' && imp.sourceKind !== 'external';
  }), accountId, byId);
}
