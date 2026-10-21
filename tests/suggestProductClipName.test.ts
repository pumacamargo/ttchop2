import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestProductClipName } from '../src/utils/suggestProductClipName.ts';

test('normalizes before truncation: lowercase, remove all whitespace, then take eight characters', () => {
  assert.equal(suggestProductClipName('Aretes Dorados', []), 'aretesdo01');
  assert.equal(suggestProductClipName('  A\tB\nC\u00a0D e F G H I', []), 'abcdefgh01');
});

test('takes the first available suffix, including gaps and beyond two digits', () => {
  assert.equal(suggestProductClipName('Aretes Dorados', ['aretesdo01', 'aretesdo03', 'old name']), 'aretesdo02');
  assert.equal(suggestProductClipName('Aretes Dorados', Array.from({ length: 99 }, (_, i) => `aretesdo${String(i + 1).padStart(2, '0')}`)), 'aretesdo100');
});

test('uses all available characters for a short product and leaves legacy names intact', () => {
  const existing = ['abc01', 'A custom old clip'];
  assert.equal(suggestProductClipName('A B C', existing), 'abc02');
  assert.deepEqual(existing, ['abc01', 'A custom old clip']);
});

test('only names supplied for this product affect its suggestion', () => {
  assert.equal(suggestProductClipName('Aretes Dorados', ['other product clip']), 'aretesdo01');
});
