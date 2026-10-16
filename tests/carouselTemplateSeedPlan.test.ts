import test from 'node:test';
import assert from 'node:assert/strict';
import { planCarouselSeedWrites } from '../src/utils/carouselTemplateSeedPlan.ts';

const originalStyle = {
  title: 'Candid professional boys',
  type: 'carousel_style',
  seed: true,
};
const oldScript = {
  title: 'Lista o Ranking con opiniones',
  type: 'carousel_script',
  seed: true,
};
const newScript = {
  id: 'seed_arturo_carousel_script_reddit_confession',
  seedKey: 'carousel_script_reddit_confession',
  title: 'Confesión y giro de revancha',
  type: 'carousel_script',
  seed: true,
};
const existingDocs = [
  { id: 'old-style-id', data: originalStyle },
  { id: 'old-script-id', data: oldScript },
];

test('backfills the new story seed without duplicating existing carousel seeds', () => {
  assert.deepEqual(planCarouselSeedWrites(existingDocs, [originalStyle, oldScript, newScript]), [newScript]);
});

test('seeds every default for a user who has no carousel seeds yet', () => {
  const unrelatedTemplate = { id: 'collage-id', data: { type: 'collage', seed: true } };
  assert.deepEqual(planCarouselSeedWrites([unrelatedTemplate], [originalStyle, oldScript, newScript]), [originalStyle, oldScript, newScript]);
});

test('does not overwrite a user-edited template carrying the stable seed key', () => {
  const edited = {
    id: newScript.id,
    data: { ...newScript, title: 'Mi versión editada', content: 'texto del usuario' },
  };
  assert.deepEqual(planCarouselSeedWrites([edited], [newScript]), []);
});

test('does not add a duplicate if the stable document ID already exists', () => {
  const existing = { id: newScript.id, data: { ...newScript, seedKey: undefined } };
  assert.deepEqual(planCarouselSeedWrites([existing], [newScript]), []);
});
