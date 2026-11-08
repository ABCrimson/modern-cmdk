// tests/unit/cmdk-comparison.test.tsx
// ============================================================================
// DIFFERENTIAL COMPARISON: cmdk 1.1.1 against modern-cmdk
// ============================================================================
//
// Every parity case renders cmdk 1.1.1 (node_modules/cmdk) and modern-cmdk
// (packages/modern-cmdk/src/react) from one fixture, observes the same facts in both, and checks
// each observation against its row of the delta table, tests/unit/cmdk-parity-delta.json.
//
// Adapters (tests/unit/cmdk-parity-adapters.tsx). A fixture is data: a root, an input, a list and
// a tree of items, groups, separators, Empty and Loading, optionally inside a Dialog. One adapter
// per library turns it into that library's components and props, and holds the library's
// attribute names. A prop is translated only where the library documents one for the intent
// (`filter: 'off'` is cmdk's `shouldFilter={false}` and modern-cmdk's `filter={false}`); an
// intent with no counterpart renders nothing in the other library, and the case records it.
//
// Observations are plain JSON: the item values in DOM order, the active value, the arguments of
// onSelect, Empty visibility, ARIA attributes (an id reference is a token such as `list`, never a
// generated id) and each library's own data attributes.
//
// Delta table. One row per case id: `{ status, cmdk, modernCmdk, reason, ref }`. The observation
// of each library must equal its recorded value, so drift on either side is a failure. A 'same'
// row holds two equal values and a 'differs' row two unequal ones, so a status that disagrees
// with the values fails too. `reason` is a sentence for a migrating cmdk user and `ref` names the
// ruling or ledger row. The last differential test requires the table's keys to equal the case
// ids, in case order.
//
// What the installed type declarations say (cmdk: node_modules/cmdk/dist/index.d.ts; modern-cmdk:
// packages/modern-cmdk/dist/react/index.d.mts, with src/react/*.tsx):
//   - cmdk's Command takes `label`, `shouldFilter`, `filter(value, search, keywords)` returning a
//     number where 0 hides the item, `value`, `defaultValue` and `onValueChange` for the active
//     item, `loop` (opt-in), `disablePointerSelection`, and `vimBindings` (default true). Its Item
//     and Group take `forceMount`; its Item calls `onSelect(value)`; its Separator takes
//     `alwaysRender`; its Input takes `value` and `onValueChange`; its List takes `label`.
//   - modern-cmdk's Command takes `label` (the aria-label), `filter(item, query)` or `false`,
//     `activeId` and `onActiveChange` for the active item, `onSearchChange`, `searchEngine`, and
//     `loop`, which defaults to true. It has no `vimBindings`, `forceMount`, `defaultValue` or
//     `disablePointerSelection`. Its Item takes `id` (`forceId` is a deprecated alias) and calls
//     `onSelect()` with no argument in 1.x (D66); its Separator's `alwaysRender` defaults to true
//     in 1.x; its Group takes `id`; its Loading takes `loading`; its List virtualizes above 100
//     matches and writes `--command-list-height`; cmdk's List writes `--cmdk-list-height`.
//
// Sections of this file:
//   1. Delta table: the row type and the parser of the JSON.
//   2. Fixture shorthands: the helpers the cases build fixtures with.
//   3. Cases, in table order: structure, ARIA, groups and separators, filtering, keyboard and
//      selection, controlled state, dialog, server-rendered HTML.
//   4. The differential harness: describe.for over the two adapters, the ResizeObserver stub
//      (happy-dom 21.0.4's does nothing), and the gate test, "the delta table has exactly one row
//      per parity case".
//   5. modern-cmdk superset: behaviour that has no cmdk counterpart (the framework-agnostic core,
//      the search engine, the shortcut registry, frecency, branded ids, and the components cmdk
//      lacks), asserted on modern-cmdk alone.
// ============================================================================

import { isDeepStrictEqual } from 'node:util';
import {
  type CommandItem as CoreCommandItem,
  computeFrecencyBonus,
  createCommandMachine,
  createSearchEngine,
  detectConflicts,
  type FrecencyRecord,
  formatShortcut,
  groupId,
  itemId,
  matchesShortcut,
  parseShortcut,
  scoreItem,
} from 'modern-cmdk';
import { Command, CommandErrorBoundary } from 'modern-cmdk/react';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type AriaObservation,
  adapters,
  type ItemNode,
  type Json,
  ListHeightResizeObserver,
  mountParity,
  type ParityAdapter,
  type ParityFixture,
  type ParityNode,
  type ParitySession,
  renderServer,
  type SelectHandler,
  unmountParity,
} from './cmdk-parity-adapters.tsx';
import deltaJson from './cmdk-parity-delta.json' with { type: 'json' };

// ---------------------------------------------------------------------------
// Delta table
// ---------------------------------------------------------------------------

interface DeltaRow {
  readonly status: 'same' | 'differs';
  readonly cmdk: Json;
  readonly modernCmdk: Json;
  readonly reason: string;
  readonly ref: string;
}

function parseDelta(raw: unknown): Readonly<Record<string, DeltaRow>> {
  if (typeof raw !== 'object' || raw === null) throw new Error('the delta table is not an object');
  const rows: Record<string, DeltaRow> = {};
  for (const [id, row] of Object.entries(raw)) {
    const { status, cmdk, modernCmdk, reason, ref } = row as Record<string, unknown>;
    if (status !== 'same' && status !== 'differs') {
      throw new Error(`${id}: status "${String(status)}"`);
    }
    if (typeof reason !== 'string' || reason === '') throw new Error(`${id}: reason is empty`);
    if (typeof ref !== 'string' || ref === '') throw new Error(`${id}: ref is empty`);
    rows[id] = { status, cmdk: cmdk as Json, modernCmdk: modernCmdk as Json, reason, ref };
  }
  return rows;
}

const delta = parseDelta(deltaJson);

// ---------------------------------------------------------------------------
// Fixture shorthands
// ---------------------------------------------------------------------------

type ItemOptions = Omit<ItemNode, 'kind' | 'value'>;

const item = (value: string, more: ItemOptions = {}): ItemNode => ({
  kind: 'item',
  value,
  ...more,
});

const group = (heading: string, children: readonly ParityNode[]): ParityNode => ({
  kind: 'group',
  heading,
  children,
});

const separator = (alwaysRender?: boolean): ParityNode =>
  alwaysRender === undefined ? { kind: 'separator' } : { kind: 'separator', alwaysRender };

const empty = (text = 'Nothing found'): ParityNode => ({ kind: 'empty', text });

const plain = (...values: string[]): ParityNode[] => values.map((value) => item(value));

/** Items whose onSelect appends their own value to `log`. */
const selecting = (values: readonly string[], log: string[]): ParityNode[] =>
  values.map((value) => item(value, { onSelect: () => void log.push(value) }));

const FRUITS = ['banana', 'pineapple', 'apple', 'cherry'] as const;

/** Contains the search, and the shorter the value the higher the score (1/length is in (0, 1)). */
const scoreByLength = (value: string, search: string): number =>
  value.includes(search) ? 1 / value.length : 0;

/** The listed attributes of an ARIA observation (null for an absent part, null per absent key). */
function pick(aria: AriaObservation | null, keys: readonly string[]): Json {
  if (aria === null) return null;
  return Object.fromEntries(keys.map((key) => [key, aria[key] ?? null]));
}

const calls = (spy: { readonly mock: { readonly calls: readonly unknown[][] } }): Json =>
  spy.mock.calls.map((call) => [...call] as Json);

const numberedItems = (count: number): ParityNode[] =>
  plain(...Array.from({ length: count }, (_, i) => `item-${String(i).padStart(3, '0')}`));

const ALL_PARTS = [
  'root',
  'input',
  'list',
  'item',
  'group',
  'groupHeading',
  'groupItems',
  'separator',
  'empty',
  'loading',
] as const;

type KeyStep = readonly [key: string, init?: KeyboardEventInit];

/** The active value at the start and after each key press. */
async function activeAfter(session: ParitySession, steps: readonly KeyStep[]): Promise<Json> {
  const seen: Json[] = [session.activeValue()];
  for (const [key, init] of steps) {
    await session.press(key, init);
    seen.push(session.activeValue());
  }
  return seen;
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

interface ParityCase {
  readonly id: string;
  readonly title: string;
  readonly run: (adapter: ParityAdapter) => Promise<Json>;
}

/** The separator is shown before and during a search, for one `alwaysRender` setting. */
const separatorDuringSearch =
  (alwaysRender: boolean | undefined) =>
  async (adapter: ParityAdapter): Promise<Json> => {
    const session = await mountParity(adapter, {
      children: [item('apple'), separator(alwaysRender), item('banana')],
    });
    const atMount = session.separatorShown();
    await session.type('a');
    return { atMount, duringSearch: session.separatorShown() };
  };

/** The active value after wrapping past the last and the first item, for one `loop` setting. */
const loopAtTheEnds =
  (loop: boolean | undefined) =>
  async (adapter: ParityAdapter): Promise<Json> => {
    const session = await mountParity(adapter, {
      root: loop === undefined ? {} : { loop },
      children: plain('apple', 'banana', 'cherry'),
    });
    const downFromLast = await activeAfter(session, [['End'], ['ArrowDown']]);
    const upFromFirst = await activeAfter(session, [['Home'], ['ArrowUp']]);
    return { downFromLast, upFromFirst };
  };

const cases: readonly ParityCase[] = [
  // -- Structure ------------------------------------------------------------------------------
  {
    id: 'component-names',
    title: 'the Command namespace has the same component names and each one renders',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const names = ['Input', 'List', 'Item', 'Group', 'Separator', 'Empty', 'Loading', 'Dialog'];
      const session = await mountParity(adapter, {
        children: [group('Fruits', plain('apple')), separator(), { kind: 'loading', text: 'Wait' }],
      });
      return {
        namespace: Object.fromEntries(names.map((name) => [name, name in adapter.namespace])),
        rendered: session.partsPresent(ALL_PARTS.filter((part) => part !== 'empty')),
      };
    },
  },
  {
    id: 'basic-tree-structure',
    title: 'the canonical tree renders its items in order with the input placeholder',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, {
        input: { placeholder: 'Search...' },
        children: [
          empty('No results found.'),
          ...plain('apple', 'banana'),
          separator(),
          item('cherry'),
        ],
      });
      return {
        shown: session.shownValues(),
        placeholder: session.attribute('input', 'placeholder'),
        separatorShown: session.separatorShown(),
        emptyShown: session.emptyShown(),
      };
    },
  },
  {
    id: 'parts-present',
    title: 'every part renders under its own library name',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, {
        children: [
          group('Fruits', plain('apple')),
          separator(),
          empty(),
          { kind: 'loading', text: 'Loading' },
        ],
      });
      return session.partsPresent(ALL_PARTS);
    },
  },
  {
    id: 'state-attributes',
    title: 'the active and disabled markers are each library’s own attributes',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, {
        children: [item('apple', { disabled: true }), ...plain('banana', 'cherry')],
      });
      return {
        active: session.dataAttributes(session.item('banana')),
        disabled: session.dataAttributes(session.item('apple')),
        plain: session.dataAttributes(session.item('cherry')),
      };
    },
  },
  {
    id: 'large-list-rendered-count',
    title: 'a 150-item list renders every item in cmdk and a window of them in modern-cmdk',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, { children: numberedItems(150) });
      return { rendered: session.shownValues().length };
    },
  },
  {
    id: 'large-list-height-property',
    title: 'a 150-item list keeps its list-height property at the measured height',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, { children: numberedItems(150) });
      return { height: session.listHeight() };
    },
  },
  {
    id: 'list-height-property',
    title: 'T41: Command.List writes --command-list-height from its measured height',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, { children: plain('apple', 'banana') });
      return { height: session.listHeight() };
    },
  },

  // -- ARIA -----------------------------------------------------------------------------------
  {
    id: 'input-aria',
    title: 'the input is a combobox that controls the list',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, { children: plain('apple', 'banana') });
      return pick(session.aria('input'), [
        'role',
        'aria-expanded',
        'aria-autocomplete',
        'aria-controls',
      ]);
    },
  },
  {
    id: 'activedescendant-timing',
    title: 'the input points at the active item from the first render or after the first arrow key',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, { children: plain('apple', 'banana') });
      const atMount = pick(session.aria('input'), ['aria-activedescendant']);
      await session.press('ArrowDown');
      return { atMount, afterArrowDown: pick(session.aria('input'), ['aria-activedescendant']) };
    },
  },
  {
    id: 'root-label',
    title: 'the root label names the palette: a hidden label element or an aria-label',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, {
        root: { label: 'Menu' },
        children: plain('apple'),
      });
      return {
        root: pick(session.aria('root'), ['role', 'aria-label']),
        labelElement: session.part('label')?.textContent ?? null,
        input: pick(session.aria('input'), ['aria-label', 'aria-labelledby']),
      };
    },
  },
  {
    id: 'list-role',
    title: 'the list is a listbox of option items',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, { children: plain('apple') });
      return {
        list: pick(session.aria('list'), ['role']),
        item: pick(session.aria(session.item('apple')), ['role']),
      };
    },
  },
  {
    id: 'list-default-label',
    title: 'the list has a default accessible name',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, { children: plain('apple') });
      return pick(session.aria('list'), ['aria-label']);
    },
  },
  {
    id: 'list-label-prop',
    title: 'a list label becomes the list aria-label',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, {
        list: { label: 'Fruits' },
        children: plain('apple'),
      });
      return pick(session.aria('list'), ['aria-label']);
    },
  },
  {
    id: 'aria-selected-follows-active',
    title: 'aria-selected is true on the active item only and follows the arrow keys',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, { children: plain('apple', 'banana', 'cherry') });
      const selected = (): Json =>
        session.parts('item').map((el) => el.getAttribute('aria-selected'));
      const atMount = selected();
      await session.press('ArrowDown');
      return { atMount, afterArrowDown: selected() };
    },
  },
  {
    id: 'empty-visibility',
    title: 'Empty shows only while no item matches',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, {
        children: [...plain('apple', 'banana'), empty()],
      });
      const atMount = session.emptyShown();
      await session.type('zzz');
      const noMatch = session.emptyShown();
      await session.type('app');
      return { atMount, noMatch, matchAgain: session.emptyShown() };
    },
  },
  {
    id: 'empty-aria',
    title: 'Empty announces itself with its own role',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, { children: [...plain('apple'), empty('None')] });
      await session.type('zzz');
      return { text: session.part('empty')?.textContent ?? null, aria: session.aria('empty') };
    },
  },
  {
    id: 'loading-aria',
    title: 'Loading announces itself with its own role and ARIA',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, {
        children: [...plain('apple'), { kind: 'loading', text: 'Searching' }],
      });
      return { present: session.part('loading') !== null, aria: session.aria('loading') };
    },
  },

  // -- Groups and separators ------------------------------------------------------------------
  {
    id: 'group-aria',
    title: 'a group is labelled by its heading',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, {
        children: [group('Fruits', plain('apple', 'banana'))],
      });
      return {
        group: session.aria('group'),
        heading: {
          text: session.part('groupHeading')?.textContent ?? null,
          aria: session.aria('groupHeading'),
        },
        items: session.aria('groupItems'),
      };
    },
  },
  {
    id: 'group-hidden-no-match',
    title: 'a group with no matching item hides itself',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, {
        children: [group('Fruits', plain('apple', 'banana')), group('Vegetables', plain('carrot'))],
      });
      await session.type('carrot');
      return { shown: session.shownValues(), groups: session.groupStates() };
    },
  },
  {
    id: 'separator-aria',
    title: 'a separator has its own role',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, { children: [...plain('apple'), separator()] });
      return session.aria('separator');
    },
  },
  {
    id: 'separator-default-search',
    title: 'a separator with the default alwaysRender stays or hides during a search',
    run: separatorDuringSearch(undefined),
  },
  {
    id: 'separator-always-render-true',
    title: 'a separator with alwaysRender true stays during a search',
    run: separatorDuringSearch(true),
  },
  {
    id: 'separator-always-render-false',
    title: 'a separator with alwaysRender false hides during a search',
    run: separatorDuringSearch(false),
  },

  // -- Filtering ------------------------------------------------------------------------------
  {
    id: 'filter-by-query',
    title: 'typing filters the items to the matches',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, { children: plain('apple', 'banana', 'cherry') });
      await session.type('ban');
      return { shown: session.shownValues(), active: session.activeValue() };
    },
  },
  {
    id: 'filter-cleared',
    title: 'clearing the search restores every item in source order',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, { children: plain('apple', 'banana', 'cherry') });
      await session.type('ban');
      await session.type('');
      return { shown: session.shownValues(), active: session.activeValue() };
    },
  },
  {
    id: 'filter-ranking-order',
    title: 'the default filter ranks the best match first',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, {
        children: plain('applesauce', 'pineapple', 'apple'),
      });
      await session.type('apple');
      return { shown: session.shownValues(), active: session.activeValue() };
    },
  },
  {
    id: 'first-match-active',
    title: 'the first match becomes the active item after a search',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, { children: plain('apple', 'banana', 'cherry') });
      await session.type('che');
      return session.activeValue();
    },
  },
  {
    id: 'keywords',
    title: 'an item matches its keywords as well as its value',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, {
        children: [
          item('apple', { keywords: ['fruit', 'red'] }),
          item('banana', { keywords: ['fruit', 'yellow'] }),
          item('carrot'),
        ],
      });
      await session.type('yellow');
      const byKeyword = session.shownValues();
      await session.type('fruit');
      const sharedKeyword = session.shownValues();
      await session.type('carrot');
      return { byKeyword, sharedKeyword, byValue: session.shownValues() };
    },
  },
  {
    id: 'custom-filter-ranking',
    title: 'a custom filter keeps the matches and ranks them by score',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, {
        root: { filter: scoreByLength },
        children: plain(...FRUITS),
      });
      await session.type('e');
      const shown = session.shownValues();
      const active = session.activeValue();
      await session.press('ArrowDown');
      const afterArrowDown = session.activeValue();
      await session.press('ArrowDown');
      return { shown, active, afterArrowDown, afterSecondArrowDown: session.activeValue() };
    },
  },
  {
    id: 'custom-filter-exclusion',
    title: 'a custom filter that scores 0 excludes the item',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const filter = (value: string): number =>
        value === 'banana' || value === 'pineapple' ? 0 : 0.5;
      const session = await mountParity(adapter, { root: { filter }, children: plain(...FRUITS) });
      await session.type('x');
      return session.shownValues();
    },
  },
  {
    id: 'custom-filter-arguments',
    title: 'a custom filter receives the value, the search and the keywords',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const received: Json[] = [];
      const filter = (value: string, search: string, keywords?: readonly string[]): number => {
        if (value === 'cherry') received.push([value, search, keywords ? [...keywords] : 'none']);
        return 1;
      };
      const session = await mountParity(adapter, {
        root: { filter },
        children: [item('apple'), item('cherry', { keywords: ['red'] })],
      });
      await session.type('x');
      return { lastCall: received.at(-1) ?? null };
    },
  },
  {
    id: 'filtering-off',
    title: 'with filtering off every item stays shown whatever is typed',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, {
        root: { filter: 'off' },
        children: [...plain('apple', 'banana'), empty()],
      });
      await session.type('zzz');
      return { shown: session.shownValues(), emptyShown: session.emptyShown() };
    },
  },
  {
    id: 'force-mount',
    title: 'forceMount keeps an item shown through a search that does not match it',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, {
        children: [...plain('apple', 'banana'), item('pinned', { forceMount: true })],
      });
      await session.type('app');
      return session.shownValues();
    },
  },

  // -- Keyboard and selection -----------------------------------------------------------------
  {
    id: 'arrow-navigation',
    title: 'the arrow keys move the active item down and up',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, { children: plain('apple', 'banana', 'cherry') });
      return activeAfter(session, [['ArrowDown'], ['ArrowDown'], ['ArrowUp']]);
    },
  },
  {
    id: 'home-end',
    title: 'Home and End jump to the first and last item',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, { children: plain('apple', 'banana', 'cherry') });
      return activeAfter(session, [['End'], ['Home']]);
    },
  },
  {
    id: 'loop-default',
    title: 'without a loop prop the arrow keys stop at the ends or wrap around',
    run: loopAtTheEnds(undefined),
  },
  {
    id: 'loop-true',
    title: 'with loop true the arrow keys wrap around',
    run: loopAtTheEnds(true),
  },
  {
    id: 'loop-false',
    title: 'with loop false the arrow keys stop at the ends',
    run: loopAtTheEnds(false),
  },
  {
    id: 'vim-bindings',
    title: 'Ctrl+N, J, P and K move the active item',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, { children: plain('apple', 'banana', 'cherry') });
      const ctrl = { ctrlKey: true };
      return activeAfter(session, [
        ['n', ctrl],
        ['j', ctrl],
        ['p', ctrl],
        ['k', ctrl],
      ]);
    },
  },
  {
    id: 'modifier-arrows',
    title: 'Alt and Meta with the arrow keys jump between groups and to the ends',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, {
        children: [
          group('A', plain('a1', 'a2')),
          group('B', plain('b1', 'b2')),
          group('C', plain('c1')),
        ],
      });
      return activeAfter(session, [
        ['ArrowDown', { altKey: true }],
        ['ArrowDown', { altKey: true }],
        ['ArrowUp', { altKey: true }],
        ['ArrowDown', { metaKey: true }],
        ['ArrowUp', { metaKey: true }],
      ]);
    },
  },
  {
    id: 'selection-targets',
    title: 'a click selects its item, and Enter selects the active item',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const log: string[] = [];
      const session = await mountParity(adapter, {
        children: selecting(['apple', 'banana', 'cherry'], log),
      });
      await session.click('banana');
      const click = [...log];
      const activeAfterClick = session.activeValue();
      await session.press('ArrowDown');
      await session.press('Enter');
      return { click, activeAfterClick, afterEnter: [...log] };
    },
  },
  {
    id: 'select-callback-arguments',
    title:
      "T06: onSelect receives cmdk's value and no argument in modern-cmdk 1.x, as the delta table records",
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const onSelect = vi.fn<SelectHandler>();
      const session = await mountParity(adapter, {
        children: [item('apple', { onSelect }), item('banana')],
      });
      await session.click('apple');
      const click = calls(onSelect);
      onSelect.mockClear();
      // The first item is active, so Enter selects it
      await session.press('Enter');
      return { click, enter: calls(onSelect) };
    },
  },
  {
    id: 'disabled-items',
    title: 'a disabled item neither selects nor takes the active marker',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const log: string[] = [];
      const session = await mountParity(adapter, {
        children: [
          ...selecting(['apple'], log),
          item('banana', { disabled: true, onSelect: () => void log.push('banana') }),
          ...selecting(['cherry'], log),
        ],
      });
      await session.click('banana');
      const clicked = [...log];
      const active = await activeAfter(session, [['ArrowDown']]);
      await session.press('Enter');
      return { clicked, active, afterEnter: [...log] };
    },
  },
  {
    id: 'pointer-move-activates',
    title: 'moving the pointer over an item makes it active',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, { children: plain('apple', 'banana', 'cherry') });
      await session.hover('cherry');
      return session.activeValue();
    },
  },
  {
    id: 'item-id-prop',
    title: "an item's id prop becomes its DOM id or is overwritten by a generated one",
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, {
        children: [item('apple', { id: 'custom-apple' }), item('banana')],
      });
      return { idIsKept: session.attribute(session.item('apple'), 'id') === 'custom-apple' };
    },
  },
  {
    id: 'group-id-prop',
    title: "a group's id prop becomes its DOM id",
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, {
        children: [
          { kind: 'group', heading: 'Fruits', id: 'custom-group', children: plain('apple') },
        ],
      });
      return { idIsKept: session.attribute('group', 'id') === 'custom-group' };
    },
  },

  // -- Controlled state -----------------------------------------------------------------------
  {
    id: 'input-change-callback',
    title: 'typing calls onValueChange and shows the text',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const onValueChange = vi.fn<(value: string) => void>();
      const session = await mountParity(adapter, {
        input: { onValueChange },
        children: plain('apple', 'banana'),
      });
      await session.type('app');
      return { calls: calls(onValueChange), inputValue: session.inputValue() };
    },
  },
  {
    id: 'input-controlled-value',
    title: 'a controlled input value drives the search and holds against typing the parent ignores',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const onValueChange = vi.fn<(value: string) => void>();
      const tree = (value: string): ParityFixture => ({
        input: { value, onValueChange },
        children: plain('apple', 'banana', 'cherry'),
      });
      const session = await mountParity(adapter, tree('ban'));
      const atMount = { inputValue: session.inputValue(), shown: session.shownValues() };
      await session.type('x');
      const afterTyping = {
        calls: calls(onValueChange),
        inputValue: session.inputValue(),
        shown: session.shownValues(),
      };
      await session.rerender(tree(''));
      return { atMount, afterTyping, afterReset: session.shownValues() };
    },
  },
  {
    id: 'root-controlled-active-value',
    title: 'a controlled root active value gets the next item and then follows it or holds',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const onChange = vi.fn<(key: string) => void>();
      const session = await mountParity(adapter, {
        root: { active: { value: 'banana', onChange } },
        children: ['apple', 'banana', 'cherry'].map((value) => item(value, { id: value })),
      });
      const atMount = session.activeValue();
      await session.press('ArrowDown');
      return { atMount, calls: calls(onChange), afterArrowDown: session.activeValue() };
    },
  },

  // -- Dialog ---------------------------------------------------------------------------------
  {
    id: 'dialog-open-structure',
    title: 'an open Dialog renders its overlay and content with the palette inside',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, {
        dialog: { open: true, label: 'Menu' },
        children: plain('apple'),
      });
      const dialog = session.part('dialog');
      const root = session.part('root');
      return {
        present: session.partsPresent(['dialog', 'overlay', 'root', 'input', 'list', 'item']),
        rootInsideDialog: Boolean(dialog && root && dialog.contains(root)),
        shown: session.shownValues(),
      };
    },
  },
  {
    id: 'dialog-aria',
    title: 'the Dialog and its root carry their own roles and names',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, {
        dialog: { open: true, label: 'Menu' },
        children: plain('apple'),
      });
      return { dialog: session.aria('dialog'), root: session.aria('root') };
    },
  },
  {
    id: 'dialog-closed',
    title: 'a closed Dialog renders nothing',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const session = await mountParity(adapter, {
        dialog: { open: false },
        children: plain('apple'),
      });
      return session.partsPresent(['dialog', 'overlay', 'root', 'input', 'item']);
    },
  },
  {
    id: 'dialog-overlay-dismiss',
    title: 'a click on the overlay asks to close the Dialog',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const onOpenChange = vi.fn<(open: boolean) => void>();
      const session = await mountParity(adapter, {
        dialog: { open: true, onOpenChange },
        children: plain('apple'),
      });
      await session.clickPart('overlay');
      return calls(onOpenChange);
    },
  },
  {
    id: 'dialog-escape-reports',
    title: 'Escape asks to close the controlled Dialog',
    run: async (adapter: ParityAdapter): Promise<Json> => {
      const onOpenChange = vi.fn<(open: boolean) => void>();
      const session = await mountParity(adapter, {
        dialog: { open: true, onOpenChange },
        children: plain('apple'),
      });
      await session.pressEscapeOnDocument();
      return calls(onOpenChange);
    },
  },

  // -- Server-rendered HTML -------------------------------------------------------------------
  {
    id: 'server-items',
    title: 'the server-rendered HTML lists every item',
    run: (adapter: ParityAdapter): Promise<Json> => {
      const session = renderServer(adapter, {
        children: [group('Fruits', plain('apple', 'banana')), item('cherry')],
      });
      return Promise.resolve(session.shownTexts());
    },
  },
  {
    id: 'server-empty-text',
    title: 'the server-rendered HTML carries the Empty text or leaves it out',
    run: (adapter: ParityAdapter): Promise<Json> => {
      const session = renderServer(adapter, { children: [...plain('apple'), empty()] });
      return Promise.resolve({
        emptyShown: session.emptyShown(),
        containsEmptyText: session.scope.textContent?.includes('Nothing found') ?? false,
      });
    },
  },
];

// ---------------------------------------------------------------------------
// The differential harness
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ListHeightResizeObserver);
});

// Unmounting inside act() flushes React's passive-effects task before Vitest tears the window down
afterEach(async () => {
  await unmountParity();
  vi.unstubAllGlobals();
});

describe.for(adapters)('$name', (adapter) => {
  for (const parityCase of cases) {
    it(parityCase.title, async () => {
      // The JSON round trip is what a table row stores: it drops undefined as JSON does
      const observation = JSON.parse(JSON.stringify(await parityCase.run(adapter))) as Json;
      const row = delta[parityCase.id];
      if (!row) throw new Error(`the delta table has no row for "${parityCase.id}"`);
      expect(observation).toEqual(row[adapter.key]);
      // A 'same' row holds two equal observations and a 'differs' row two unequal ones
      expect(isDeepStrictEqual(row.modernCmdk, row.cmdk)).toBe(row.status === 'same');
    });
  }
});

it('the delta table has exactly one row per parity case', () => {
  const ids = cases.map((parityCase) => parityCase.id);
  expect(new Set(ids).size).toBe(ids.length);
  // Ordered: the table lists its rows in case order
  expect(Object.keys(delta)).toEqual(ids);
});

// ---------------------------------------------------------------------------
// modern-cmdk features that have no cmdk counterpart: they cannot be differential
// ---------------------------------------------------------------------------

describe('modern-cmdk superset', () => {
  let container: HTMLDivElement;
  let root: Root;

  const nextFrame = (): Promise<void> =>
    new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  async function render(ui: ReactNode): Promise<void> {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(ui);
    });
    await act(async () => await nextFrame());
  }

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container?.remove();
  });

  describe('framework-agnostic core engine', () => {
    it('SEARCH_CHANGE is queued and applied one frame later, without React', async () => {
      using machine = createCommandMachine();
      const registry = machine.getRegistry();
      registry.registerItem({ id: itemId('apple'), value: 'Apple', keywords: [], disabled: false });
      registry.registerItem({
        id: itemId('banana'),
        value: 'Banana',
        keywords: [],
        disabled: false,
      });

      machine.send({ type: 'SEARCH_CHANGE', query: 'app' });
      expect(machine.getState().search).toBe(''); // queued, not applied yet
      await nextFrame();
      expect(machine.getState().search).toBe('app');
    });

    it('subscribers hear the batch one frame later and not after unsubscribing', async () => {
      using machine = createCommandMachine();
      const callback = vi.fn();
      const unsubscribe = machine.subscribe(callback);
      machine.send({ type: 'SEARCH_CHANGE', query: 'test' });
      expect(callback).not.toHaveBeenCalled();
      await nextFrame();
      expect(callback).toHaveBeenCalled();

      unsubscribe();
      callback.mockClear();
      machine.send({ type: 'SEARCH_CHANGE', query: 'other' });
      await nextFrame();
      expect(callback).not.toHaveBeenCalled();
    });

    it('a disposed machine tells its subscribers nothing more', async () => {
      const callback = vi.fn();
      {
        using machine = createCommandMachine();
        machine.subscribe(callback);
        machine.send({ type: 'SEARCH_CHANGE', query: 'queued' });
      }
      await nextFrame();
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('pluggable search engine', () => {
    it('scoreItem scores an item against a query', () => {
      const item: CoreCommandItem = {
        id: itemId('test'),
        value: 'Application Settings',
        keywords: ['config', 'preferences'],
        disabled: false,
      };
      const result = scoreItem('app', item);
      expect(result?.score).toBeGreaterThan(0);
      expect(result?.id).toBe(item.id);
    });

    it('scoreItem returns match ranges for highlighting', () => {
      const item: CoreCommandItem = {
        id: itemId('test'),
        value: 'Application',
        keywords: [],
        disabled: false,
      };
      const result = scoreItem('app', item);
      expect(result?.matches.length).toBeGreaterThan(0);
      // The first match starts at position 0 of "Application"
      expect(result?.matches[0]?.[0]).toBe(0);
    });

    it('a search engine indexes items and searches them', () => {
      using engine = createSearchEngine();
      const items: CoreCommandItem[] = [
        { id: itemId('a'), value: 'Application', keywords: [], disabled: false },
        { id: itemId('b'), value: 'Banana', keywords: [], disabled: false },
      ];
      engine.index(items);
      const results = engine.search('app', items).toArray();
      expect(results.map((result) => result.id)).toEqual([itemId('a')]);
    });
  });

  describe('keyboard shortcut registry', () => {
    it('parseShortcut normalizes the key to lowercase', () => {
      expect(parseShortcut('Ctrl+Shift+K').key).toBe('k');
    });

    it('formatShortcut writes a parsed shortcut back', () => {
      expect(formatShortcut(parseShortcut('Ctrl+K'))).toContain('K');
    });

    it('matchesShortcut matches a keyboard event against a shortcut', () => {
      const shortcut = parseShortcut('Ctrl+K');
      expect(
        matchesShortcut(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }), shortcut),
      ).toBe(true);
    });

    it('matchesShortcut rejects an event whose modifiers differ', () => {
      const shortcut = parseShortcut('Ctrl+K');
      const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: false, shiftKey: true });
      expect(matchesShortcut(event, shortcut)).toBe(false);
    });

    it('detectConflicts reports a repeated shortcut', () => {
      const conflicts = detectConflicts([parseShortcut('Ctrl+K'), parseShortcut('Ctrl+K')]);
      expect(conflicts.size).toBeGreaterThan(0);
    });
  });

  describe('frecency engine', () => {
    it('a used item earns a bonus', () => {
      const now = Date.now();
      const record: FrecencyRecord = { frequency: 5, lastUsed: now };
      expect(computeFrecencyBonus(record, now)).toBeGreaterThan(0);
    });

    it('a recently used item earns more than one used 30 days ago', () => {
      const now = Date.now();
      const recent = computeFrecencyBonus({ frequency: 1, lastUsed: now }, now);
      const old = computeFrecencyBonus({ frequency: 1, lastUsed: now - 720 * 3_600_000 }, now);
      expect(recent).toBeGreaterThan(old);
    });

    it('a frequently used item earns more than a rarely used one', () => {
      const now = Date.now();
      const hourAgo = now - 3_600_000;
      const frequent = computeFrecencyBonus({ frequency: 10, lastUsed: hourAgo }, now);
      const rare = computeFrecencyBonus({ frequency: 1, lastUsed: hourAgo }, now);
      expect(frequent).toBeGreaterThan(rare);
    });
  });

  describe('branded ids', () => {
    it('itemId returns the string it is given', () => {
      expect(itemId('my-item')).toBe('my-item');
    });

    it('groupId returns the string it is given', () => {
      expect(groupId('my-group')).toBe('my-group');
    });
  });

  describe('components', () => {
    it('Command.Page renders only the active page, "root" by default', async () => {
      await render(
        <Command>
          <Command.Input />
          <Command.List>
            <Command.Page id="root">
              <Command.Item value="dashboard">Dashboard</Command.Item>
            </Command.Page>
            <Command.Page id="settings">
              <Command.Item value="profile">Profile</Command.Item>
            </Command.Page>
          </Command.List>
        </Command>,
      );
      expect(container.querySelector('[data-command-page-id="root"]')).not.toBeNull();
      expect(container.querySelector('[data-command-page-id="settings"]')).toBeNull();
    });

    it('Command.Highlight wraps a match range in a mark with the class', async () => {
      await render(
        <Command.Highlight text="Application" ranges={[[0, 3]]} highlightClassName="hl" />,
      );
      const marks = container.querySelectorAll('mark');
      expect(marks.length).toBe(1);
      expect(marks[0]?.textContent).toBe('App');
      expect(marks[0]?.className).toBe('hl');
    });

    it('Command.Highlight marks several non-overlapping ranges', async () => {
      await render(
        <Command.Highlight
          text="Hello World"
          ranges={[
            [0, 2],
            [6, 11],
          ]}
        />,
      );
      const marks = container.querySelectorAll('mark');
      expect(marks.length).toBe(2);
      expect(marks[0]?.textContent).toBe('He');
      expect(marks[1]?.textContent).toBe('World');
    });

    it('Command.Highlight renders plain text when there are no ranges', async () => {
      await render(<Command.Highlight text="No highlights" ranges={[]} />);
      expect(container.querySelectorAll('mark').length).toBe(0);
      expect(container.textContent).toBe('No highlights');
    });

    it('Command.Shortcut renders a kbd element', async () => {
      await render(<Command.Shortcut>Ctrl+K</Command.Shortcut>);
      const kbd = container.querySelector('kbd');
      expect(kbd?.getAttribute('data-command-shortcut')).toBe('');
      expect(kbd?.textContent).toBe('Ctrl+K');
    });

    it('Command.Badge renders a span with data-command-badge', async () => {
      await render(<Command.Badge className="tag">New</Command.Badge>);
      const badge = container.querySelector('[data-command-badge]');
      expect(badge?.tagName).toBe('SPAN');
      expect(badge?.textContent).toBe('New');
    });

    it('CommandErrorBoundary renders its children when nothing throws', async () => {
      await render(
        <CommandErrorBoundary fallback={<div>Error!</div>}>
          <div data-testid="child">OK</div>
        </CommandErrorBoundary>,
      );
      expect(container.querySelector('[data-testid="child"]')?.textContent).toBe('OK');
      expect(container.textContent).not.toContain('Error!');
    });

    it('Command.Loading renders nothing while its loading prop is false', async () => {
      await render(
        <Command>
          <Command.Input />
          <Command.List>
            <Command.Loading loading={false}>Hidden</Command.Loading>
          </Command.List>
        </Command>,
      );
      expect(container.querySelector('[data-command-loading]')).toBeNull();
    });

    it('a modern-cmdk filter excludes an item scored false, 0 or negative', async () => {
      const received: Array<readonly [string, string]> = [];
      const filter = (item: CoreCommandItem, query: string): number | false => {
        received.push([item.value, query]);
        if (item.value === 'banana') return false;
        if (item.value === 'pineapple') return 0;
        if (item.value === 'apple') return -1;
        return 0.5;
      };
      await render(
        <Command filter={filter}>
          <Command.Input />
          <Command.List>
            {FRUITS.map((fruit) => (
              <Command.Item key={fruit} value={fruit}>
                {fruit}
              </Command.Item>
            ))}
          </Command.List>
        </Command>,
      );
      const input = container.querySelector('input') as HTMLInputElement;
      await act(async () => {
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        set?.call(input, 'x');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => await nextFrame());
      const shown = [...container.querySelectorAll('[data-command-item]')];
      expect(shown.map((el) => el.textContent)).toEqual(['cherry']);
      // The function receives the whole item and the raw query
      expect(received).toContainEqual(['cherry', 'x']);
    });
  });
});
