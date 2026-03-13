// packages/command/src/core/utils/group-by.ts
// Cross-browser polyfills for Map.groupBy and Object.groupBy (ES2024+)
// Explicit return types required by isolatedDeclarations

/**
 * Groups items from an iterable into a Map keyed by the result of `keyFn`.
 * Cross-browser replacement for `Map.groupBy()`.
 */
export function mapGroupBy<K, V>(items: Iterable<V>, keyFn: (item: V) => K): Map<K, V[]> {
  const map = new Map<K, V[]>();
  for (const item of items) {
    const key = keyFn(item);
    const group = map.get(key);
    if (group) {
      group.push(item);
    } else {
      map.set(key, [item]);
    }
  }
  return map;
}

/**
 * Groups items from an iterable into a plain object keyed by the string result of `keyFn`.
 * Cross-browser replacement for `Object.groupBy()`.
 */
export function objectGroupBy<V>(
  items: Iterable<V>,
  keyFn: (item: V) => string,
): Record<string, V[]> {
  const result: Record<string, V[]> = Object.create(null) as Record<string, V[]>;
  for (const item of items) {
    const key = keyFn(item);
    const existing = result[key];
    if (existing) {
      existing.push(item);
    } else {
      result[key] = [item];
    }
  }
  return result;
}
