<script setup lang="ts">
// biome-ignore-start lint/correctness/noUnusedImports: Biome does not read the template, where these bindings are used
// biome-ignore-start lint/correctness/noUnusedVariables: Biome does not read the template, where these bindings are used
import { computed } from 'vue';
import { data } from '../data/records.data';

// The entry-point table (design-final.md 3.3, J4). Each size is read from the size record through records.data.ts.
// The two adapter entries are stand-alone files, so they say "adapter file alone"; the fourth row is the record's
// combined entry. A row whose entry has no record says so instead of showing a figure. Below 640 px the table
// is replaced by a definition list with the same rows.

interface Row {
  readonly entry: string;
  readonly what: string;
  /** The gzip figure with its qualifier, or undefined when the record has no such entry. */
  readonly size: string | undefined;
}

function kb(bytes: number | undefined): string | undefined {
  return bytes === undefined ? undefined : `${(bytes / 1000).toFixed(1)} kB`;
}

function qualified(bytes: number | undefined, qualifier: string): string | undefined {
  const size = kb(bytes);
  return size === undefined ? undefined : `${size}, ${qualifier}`;
}

const rows = computed<Row[]>(() => {
  const sizes = data.sizes;
  return [
    {
      entry: 'modern-cmdk',
      what: 'state machine, search, frecency, shortcuts',
      size: kb(sizes?.core),
    },
    {
      entry: 'modern-cmdk/react',
      what: '<code>Command.*</code> components and hooks',
      size: qualified(sizes?.react, 'adapter file alone'),
    },
    {
      entry: 'modern-cmdk/react/dialog',
      what: '<code>CommandDialog</code> on Radix',
      size: qualified(sizes?.dialog, 'adapter file alone'),
    },
    {
      entry: 'modern-cmdk + modern-cmdk/react',
      what: 'what a React app ships for both',
      size: sizes?.coreReact === undefined ? undefined : `${kb(sizes.coreReact)} together`,
    },
  ];
});
// biome-ignore-end lint/correctness/noUnusedVariables: end of the script
// biome-ignore-end lint/correctness/noUnusedImports: end of the script
</script>

<template>
  <div class="mc-entries mc-reveal">
    <table class="as-table">
      <thead>
        <tr>
          <th scope="col">Import</th>
          <th scope="col">What you get</th>
          <th scope="col">gzip</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.entry">
          <td><code>{{ row.entry }}</code></td>
          <td v-html="row.what"></td>
          <td class="mc-numbers">{{ row.size ?? 'no record' }}</td>
        </tr>
      </tbody>
    </table>
    <dl class="as-list">
      <div v-for="row in rows" :key="row.entry" class="entry">
        <dt><code>{{ row.entry }}</code></dt>
        <dd v-html="row.what"></dd>
        <dd class="mc-numbers size">{{ row.size ?? 'no record' }}</dd>
      </div>
    </dl>
  </div>
</template>

<style scoped>
.mc-entries {
  margin-block: var(--mc-space-5);
}

/* The default theme makes tables display: block (for scrolling), which shrinks them to their content; this one fits the column */
.as-table {
  display: table;
  width: 100%;
  margin: 0;
}

.as-list {
  display: none;
  margin: 0;
}

.entry {
  margin: 0 0 var(--mc-space-3);
  padding: var(--mc-space-3) var(--mc-space-4);
  border: 1px solid var(--mc-divider);
  border-radius: var(--mc-radius-md);
  background-color: var(--mc-bg-soft);
}

.entry dt,
.entry dd {
  margin: 0;
}

.entry dd {
  color: var(--mc-text-2);
  font-size: var(--mc-step--1);
}

.entry .size {
  margin-top: var(--mc-space-1);
  color: var(--mc-text-1);
  font-weight: 500;
}

/* Below 640 px (40rem) the table becomes the definition list */
@media (max-width: 39.99rem) {
  .as-table {
    display: none;
  }

  .as-list {
    display: block;
  }
}

</style>
