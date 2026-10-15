import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const service = readFileSync(new URL('../src/services/databaseService.ts', import.meta.url), 'utf8');
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const carousel = service.slice(service.indexOf('  // Carousel documents contain'), service.indexOf('  /**\n   * Fetches `docId`', service.indexOf('  // Carousel documents contain')));
const view = readFileSync(new URL('../src/components/CarouselsView.tsx', import.meta.url), 'utf8');
test('account switching discards stale carousel list responses', () => {
  assert.match(view, /useRef\(0\)/);
  assert.match(view, /requestId !== loadVersion\.current/);
  assert.match(view, /visibleCarousels = carousels\.filter/);
  assert.match(view, /visibleCarousels\.map/);
});

test('carousel API sends transient Firebase ID token and never trusts body userId', () => {
  assert.match(carousel, /getIdToken\(\)/);
  assert.match(carousel, /Authorization: `Bearer /);
  assert.doesNotMatch(carousel, /userId: user\.uid/);
  assert.doesNotMatch(carousel, /localStorage|sessionStorage/);
});
test('carousel read/list/delete go through server and Firestore denies direct access to callbackToken', () => {
  assert.doesNotMatch(carousel, /getDocs\(|getDoc\(|deleteDoc\(/);
  assert.match(carousel, /encodeURIComponent\(carouselId\)/);
  assert.match(rules, /match \/carousels\/\{document=\*\*\} \{\s*allow read, write: if false;/);
});
