<script setup lang="ts">
// biome-ignore-start lint/correctness/noUnusedImports: Biome does not read the template, where these bindings are used
// biome-ignore-start lint/correctness/noUnusedVariables: Biome does not read the template, where these bindings are used
import { computed } from 'vue';
import { data } from '../data/records.data';

// The numbers row (design-final.md 3.4). Every figure comes from records.data.ts, which reads a committed record;
// a figure with no record is not rendered, and neither is the footnote that would cite it. Each tile ends with a link
// to its record on the main branch. The footnote markers are plain text, not small link targets.

const REPO_BLOB = 'https://github.com/ABCrimson/modern-cmdk/blob/main/';

interface Tile {
  readonly stat: 'core' | 'core-react' | 'search-10k' | 'deps';
  readonly value: string;
  /** Rendered after the value, in the brand ink at half the size. */
  readonly unit?: string;
  readonly label: string;
  readonly mark: string;
  readonly path: string;
}

/** Bytes to kB: one decimal, 1 kB = 1000 bytes. */
function kb(bytes: number): string {
  return (bytes / 1000).toFixed(1);
}

const sizesPath = computed(() =>
  data.sizes ? `benchmarks/size-history/${data.sizes.file}` : undefined,
);

const tiles = computed<Tile[]>(() => {
  const { sizes, search, deps } = data;
  const list: Tile[] = [];
  if (sizes && sizesPath.value) {
    if (sizes.core !== undefined) {
      list.push({
        stat: 'core',
        value: kb(sizes.core),
        unit: 'kB',
        label: 'core, gzip',
        mark: '¹',
        path: sizesPath.value,
      });
    }
    if (sizes.coreReact !== undefined) {
      list.push({
        stat: 'core-react',
        value: kb(sizes.coreReact),
        unit: 'kB',
        label: 'core and React adapter, gzip',
        mark: '¹',
        path: sizesPath.value,
      });
    }
  }
  if (search) {
    list.push({
      stat: 'search-10k',
      value: search.medianMs.toFixed(1),
      unit: 'ms',
      label: 'median to score 10,000 items',
      mark: '²',
      path: 'benchmarks/baseline.json',
    });
  }
  list.push({
    stat: 'deps',
    value: String(deps.length),
    label:
      deps.length === 1 && deps[0] === 'idb-keyval'
        ? 'runtime dependency, loaded only for IndexedDB frecency'
        : deps.length === 1
          ? 'runtime dependency'
          : 'runtime dependencies',
    mark: '³',
    path: 'packages/modern-cmdk/package.json',
  });
  return list;
});

const hasSizeTiles = computed(() => tiles.value.some((tile) => tile.mark === '¹'));
// biome-ignore-end lint/correctness/noUnusedVariables: end of the script
// biome-ignore-end lint/correctness/noUnusedImports: end of the script
</script>

<template>
  <div class="mc-stats mc-reveal">
    <ul class="grid">
      <li v-for="tile in tiles" :key="tile.stat" class="tile" data-mc="stat" :data-stat="tile.stat">
        <p class="figure mc-numbers">
          <span class="value">{{ tile.value }}</span><span v-if="tile.unit" class="unit"> {{ tile.unit }}</span>
        </p>
        <p class="label">{{ tile.label }}<span class="mark" aria-hidden="true"> {{ tile.mark }}</span></p>
        <a class="source" :href="`${REPO_BLOB}${tile.path}`" :aria-label="`Source for ${tile.label}: ${tile.path}`">Source</a>
      </li>
    </ul>
    <ol class="notes" data-mc="footnotes" aria-label="Footnotes">
      <li v-if="hasSizeTiles && data.sizes">
        <span class="mark" aria-hidden="true">&#x00B9;</span> Sizes: gzip, the record for v{{ data.sizes.version }}, measured with size-limit {{ data.sizes.sizeLimit }} at
        {{ data.sizes.sha }} on {{ data.sizes.date }}; <code>{{ sizesPath }}</code>.
      </li>
      <li v-if="data.search">
        <span class="mark" aria-hidden="true">&#x00B2;</span> Search: ts-scorer-10k, median of one CI run on
        {{ data.search.cpuCount }}-CPU {{ data.search.cpu }}, Node {{ data.search.node }}, {{ data.search.date }}, commit
        {{ data.search.commit.slice(0, 7) }}; <code>benchmarks/baseline.json</code>. Runner noise is &plusmn;20-40&nbsp;% (the
        record's own <code>note</code>).
      </li>
      <li>
        <span class="mark" aria-hidden="true">&#x00B3;</span> Dependencies: <code>packages/modern-cmdk/package.json</code>. <code>radix-ui</code> is a required peer, imported only by <code>modern-cmdk/react</code> and <code>modern-cmdk/react/dialog</code>.
      </li>
    </ol>
  </div>
</template>

<style scoped>
.mc-stats {
  container-type: inline-size;
  margin-block: var(--mc-space-5);
}

.mc-stats .grid {
  max-inline-size: none;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--mc-space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Four columns from 60rem of container width, two below */
@container (min-width: 60rem) {
  .mc-stats .grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

/* One column when two tiles no longer fit side by side at 3rem figures */
@container (max-width: 26rem) {
  .mc-stats .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.tile {
  display: flex;
  flex-direction: column;
  gap: var(--mc-space-2);
  margin: 0;
  padding: var(--mc-space-5);
  border: 1px solid var(--mc-divider);
  border-radius: var(--mc-radius-lg);
  background-color: var(--mc-bg-soft);
}

.tile > p {
  margin: 0;
}

.figure {
  color: var(--mc-text-1);
  font-size: 3rem;
  font-weight: 650;
  letter-spacing: -0.03em;
  line-height: 1;
}

.unit {
  color: var(--mc-brand-1);
  font-size: 0.5em;
  letter-spacing: 0;
}

.label {
  flex-grow: 1;
  color: var(--mc-text-2);
  font-size: var(--mc-step--1);
  line-height: 1.5;
}

.source {
  align-self: flex-start;
  color: var(--mc-brand-1);
  font-size: var(--mc-step--1);
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.source:hover {
  color: var(--mc-brand-2);
}

.mc-stats .notes {
  max-inline-size: none;
  margin: var(--mc-space-5) 0 0;
  padding: 0;
  list-style: none;
  color: var(--mc-text-3);
  font-family: var(--vp-font-family-mono);
  font-size: var(--mc-step--1);
  line-height: var(--mc-step--1-lh);
}

.notes li {
  margin: 0 0 var(--mc-space-2);
  overflow-wrap: anywhere;
}

.notes code {
  padding: 0;
  background: none;
  color: inherit;
  font-size: inherit;
}

@supports (corner-shape: squircle) {
  .tile {
    /* biome-ignore lint/correctness/noUnknownProperty: valid CSS (corner-shape), Chrome and Edge 139; https://developer.mozilla.org/en-US/docs/Web/CSS/corner-shape, read 2026-11-07 */
    corner-shape: squircle;
  }
}
</style>
