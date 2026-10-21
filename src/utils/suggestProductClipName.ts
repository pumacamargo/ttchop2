// A session is called a "clip" in the product UI. Legacy session names stay untouched;
// only the default for a new session uses this naming convention.
export function suggestProductClipName(productName: string, existingNames: readonly string[]): string {
  const prefix = Array.from(productName.toLowerCase().replace(/\s/g, '')).slice(0, 8).join('');
  const taken = new Set(existingNames);
  for (let suffix = 1; ; suffix++) {
    const candidate = `${prefix}${String(suffix).padStart(2, '0')}`;
    if (!taken.has(candidate)) return candidate;
  }
}
