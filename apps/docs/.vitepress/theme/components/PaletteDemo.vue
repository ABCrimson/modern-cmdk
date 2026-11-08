<script setup lang="ts">
import { computed, onMounted, reactive, type UnwrapNestedRefs, useId, useTemplateRef } from 'vue';
import { type PaletteApi, usePalette } from '../composables/usePalette';
import { HERO_ITEMS } from './palette/hero-items';
import type { PaletteEntry, PaletteLink } from './palette/types';

// The live palette: it runs the real modern-cmdk core (design-final.md §3.5). The server renders the fixed-size
// panel, a read-only input and the ssrLinks as plain <a href>; onMounted loads the core in its own chunk and swaps
// the list for the combobox markup with the same row geometry. If the core cannot load, the links stay.
// The behaviour lives in composables/usePalette.ts. No global CSS, and no listener on window or document:
// every handler below is bound to an element of the panel.

const props = defineProps<{
  mode: 'hero' | 'finder';
  /** The visually hidden heading that names the panel. */
  label: string;
  /** Defaults to HERO_ITEMS; required in finder mode. */
  items?: readonly PaletteEntry[];
  /** Finder: applied as the first SEARCH_CHANGE on mount. */
  initialQuery?: string;
  /** Rendered as <a href> before the engine loads. */
  ssrLinks: readonly PaletteLink[];
}>();

// biome-ignore lint/correctness/useHookAtTopLevel: <script setup> runs inside setup(); the rule models React hooks
const uid = useId();

// biome-ignore lint/correctness/useHookAtTopLevel: <script setup> runs inside setup(); the rule models React hooks
const rootEl = useTemplateRef<HTMLElement>('root');
// biome-ignore lint/correctness/useHookAtTopLevel: <script setup> runs inside setup(); the rule models React hooks
const inputEl = useTemplateRef<HTMLInputElement>('input');
// biome-ignore lint/correctness/useHookAtTopLevel: <script setup> runs inside setup(); the rule models React hooks
const listEl = useTemplateRef<HTMLElement>('list');

const entries = computed<readonly PaletteEntry[]>(
  () => props.items ?? (props.mode === 'hero' ? HERO_ITEMS : []),
);

// The composable returns refs; reactive() unwraps them so the template reads palette.ready, palette.groups and so on.
const palette: UnwrapNestedRefs<PaletteApi> = reactive(
  // biome-ignore lint/correctness/useHookAtTopLevel: <script setup> runs inside setup(); the rule models React hooks
  usePalette({
    mode: props.mode,
    uid,
    items: () => entries.value,
    initialQuery: () => props.initialQuery,
    ssrHeading: () => {
      const first = props.ssrLinks[0];
      return entries.value.find((entry) => entry.href === first?.href)?.group ?? '';
    },
    elements: { root: rootEl, input: inputEl, list: listEl },
  }),
);

onMounted(() => {
  void palette.mount();
});
</script>

<template>
  <section
    ref="root"
    class="mc-palette"
    data-mc="palette"
    :data-mode="mode"
    :data-hydrated="palette.ready ? 'true' : undefined"
    :data-autoplay="palette.autoplaying ? 'true' : undefined"
    :aria-labelledby="palette.headingId"
    @pointerdown="palette.onPanelPointerdown"
    @focusin="palette.onPanelFocusin"
    @focusout="palette.onPanelFocusout"
    @keydown="palette.onPanelKeydown"
    @pointerenter="palette.onPanelPointerenter"
    @pointerleave="palette.onPanelPointerleave"
  >
    <h2 :id="palette.headingId" class="mc-sr-only">{{ label }}</h2>
    <div class="mc-frame">
      <div class="mc-input-row">
        <svg class="mc-magnifier" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <circle cx="8.5" cy="8.5" r="5.5" />
          <line x1="12.6" y1="12.6" x2="17" y2="17" />
        </svg>
        <input
          ref="input"
          class="mc-input"
          data-mc="palette-input"
          type="text"
          :value="palette.query"
          :readonly="!palette.editable"
          placeholder="Search the docs or run a command…"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          :role="palette.ready ? 'combobox' : undefined"
          :aria-expanded="palette.ready ? (palette.showEmpty ? 'false' : 'true') : undefined"
          :aria-controls="palette.ready ? palette.listId : undefined"
          :aria-activedescendant="palette.ready ? palette.activeOptionId : undefined"
          :aria-autocomplete="palette.ready ? 'list' : undefined"
          :aria-labelledby="palette.headingId"
          @input="palette.onInput"
        />
      </div>

      <!-- The scrolling region is the listbox itself once the engine runs. axe 4.14.0 (installed) reports
           scrollable-region-focusable (https://dequeuniversity.com/rules/axe/4.14/scrollable-region-focusable, read
           2026-11-07) for a scrolling div that is not a listbox. The combobox input keeps focus and points at the listbox
           with aria-controls and aria-activedescendant. Chromium makes a scroller with no focusable child keyboard-focusable,
           which would put a second Tab stop between the input and the page; tabindex="-1" removes it from the Tab order,
           and mousedown is prevented so a click on a heading or the padding leaves focus in the input (wheel and
           touch scrolling are unaffected). Before mount the region holds real links, which are focusable. -->
      <div
        ref="list"
        class="mc-scroller"
        :id="palette.ready ? palette.listId : undefined"
        :role="palette.ready && !palette.showEmpty ? 'listbox' : undefined"
        :aria-labelledby="palette.ready && !palette.showEmpty ? palette.headingId : undefined"
        :tabindex="palette.ready ? -1 : undefined"
        @mousedown="palette.ready && $event.preventDefault()"
      >
        <template v-if="!palette.ready">
          <!-- The same heading the mounted list opens with, so the first row keeps its y through hydration. -->
          <div :id="palette.ssrHeadingId" class="mc-group-heading" :aria-hidden="palette.ssrHeading ? undefined : 'true'">{{ palette.ssrHeading }}</div>
        <ul class="mc-ssr-list" :aria-labelledby="palette.ssrHeading ? palette.ssrHeadingId : undefined">
          <li v-for="link in ssrLinks" :key="link.href">
            <a class="mc-row" :href="palette.pageHref(link.href)">
              <span class="mc-label">{{ link.text }}</span>
              <span class="mc-kind">{{ link.kind }}</span>
            </a>
          </li>
        </ul>
        </template>
        <template v-else>
            <div class="mc-track" :style="{ '--groups': palette.groups.length, '--rows': palette.rowCount }">
            <div
              v-for="group in palette.groups"
              :key="group.key"
              class="mc-group"
              role="group"
              :aria-labelledby="group.headingId"
              :style="{ '--g': group.index, '--r': group.rowsBefore, '--n': group.rows.length }"
            >
              <div :id="group.headingId" class="mc-group-heading">{{ group.heading }}</div>
              <div
                v-for="(row, slot) in group.rows"
                :id="row.optionId"
                :key="row.id"
                class="mc-row"
                role="option"
                :aria-selected="row.active ? 'true' : 'false'"
                :aria-keyshortcuts="row.entry.shortcut"
                :data-active="row.active ? 'true' : undefined"
                :data-mc-entry="row.id"
                :style="{ '--i': slot }"
                @pointermove="palette.activate(row.id)"
                @mousedown.prevent
                @click="palette.select(row.id, $event)"
              >
                <span class="mc-label" data-mc="palette-label">{{ row.entry.label }}</span>
                <span v-if="row.entry.shortcut" class="mc-chip-slot" aria-hidden="true">
                  <kbd v-if="palette.shortcutLabels.get(row.id)" class="mc-kbd">{{ palette.shortcutLabels.get(row.id) }}</kbd>
                </span>
                <span class="mc-kind">{{ palette.copiedId === row.id ? 'Copied' : row.entry.kind }}</span>
              </div>
            </div>
            </div>
          <p v-if="palette.showEmpty" class="mc-empty">No command matches “{{ palette.shownQuery }}”. Try ‘frecency’ or ‘dark’.</p>
        </template>
      </div>

      <div class="mc-footer">
        <span v-if="!palette.ready" class="mc-count">{{ ssrLinks.length }} pages</span>
        <button v-else-if="palette.autoplaying" class="mc-pause" data-mc="palette-pause" type="button" @click="palette.pauseAutoplay">
          Pause demo
        </button>
        <template v-else>
        <p class="mc-hints">
          <span class="mc-hint"
            ><span class="mc-keys" role="img" aria-label="Up and Down arrows"><kbd class="mc-kbd">↑</kbd><kbd class="mc-kbd">↓</kbd></span> move</span
          >
          <span class="mc-hint"><kbd class="mc-kbd">Enter</kbd> open</span>
          <span class="mc-hint"><kbd class="mc-kbd">Esc</kbd> clear</span>
        </p>
        <!-- Narrow panels hide the hints; the count fills the footer so no empty band is left. -->
        <span class="mc-count mc-count-narrow">{{ palette.resultCount }} {{ palette.resultCount === 1 ? 'result' : 'results' }}</span>
        </template>
      </div>
    </div>
    <div class="mc-sr-only" role="status" aria-live="polite" aria-atomic="true">{{ palette.liveMessage }}</div>
  </section>
</template>

<style scoped>
/* Reads only --mc-* tokens (tokens.css, item 1), plus --vp-font-family-mono for the key caps: §2.2 defines
   the mono stack only as that VitePress variable. The panel is a size container so the key hints hide on the
   panel's own width (below 480 px), not the viewport's. */
.mc-palette {
  container: mc-palette / inline-size;
  inline-size: 100%;
  font-family: inherit;
}

.mc-frame {
  position: relative;
  display: flex;
  flex-direction: column;
  /* Fixed block size: hydration and filtering never shift layout; the list scrolls inside. */
  block-size: 360px;
  overflow: hidden;
  color: var(--mc-text-1);
  font-size: var(--mc-step--1);
  line-height: 1.4;
  background: var(--mc-bg-elv);
  border: 1px solid light-dark(oklch(0.6 0.025 273 / 40%), oklch(0.5 0.04 273 / 40%));
  border-radius: var(--mc-radius-xl);
  box-shadow:
    0 1px 0 oklch(1 0 0 / 6%) inset,
    0 24px 64px -24px oklch(0.177 0.051 273 / 45%);
  transition:
    opacity var(--mc-dur-4) var(--mc-ease-spring),
    translate var(--mc-dur-4) var(--mc-ease-spring),
    scale var(--mc-dur-4) var(--mc-ease-spring);
}

/* 360 px below 960 px in both modes; the hero grows to 420 px from 960 px (design-final.md 3.2). */
@media (min-width: 960px) {
  .mc-palette[data-mode='hero'] .mc-frame {
    block-size: 420px;
  }
}

/* Entrance: the end state is shown where @starting-style is unsupported; durations are 0s under reduced motion. */
@starting-style {
  .mc-frame {
    opacity: 0;
    translate: 0 12px;
    scale: 0.98;
  }
}

/* The autoplay ring: a 1 px masked conic gradient, crimson over the first quarter turn, one turn per 6 s.
   --mc-ring-angle is registered in tokens.css; unregistered, the angle does not interpolate and the ring stays still. */
.mc-frame::before {
  content: '';
  position: absolute;
  inset: 0;
  padding: 1px;
  border-radius: inherit;
  background: conic-gradient(from var(--mc-ring-angle), var(--mc-brand-3) 0deg, transparent 90deg 360deg);
  mask:
    linear-gradient(currentColor 0 0) content-box,
    linear-gradient(currentColor 0 0);
  mask-composite: exclude;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--mc-dur-2) var(--mc-ease-standard);
}

.mc-palette[data-autoplay] .mc-frame::before {
  opacity: 1;
  animation: mc-ring 6s linear infinite;
}

@keyframes mc-ring {
  to {
    --mc-ring-angle: 360deg;
  }
}

@media (prefers-reduced-motion: reduce) {
  .mc-palette[data-autoplay] .mc-frame::before {
    animation: none;
  }
}

/* Squircle corners where supported (Chrome and Edge 139; a pure enhancement). */
@supports (corner-shape: squircle) {
  .mc-frame {
    corner-shape: squircle;
  }
}

.mc-input-row {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--mc-space-3);
  block-size: 52px;
  padding-inline: var(--mc-space-4);
  border-block-end: 1px solid var(--mc-divider);
}

.mc-magnifier {
  flex: none;
  inline-size: 20px;
  block-size: 20px;
  fill: none;
  stroke: var(--mc-text-3);
  stroke-width: 1.75;
  stroke-linecap: round;
}

.mc-input {
  flex: 1;
  min-inline-size: 0;
  block-size: 100%;
  padding-inline: var(--mc-space-2);
  color: var(--mc-text-1);
  /* 1rem keeps iOS from zooming the page on focus. */
  font: inherit;
  font-size: var(--mc-step-0);
  background: transparent;
  border: 0;
}

.mc-input::placeholder {
  color: var(--mc-text-3);
  opacity: 1;
}

/* The page-wide ring (outline-offset 2px) would be clipped by the frame's overflow; draw it inside the input instead. */
.mc-input:focus-visible {
  outline: 2px solid var(--mc-brand-3);
  outline-offset: -2px;
  border-radius: var(--mc-radius-sm);
}

.mc-scroller {
  position: relative;
  /* The scrollbar's width is reserved, so a list that stops overflowing does not move the right-aligned kinds. */
  scrollbar-gutter: stable;
  flex: 1 1 0;
  min-block-size: 0;
  padding-block: var(--mc-space-2);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.mc-ssr-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.mc-group-heading {
  display: flex;
  align-items: center;
  block-size: 32px;
  padding-inline: var(--mc-space-4);
  color: var(--mc-text-3);
  font-size: var(--mc-step--2);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.mc-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--mc-space-3);
  box-sizing: border-box;
  block-size: 40px;
  padding-inline: var(--mc-space-4);
  color: var(--mc-text-1);
  text-decoration: none;
  cursor: pointer;
  transition: background-color var(--mc-dur-1) var(--mc-ease-standard);
}

/* Active row: brand-soft fill plus a 3 px brand-3 bar on the inline-start edge. */
.mc-row[data-active] {
  background: var(--mc-brand-soft);
}

.mc-row[data-active]::before {
  content: '';
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  inline-size: 3px;
  background: var(--mc-brand-3);
}

/* Filtering must not move boxes the Layout Instability API counts as a layout shift (design-final.md 8: CLS <= 0.02),
   and rows leave and join as the query changes. So groups and rows are absolutely placed and moved with `translate`:
   transform-based movement is not a layout shift (https://web.dev/articles/cls, "Animations and transitions" and
   the transform advice, read 2026-11-07). Row and heading heights are the two lengths below; --g, --r, --n and --i are
   set inline from usePalette.ts (group index, rows before it, rows in it, slot in the group). */
.mc-frame {
  --_row-h: 40px;
  --_head-h: 32px;
}

.mc-track {
  position: relative;
  block-size: calc(var(--groups, 0) * var(--_head-h) + var(--rows, 0) * var(--_row-h));
}

.mc-group {
  position: absolute;
  inset-block-start: 0;
  inset-inline: 0;
  block-size: calc(var(--_head-h) + var(--n, 0) * var(--_row-h));
  translate: 0 calc(var(--g, 0) * var(--_head-h) + var(--r, 0) * var(--_row-h));
}

.mc-group .mc-group-heading {
  position: absolute;
  inset-block-start: 0;
  inset-inline: 0;
  block-size: var(--_head-h);
}

.mc-group .mc-row {
  position: absolute;
  inset-block-start: 0;
  inset-inline: 0;
  block-size: var(--_row-h);
  translate: 0 calc(var(--_head-h) + var(--i, 0) * var(--_row-h));
}

.mc-label {
  flex: 1;
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Matched characters, painted by the CSS Custom Highlight API (usePalette.ts); without it nothing is painted. */
.mc-label::highlight(mc-match) {
  color: var(--mc-brand-1);
  text-decoration: underline 2px;
}

.mc-kind {
  flex: none;
  color: var(--mc-text-3);
  font-size: var(--mc-step--2);
  text-align: end;
}

.mc-chip-slot {
  display: inline-flex;
  flex: none;
  justify-content: flex-end;
  min-inline-size: 5.5rem;
}

.mc-kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-inline-size: 1.5rem;
  padding-inline: var(--mc-space-1);
  color: var(--mc-text-2);
  font-family: var(--vp-font-family-mono);
  font-size: 0.75rem;
  line-height: 1.5rem;
  background: var(--mc-bg-soft);
  border: 1px solid var(--mc-divider);
  border-radius: var(--mc-radius-xs);
}

.mc-empty {
  margin: 0;
  padding: var(--mc-space-6) var(--mc-space-4);
  color: var(--mc-text-2);
  text-align: center;
  transition: opacity var(--mc-dur-2) var(--mc-ease-standard);
}

@starting-style {
  .mc-empty {
    opacity: 0;
  }
}

.mc-footer {
  display: flex;
  flex: none;
  align-items: center;
  block-size: 44px;
  padding-inline: var(--mc-space-4);
  color: var(--mc-text-3);
  font-size: var(--mc-step--2);
  border-block-start: 1px solid var(--mc-divider);
}

.mc-hints {
  display: flex;
  gap: var(--mc-space-4);
  margin: 0;
}

.mc-hint {
  display: inline-flex;
  align-items: center;
  gap: var(--mc-space-2);
}

.mc-keys {
  display: inline-flex;
  gap: var(--mc-space-1);
}

.mc-count-narrow {
  display: none;
}

@container mc-palette (max-inline-size: 480px) {
  .mc-hints {
    display: none;
  }

  .mc-count-narrow {
    display: block;
  }
}

.mc-pause {
  min-block-size: 32px;
  min-inline-size: 32px;
  padding-inline: var(--mc-space-3);
  color: var(--mc-text-1);
  font: inherit;
  font-size: var(--mc-step--2);
  background: transparent;
  border: 1px solid var(--mc-border-strong);
  border-radius: var(--mc-radius-sm);
  cursor: pointer;
  transition: background-color var(--mc-dur-1) var(--mc-ease-standard);
}

.mc-pause:hover {
  background: var(--mc-bg-soft);
}

.mc-sr-only {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  white-space: nowrap;
  border: 0;
  clip-path: inset(50%);
}

/* Forced colours: system colours in the panel, the ring hidden. */
@media (forced-colors: active) {
  .mc-frame {
    background: Canvas;
    border-color: CanvasText;
  }

  .mc-frame::before {
    display: none;
  }

  .mc-row[data-active] {
    color: HighlightText;
    background: Highlight;
    forced-color-adjust: none;
  }

  .mc-row[data-active]::before {
    background: HighlightText;
  }

  .mc-row[data-active] .mc-kind {
    color: HighlightText;
  }

  .mc-label::highlight(mc-match) {
    color: MarkText;
    background-color: Mark;
  }
}
</style>
