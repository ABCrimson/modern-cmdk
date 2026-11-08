<script lang="ts">
import type { DefaultTheme } from 'vitepress/theme';
import type { PaletteEntry } from './palette/types';

// The 404 page finder (design-final.md 4.8). Plain <script> so the pure helpers can be exported and unit-checked.

/** A link with a scheme (https:, mailto:) or a protocol-relative one is not a page of this site. */
const EXTERNAL_LINK = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;

/**
 * The query the finder starts with: the last path segment of the requested address, without its `.html`, with `-` and
 * `_` as spaces. `/modern-cmdk/guide/frecncy.html` becomes `frecncy`, which the fuzzy scorer matches to "Frecency".
 */
export function deslug(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] ?? '';
  const last = path.split('/').findLast((segment) => segment !== '') ?? '';
  let decoded = last;
  try {
    decoded = decodeURIComponent(last);
  } catch {
    // A malformed escape: the raw segment is still a usable query.
  }
  return decoded
    .replace(/\.html$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
}

/** The path of a theme link as the palette wants it: no base, no `.html`, no trailing `/index`; undefined for an external link. */
export function toPagePath(link: string, base: string): string | undefined {
  if (EXTERNAL_LINK.test(link)) return undefined;
  let path = link.replace(/\.html(?=$|[?#])/i, '');
  if (base !== '/' && path.startsWith(base)) path = `/${path.slice(base.length)}`;
  return path.replace(/\/index(?=$|[?#])/, '/');
}

/**
 * Every internal link of the nav and the sidebar, flattened and de-duplicated by path. A sidebar link takes the title of its
 * top-level section as its group (the sidebar is read first, so it wins over the nav); a link only the nav has is in
 * "Navigation". `base` is the site base ('/modern-cmdk/').
 */
export function collectPageEntries(
  theme: DefaultTheme.Config,
  base: string,
): readonly PaletteEntry[] {
  const seen = new Set<string>();
  const entries: PaletteEntry[] = [];

  const add = (text: string | undefined, link: string | undefined, group: string): void => {
    if (text === undefined || link === undefined) return;
    const href = toPagePath(link, base);
    if (href === undefined || seen.has(href)) return;
    seen.add(href);
    entries.push({ id: href, label: text, group, kind: 'Page', href, keywords: [group] });
  };

  // A sidebar item's `base` is a path prefix of its descendants' links.
  const joinBase = (prefix: string | undefined, link: string): string =>
    prefix === undefined || EXTERNAL_LINK.test(link)
      ? link
      : `${prefix.replace(/\/$/, '')}/${link.replace(/^\//, '')}`;

  const walkSidebar = (
    items: readonly DefaultTheme.SidebarItem[],
    section: string | undefined,
    prefix: string | undefined,
  ): void => {
    for (const item of items) {
      const itemPrefix = item.base ?? prefix;
      const group = section ?? item.text ?? 'Navigation';
      if (item.link !== undefined) add(item.text, joinBase(itemPrefix, item.link), group);
      if (item.items !== undefined) walkSidebar(item.items, group, itemPrefix);
    }
  };

  const sidebar = theme.sidebar;
  if (Array.isArray(sidebar)) {
    walkSidebar(sidebar, undefined, undefined);
  } else if (sidebar !== undefined) {
    for (const value of Object.values(sidebar)) {
      if (Array.isArray(value)) walkSidebar(value, undefined, undefined);
      else walkSidebar(value.items, undefined, value.base);
    }
  }

  const walkNav = (
    items: readonly (
      | DefaultTheme.NavItem
      | DefaultTheme.NavItemChildren
      | DefaultTheme.NavItemWithLink
    )[],
  ): void => {
    for (const item of items) {
      if ('component' in item) continue;
      if ('link' in item && typeof item.link === 'string') add(item.text, item.link, 'Navigation');
      if ('items' in item && item.items !== undefined) walkNav(item.items);
    }
  };
  if (theme.nav !== undefined) walkNav(theme.nav);

  return entries;
}
</script>

<script setup lang="ts">
import { useData, useRoute } from 'vitepress';
import { VPButton } from 'vitepress/theme-without-fonts';
import { computed, onMounted, ref } from 'vue';
import PaletteDemo from './PaletteDemo.vue';
import type { PaletteLink } from './palette/types';

// The finder lists the site's own pages: every nav and sidebar link of the theme config (see collectPageEntries).
// The requested address and the Mod+K hint are filled after mount, so the server-rendered markup is the same on every
// address and hydration finds no mismatch. The hint comes from the real core (formatShortcut reads the platform when
// the core loads), imported inside onMounted so it is never part of the server render.

// biome-ignore lint/correctness/useHookAtTopLevel: <script setup> runs inside setup(); the rule models React hooks
const { site, theme } = useData();
// biome-ignore lint/correctness/useHookAtTopLevel: <script setup> runs inside setup(); the rule models React hooks
const route = useRoute();

// What the page offers without JavaScript: the five links of the spec.
const SSR_LINKS: readonly PaletteLink[] = [
  { text: 'Getting started', href: '/guide/getting-started', kind: 'Guide' },
  { text: 'Installation', href: '/guide/installation', kind: 'Guide' },
  { text: 'Core API', href: '/api/command', kind: 'API' },
  { text: 'Examples', href: '/examples/basic', kind: 'Example' },
  { text: 'Migrate from cmdk', href: '/guide/migration-from-cmdk', kind: 'Guide' },
];

const items = computed(() => collectPageEntries(theme.value, site.value.base));
// Only PaletteDemo's mount reads this prop; it is not rendered, so the server value ('404' on 404.html) never reaches the markup.
const initialQuery = computed(() => deslug(toPagePath(route.path, site.value.base) ?? route.path));

const requestedPath = ref('');
const shortcut = ref('');

onMounted(async () => {
  try {
    requestedPath.value = decodeURI(route.path);
  } catch {
    requestedPath.value = route.path;
  }
  try {
    const core = await import('modern-cmdk');
    shortcut.value = core.formatShortcut(core.parseShortcut('Mod+K'));
  } catch {
    // The core did not load: the sentence stays without the hint, and the finder keeps its server-rendered links.
  }
});
</script>

<template>
  <main class="mc-not-found" data-mc="not-found">
    <p class="mc-keycap mc-key">404</p>
    <h1 class="mc-title">No page at this address</h1>
    <p class="mc-path">{{ requestedPath }}</p>
    <p class="mc-lede">
      Nothing lives here. The closest pages are listed below, or search the whole site from the navigation bar.<template v-if="shortcut">
        (<kbd>{{ shortcut }}</kbd>)</template>
    </p>
    <div class="mc-finder">
      <PaletteDemo
        mode="finder"
        label="Find a page"
        :items="items"
        :initial-query="initialQuery"
        :ssr-links="SSR_LINKS"
      />
    </div>
    <div class="mc-actions">
      <VPButton theme="alt" text="Back to the home page" href="/" />
    </div>
  </main>
</template>

<style scoped>
/* Reads only --mc-* tokens (tokens.css, fonts.css, motion.css) and the key-cap and kbd style of doc.css. */
.mc-not-found {
  box-sizing: border-box;
  max-inline-size: 40rem;
  margin-inline: auto;
  padding: var(--mc-space-8) var(--mc-space-5) var(--mc-space-9);
  text-align: center;
}

/* The 404 key cap: the kbd style at 4x (Geist Mono 56 px, 700; 4 px edge, 8 px bottom edge). */
.mc-key {
  display: block;
  inline-size: fit-content;
  margin: 0 auto;
  border-width: 4px;
  border-block-end-width: 8px;
  border-radius: var(--mc-radius-lg);
  padding: 0.1em 0.35em;
  font-size: 3.5rem;
  font-weight: 700;
  line-height: 1.1;
  /* presses once on entry */
  transition: scale var(--mc-dur-3) var(--mc-ease-spring);
}

@starting-style {
  .mc-key {
    scale: 0.94;
  }
}

@media (prefers-reduced-motion: reduce) {
  .mc-key {
    transition: none;
  }
}

.mc-title {
  margin: var(--mc-space-5) 0 var(--mc-space-2);
  font-size: var(--mc-step-3);
  font-weight: var(--mc-step-3-weight);
  line-height: var(--mc-step-3-lh);
  letter-spacing: var(--mc-step-3-tracking);
  text-wrap: balance;
}

/* The requested address, once mounted; the line is reserved so filling it shifts nothing */
.mc-path {
  min-block-size: calc(var(--mc-step--1) * var(--mc-step--1-lh));
  margin: 0 0 var(--mc-space-4);
  font-family: var(--vp-font-family-mono);
  font-size: var(--mc-step--1);
  line-height: var(--mc-step--1-lh);
  color: var(--mc-text-2);
  overflow-wrap: anywhere;
}

.mc-lede {
  max-inline-size: 33em;
  margin: 0 auto;
  font-size: var(--mc-step-0);
  line-height: var(--mc-step-0-lh);
  color: var(--mc-text-2);
  text-wrap: pretty;
}

.mc-finder {
  margin-block: var(--mc-space-6) var(--mc-space-5);
  text-align: start;
}

.mc-actions {
  display: flex;
  justify-content: center;
}

/*
 * Finder rows stagger in: each row's opacity and translate transitions are delayed by its position among its siblings
 * (sibling-index(), Baseline 2026-08-18, MDN, read 2026-11-07), counted from the first row of a group (index 2: the group heading is the first sibling), so every group starts at 0, and capped at 320 ms so a long unfiltered list does not wait. The server-rendered rows are each the only child of their li and appear together.
 * The rows belong to PaletteDemo, so :deep() reaches them. Not under reduced motion, where a delay on a 0 s transition
 * would only hold the rows invisible.
 */
@media (prefers-reduced-motion: no-preference) {
  @supports (transition-delay: calc(sibling-index() * 1ms)) {
    .mc-finder :deep(.mc-row) {
      transition-property: background-color, opacity, translate;
      transition-duration: var(--mc-dur-1), var(--mc-dur-2), var(--mc-dur-2);
      transition-timing-function: var(--mc-ease-standard), var(--mc-ease-out), var(--mc-ease-out);
      transition-delay: 0s, clamp(0ms, calc((sibling-index() - 2) * 40ms), 320ms),
        clamp(0ms, calc((sibling-index() - 2) * 40ms), 320ms);
    }

    @starting-style {
      .mc-finder :deep(.mc-row) {
        opacity: 0;
        translate: 0 8px;
      }
    }
  }
}
</style>
