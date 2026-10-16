import test from 'node:test';
import assert from 'node:assert/strict';
import { referenceProvenance, visibleReferences, visibleOwnOrders } from '../src/utils/salesProvenance.ts';
import { aggregateByProduct, computeOrderMetrics } from '../src/utils/analytics.ts';
import type { AnalyticsOrder } from '../src/services/databaseService.ts';

test('legacy reference is unverified even when filed under a connected account', () => {
  assert.equal(referenceProvenance({ id: 'legacy', type: 'sales_reference', accountId: 'mine' }), 'unverified');
  assert.equal(referenceProvenance({ id: 'bad', type: 'sales_reference', sourceKind: 'own' }), 'unverified');
  assert.equal(referenceProvenance({ id: 'empty', type: 'sales_reference', sourceKind: 'external', sourceLabel: '  ' }), 'unverified');
  assert.equal(referenceProvenance({ id: 'ext', type: 'sales_reference', sourceKind: 'external', sourceLabel: 'Other shop' }), 'external');
});

test('reference filing container filters visibility, not provenance', () => {
  const imports = [
    { id: 'general', type: 'sales_reference' as const },
    { id: 'mine', type: 'sales_reference' as const, accountId: 'mine' },
    { id: 'other', type: 'sales_reference' as const, accountId: 'other' },
    { id: 'orders', type: 'sales_file' as const, accountId: 'mine' },
  ];
  assert.deepEqual(visibleReferences(imports, null).map(i => i.id), ['general']);
  assert.deepEqual(visibleReferences(imports, 'mine').map(i => i.id), ['general', 'mine']);
  assert.deepEqual(visibleReferences(imports, 'other').map(i => i.id), ['general', 'other']);
});

test('references never enter own totals or rankings, including malformed linked rows', () => {
  const imports = [
    { id: 'own', type: 'sales_file' as const, accountId: 'mine', sourceKind: 'own' as const },
    { id: 'legacyRef', type: 'sales_reference' as const, accountId: 'mine' },
    { id: 'external', type: 'sales_reference' as const, accountId: 'mine', sourceKind: 'external' as const, sourceLabel: 'Third party' },
    { id: 'wrongType', type: 'sales_file' as const, sourceKind: 'external' as const },
  ];
  const orders = [
    { importId: 'own', amount: 12, product: 'mine' },
    { importId: 'legacyRef', amount: 900, product: 'not mine' },
    { importId: 'external', amount: 800, product: 'not mine' },
    { importId: 'wrongType', amount: 700, product: 'not mine' },
    { importId: 'missing', amount: 600, product: 'not mine' },
    { amount: 3, product: 'historical order' },
    { accountId: 'other', amount: 50, product: 'other account' },
  ];
  const own = visibleOwnOrders(orders, 'mine', imports);
  assert.deepEqual(own.map(o => o.product), ['mine', 'historical order']);
  assert.equal(own.reduce((sum, o) => sum + o.amount, 0), 15);
  assert.deepEqual(visibleOwnOrders(orders, null, imports).map(o => o.product), ['historical order']);
});

test('headline GMV and product ranking use the same own-only gate', () => {
  const imports = [
    { id: 'mine', type: 'sales_file' as const, sourceKind: 'own' as const },
    { id: 'thirdParty', type: 'sales_reference' as const, accountId: 'mine' },
  ];
  const order = (importId: string, gmv: number, productId: string): AnalyticsOrder => ({
    importId, gmv, productId, productName: productId, orderId: importId,
    settlementStatus: 'Settled', totalFinalEarnedAmount: gmv / 10,
    itemsSold: 1, itemsRefunded: 0,
  }) as AnalyticsOrder;
  const own = visibleOwnOrders([
    order('mine', 10, 'own product'),
    order('thirdParty', 9999, 'competitor product'),
  ], 'mine', imports);
  assert.equal(computeOrderMetrics(own).gmvTotal, 10);
  assert.equal(computeOrderMetrics(own).revenueTotal, 1);
  assert.deepEqual(aggregateByProduct(own).map(p => p.productName), ['own product']);
});
