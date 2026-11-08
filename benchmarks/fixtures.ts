// benchmarks/fixtures.ts
// The shared item generator of every bench (TEB-33): the vitest benches and the standalone
// `pnpm bench:compare` harness build their items here, from the one table in
// apps/playground/src/bench/dataset.ts (which the playground's browser bench page also uses).
//
// Only type imports from 'modern-cmdk', so Node's type stripping erases them and the standalone
// harness, which loads the core from dist by path and cannot resolve 'modern-cmdk' by name, imports
// this file as it is. Callers pass the core's itemId as `toId`.

import type { CommandItem, ItemId } from 'modern-cmdk';
import { type DatasetVariant, itemSeeds } from '../apps/playground/src/bench/dataset.ts';

export type { DatasetVariant };

/** `count` items of `variant`, ids built with `toId`; identical data on every call. */
export function generateItems(
  count: number,
  variant: DatasetVariant,
  toId: (raw: string) => ItemId,
): CommandItem[] {
  return itemSeeds(count, variant).map(({ id, value, keywords }) => ({
    id: toId(id),
    value,
    keywords,
  }));
}
