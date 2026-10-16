export interface CarouselSeedDocument {
  id: string;
  data: {
    type?: string;
    title?: string;
    seed?: boolean;
    seedKey?: string;
  };
}

export interface CarouselSeedEntry {
  id?: string;
  seedKey?: string;
  type: string;
  title: string;
  seed?: boolean;
}

/**
 * Choose carousel defaults to create without replacing or duplicating user data.
 * Existing carousel-seeded accounts receive only newly keyed seeds; brand-new
 * accounts receive the complete default catalog.
 */
export function planCarouselSeedWrites<T extends CarouselSeedEntry>(
  existingDocs: CarouselSeedDocument[],
  seedEntries: T[],
): T[] {
  const hasCarouselSeed = existingDocs.some(({ data }) =>
    data.seed === true && (data.type === 'carousel_script' || data.type === 'carousel_style'),
  );

  const candidates = hasCarouselSeed
    ? seedEntries.filter(entry => Boolean(entry.seedKey))
    : seedEntries;

  return candidates.filter(entry => !existingDocs.some(({ id, data }) =>
    (entry.id !== undefined && id === entry.id)
    || (entry.seedKey !== undefined && data.seedKey === entry.seedKey)
    || (data.type === entry.type && data.title === entry.title),
  ));
}
