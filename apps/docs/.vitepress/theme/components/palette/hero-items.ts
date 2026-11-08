import type { PaletteEntry, PaletteLink } from './types';

// The home hero's 19 rows: 8 Go to, 7 Topics, 4 Actions (design-final.md §3.5 of the design run, a run document outside
// the repository, listed 18; this file is the list).
// Every site `href` is a page under apps/docs (the commit that added this file records the existence check). The two
// external Action rows carry absolute URLs; the install command the copy action writes lives in usePalette.ts.
export const HERO_ITEMS: readonly PaletteEntry[] = [
  {
    id: 'go-getting-started',
    label: 'Getting started',
    group: 'Go to',
    kind: 'Guide',
    href: '/guide/getting-started',
  },
  {
    id: 'go-installation',
    label: 'Installation',
    group: 'Go to',
    kind: 'Guide',
    href: '/guide/installation',
  },
  {
    id: 'go-core-api',
    label: 'Core API',
    group: 'Go to',
    kind: 'API',
    href: '/api/command',
    keywords: ['FrecencyOptions', 'shortcut utilities'],
  },
  {
    id: 'go-react-adapter',
    label: 'React adapter',
    group: 'Go to',
    kind: 'API',
    href: '/api/command-react',
  },
  {
    id: 'go-examples',
    label: 'Examples',
    group: 'Go to',
    kind: 'Example',
    href: '/examples/basic',
  },
  {
    id: 'go-theming-example',
    label: 'Theming example',
    group: 'Go to',
    kind: 'Example',
    href: '/examples/theming',
    keywords: ['theme switcher', 'css custom properties'],
  },
  {
    id: 'go-spotlight-recipe',
    label: 'Spotlight recipe',
    group: 'Go to',
    kind: 'Recipe',
    href: '/recipes/spotlight-search',
    keywords: ['with frecency', 'keyboard shortcut'],
  },
  {
    id: 'go-migrate-from-cmdk',
    label: 'Migrate from cmdk',
    group: 'Go to',
    kind: 'Guide',
    href: '/guide/migration-from-cmdk',
  },
  {
    id: 'topic-frecency',
    label: 'Frecency ranking',
    group: 'Topics',
    kind: 'Guide',
    href: '/guide/frecency',
    keywords: ['frecency', 'recent', 'ranking', 'history'],
  },
  {
    id: 'topic-shortcuts',
    label: 'Keyboard shortcuts',
    group: 'Topics',
    kind: 'Guide',
    href: '/guide/shortcuts',
    keywords: ['shortcut'],
  },
  {
    id: 'topic-virtualization',
    label: 'Virtualization',
    group: 'Topics',
    kind: 'Guide',
    href: '/guide/virtualization',
    keywords: ['large datasets', 'performance'],
  },
  {
    id: 'topic-wasm-search',
    label: 'WASM search',
    group: 'Topics',
    kind: 'Guide',
    href: '/guide/wasm-search',
    keywords: ['rust', 'webassembly'],
  },
  {
    id: 'topic-accessibility',
    label: 'Accessibility',
    group: 'Topics',
    kind: 'Guide',
    href: '/guide/accessibility',
    keywords: ['aria', 'screen reader'],
  },
  {
    id: 'topic-ssr',
    label: 'SSR and Next.js',
    group: 'Topics',
    kind: 'Guide',
    href: '/guide/ssr',
    keywords: ['server component'],
  },
  {
    id: 'topic-theming',
    label: 'Theming',
    group: 'Topics',
    kind: 'Guide',
    href: '/guide/theming',
    keywords: ['theme', 'css', 'styles', 'dark'],
  },
  {
    id: 'action-copy-install',
    label: 'Copy install command',
    group: 'Actions',
    kind: 'Action',
    action: 'copy-install',
    shortcut: 'Alt+Shift+C',
    keywords: ['copy shortcut'],
  },
  {
    id: 'action-toggle-dark',
    label: 'Toggle dark mode',
    group: 'Actions',
    kind: 'Action',
    action: 'toggle-dark',
    shortcut: 'Alt+Shift+D',
    keywords: ['color theme', 'toggle shortcut'],
  },
  {
    id: 'action-github',
    label: 'Open on GitHub',
    group: 'Actions',
    kind: 'Action',
    href: 'https://github.com/ABCrimson/modern-cmdk',
  },
  {
    id: 'action-npm',
    label: 'View on npm',
    group: 'Actions',
    kind: 'Action',
    href: 'https://www.npmjs.com/package/modern-cmdk',
  },
];

// What the server renders and a no-JS visitor gets: the eight Go to rows as plain links, in row order.
export const HERO_SSR_LINKS: readonly PaletteLink[] = HERO_ITEMS.filter(
  (entry): entry is PaletteEntry & { readonly href: string } =>
    entry.group === 'Go to' && entry.href !== undefined,
).map((entry): PaletteLink => ({ text: entry.label, href: entry.href, kind: entry.kind }));

// The three words the hero types (usePalette.ts, design-final.md §3.5). Each fills at least three of the 19 rows and
// tests/unit/docs-autoplay-queries.test.ts keeps that true. A keyword of a row that opens a page is a phrase that page really
// contains (counted with grep, case-insensitive; the commit that set them lists the counts); the two Action rows have no
// page, so theirs name what the action does. The scorer ranks a keyword that starts with the query above a label that merely
// contains it (core/search/default-scorer.ts: starts-with 0.9 + 0.1 * query/target, substring 0.5 + ...), so the topic row
// carries the bare word and the others a phrase.
export const HERO_AUTOPLAY_QUERIES = ['frec', 'short', 'theme'] as const;
