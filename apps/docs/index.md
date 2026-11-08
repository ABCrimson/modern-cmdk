---
layout: home
hero:
  name: modern-cmdk
  text: One headless engine.<br>Any framework.
  tagline: Fuzzy search, frecency ranking and keyboard shortcuts in a typed TypeScript state machine, plus a React 19 adapter that renders a WAI-ARIA combobox.
  actions:
    - { theme: brand, text: Get started, link: /guide/getting-started }
    - { theme: alt, text: API reference, link: /api/command }
# Icons: box, text-search, history, accessibility and atom are inline SVG copied from lucide-static@1.70.0 (ISC, https://github.com/lucide-icons/lucide;
# the licence is served at /licenses/lucide.txt), with class, width and height removed and aria-hidden and focusable added. The K keycap is drawn for this site.
features:
  - icon: |-
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="m3.3 7 8.7 5 8.7-5" />
        <path d="M12 22V12" />
      </svg>
    title: A core with no framework
    details: "<code>createCommandMachine</code> is a typed state machine in plain TypeScript. Drive it from any UI layer; this page drives it from Vue."
    link: /api/command
    linkText: Core API
  - icon: |-
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
        <path d="M21 5H3" />
        <path d="M10 12H3" />
        <path d="M10 19H3" />
        <circle cx="17" cy="15" r="3" />
        <path d="m21 19-1.9-1.9" />
      </svg>
    title: Fuzzy search you can swap
    details: "A built-in TypeScript scorer ranks matches and reports the matched ranges. Swap in any <code>SearchEngine</code>, including the Rust/WASM one in development."
    link: /guide/wasm-search
    linkText: WASM search
  - icon: |-
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
        <path d="M12 7v5l4 2" />
      </svg>
    title: Ranks what people use
    details: "Opt-in frecency lifts items by how often and how recently they were chosen, kept in memory or in IndexedDB."
    link: /guide/frecency
    linkText: Frecency
  - icon: |-
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
        <rect x="3.75" y="3.75" width="16.5" height="16.5" rx="4" />
        <path d="M9.5 8v8M14.5 8 10 12l4.5 4" />
        <path d="M7 19.25h10" stroke-opacity=".45" />
      </svg>
    title: Shortcuts with conflict checks
    details: "Write <code>Mod+K</code> once: it is parsed, shown as the Command symbol on a Mac and Ctrl elsewhere, matched against key events and checked for conflicts."
    link: /guide/shortcuts
    linkText: Keyboard shortcuts
  - icon: |-
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
        <circle cx="16" cy="4" r="1" />
        <path d="m18 19 1-7-6 1" />
        <path d="m5 8 3-3 5.5 3-2.36 3.5" />
        <path d="M4.24 14.5a5 5 0 0 0 6.88 6" />
        <path d="M13.76 17.5a5 5 0 0 0-6.88-6" />
      </svg>
    title: A WAI-ARIA combobox
    details: "The React adapter renders combobox and listbox roles and announces result counts; its stylesheet honours forced colours, increased contrast and reduced motion."
    link: /guide/accessibility
    linkText: Accessibility
  - icon: |-
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="1" />
        <path d="M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5Z" />
        <path d="M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9-2.03-2.04-7.36-.02-11.9 4.5-4.52 4.54-6.54 9.87-4.5 11.9 2.03 2.04 7.36.02 11.9-4.5Z" />
      </svg>
    title: React 19, when you want it
    details: "Compound <code>Command.*</code> components on <code>useSyncExternalStore</code>, virtualization above 100 matches, and a Radix dialog on its own entry point."
    link: /api/command-react
    linkText: React adapter
---

<script setup lang="ts">
import EntryPoints from './.vitepress/theme/components/EntryPoints.vue';
import HomeStats from './.vitepress/theme/components/HomeStats.vue';
import { data } from './.vitepress/theme/data/records.data';

// The styles size comes from the size record; no record, no figure.
const styles = data.sizes?.styles;
const stylesSize = styles === undefined ? undefined : `${(styles / 1000).toFixed(1)} kB`;
</script>

## From install to a working palette

Install the engine with the React adapter's peers, or the core alone for any other UI.

::: code-group

```bash [pnpm]
pnpm add modern-cmdk react react-dom radix-ui
```

```bash [npm]
npm install modern-cmdk react react-dom radix-ui
```

```bash [yarn]
yarn add modern-cmdk react react-dom radix-ui
```

:::

::: code-group

```tsx [React]
'use client';

import { Command } from 'modern-cmdk/react';

export function CommandPalette() {
  return (
    <Command>
      <Command.Input placeholder="Type a command..." />
      <Command.List>
        <Command.Empty>No results found.</Command.Empty>
        <Command.Group heading="Actions">
          <Command.Item value="copy" onSelect={() => navigator.clipboard.writeText('Hello')}>
            Copy to clipboard
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command>
  );
}
```

```ts [Core]
import { createCommandMachine, itemId } from 'modern-cmdk';

const machine = createCommandMachine({
  items: [
    { id: itemId('copy'), value: 'Copy', shortcut: 'Mod+C' },
    { id: itemId('paste'), value: 'Paste', shortcut: 'Mod+V' },
  ],
});

machine.subscribe(() => console.log(machine.getState().filteredIds));
machine.send({ type: 'SEARCH_CHANGE', query: 'cop' });
```

:::

<EntryPoints />

Optional: `modern-cmdk/styles.css`<span v-if="stylesSize"> ({{ stylesSize }} gzip)</span> for the default look.

## The numbers

Read from this repository's records when the site was built. Each figure links to its record.

<HomeStats />
