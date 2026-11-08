// tests/unit/disabled-matrix.test.ts
// The disabled-items contract (ruling R2): queries {empty, non-empty, filter: false} x option {omitted, show, hide}
// x {filteredIds, first active, NAVIGATE, ITEM_ACTIVATE, ITEM_SELECT}. The React half (aria-disabled, data-disabled,
// DOM rendering) lives in command.test.tsx and cmdk-comparison.test.tsx.

import type { CommandItem, CommandMachineOptions, ItemId, SearchEngine } from 'modern-cmdk';
import { createCommandMachine, itemId } from 'modern-cmdk';
import { describe, expect, it, type Mock, vi } from 'vitest';

type Option = 'omitted' | 'show' | 'hide';

/** Let the scheduler run every queued event and the batch commit. */
async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

// d* are disabled, e*/banana are enabled; the first and the middle of the list are disabled.
const IDS = {
  d0: itemId('d0'),
  e1: itemId('e1'),
  d2: itemId('d2'),
  e3: itemId('e3'),
  d4: itemId('d4'),
  banana: itemId('banana'),
};
const DISABLED = new Set<ItemId>([IDS.d0, IDS.d2, IDS.d4]);

interface Setup {
  readonly itemSelect: Mock<() => void>;
  readonly onSelect: Mock<(id: ItemId) => void>;
  readonly onActiveChange: Mock<(id: ItemId | null) => void>;
  readonly items: readonly CommandItem[];
}

function setup(): Setup {
  const itemSelect = vi.fn<() => void>();
  const mk = (key: keyof typeof IDS, value: string): CommandItem => ({
    id: IDS[key],
    value,
    disabled: DISABLED.has(IDS[key]),
    onSelect: itemSelect,
  });
  return {
    itemSelect,
    onSelect: vi.fn<(id: ItemId) => void>(),
    onActiveChange: vi.fn<(id: ItemId | null) => void>(),
    items: [
      mk('d0', 'Apple'),
      mk('e1', 'Apple Pie'),
      mk('d2', 'Apple Tart'),
      mk('e3', 'Apple Crumble'),
      mk('d4', 'Apple Cake'),
      mk('banana', 'Banana'),
    ],
  };
}

function optionsFor(option: Option): Pick<CommandMachineOptions, 'disabledItems'> {
  return option === 'omitted' ? {} : { disabledItems: option };
}

const SHOW_ALL: ItemId[] = [IDS.d0, IDS.e1, IDS.d2, IDS.e3, IDS.d4, IDS.banana];
const HIDE_ALL: ItemId[] = [IDS.e1, IDS.e3, IDS.banana];

const APPLES: ItemId[] = [IDS.d0, IDS.e1, IDS.d2, IDS.e3, IDS.d4];

// `ordered`: the expected ids are in list order; for a real query the score decides the order, so only the set is exact.
const QUERIES = [
  {
    name: 'empty query',
    query: '',
    filter: undefined,
    ordered: true,
    show: SHOW_ALL,
    hide: HIDE_ALL,
  },
  {
    name: 'filter: false',
    query: 'apple',
    filter: false as const,
    ordered: true,
    show: SHOW_ALL,
    hide: HIDE_ALL,
  },
  {
    name: 'non-empty query',
    query: 'apple',
    filter: undefined,
    ordered: false,
    show: APPLES,
    hide: [IDS.e1, IDS.e3],
  },
] as const;

describe('disabledItems matrix', () => {
  describe.each(QUERIES)('$name', ({ query, filter, ordered, show, hide }) => {
    describe.each(['omitted', 'show', 'hide'] as const)('disabledItems %s', (option) => {
      async function make(): Promise<{
        s: Setup;
        machine: ReturnType<typeof createCommandMachine>;
      }> {
        const s = setup();
        const machine = createCommandMachine({
          items: s.items,
          onSelect: s.onSelect,
          onActiveChange: s.onActiveChange,
          ...(filter === false && { filter }),
          ...optionsFor(option),
        });
        if (query !== '') {
          machine.send({ type: 'SEARCH_CHANGE', query });
          await flush();
        }
        return { s, machine };
      }

      const enabledOf = (ids: readonly ItemId[]): ItemId[] => ids.filter((id) => !DISABLED.has(id));

      it('lists disabled items in filteredIds under show/omitted, drops them under hide', async () => {
        const { machine } = await make();
        using _m = machine;
        const ids = machine.getState().filteredIds;
        const expected = option === 'hide' ? hide : show;
        // Banana is not an apple: under the query it is absent, under the other branches it is listed (in `expected`)
        expect(ordered ? ids : ids.toSorted()).toEqual(ordered ? expected : expected.toSorted());
        expect(machine.getState().filteredCount).toBe(ids.length);
        expect([...machine.getFilteredIdSet()]).toEqual(ids);
        expect([...machine.getFilteredIdIndex().keys()]).toEqual(ids);
      });

      it('the first active item is the first enabled one, never a disabled one', async () => {
        const { machine } = await make();
        using _m = machine;
        const { filteredIds, activeId } = machine.getState();
        // Precondition: under show a disabled item is listed first ("Apple" outranks the rest under the query), so
        // activating filteredIds[0] (the old behaviour) would make a disabled item active
        expect(DISABLED.has(filteredIds[0] as ItemId)).toBe(option !== 'hide');
        expect(activeId).toBe(enabledOf(filteredIds)[0]);
        expect(DISABLED.has(activeId as ItemId)).toBe(false);
      });

      it('NAVIGATE first/last/next/prev lands only on enabled items and wraps around', async () => {
        const { s, machine } = await make();
        using _m = machine;
        const en = enabledOf(machine.getState().filteredIds);
        const active = (): ItemId | null => machine.getState().activeId;

        machine.send({ type: 'NAVIGATE', direction: 'last' });
        await flush();
        expect(active()).toBe(en.at(-1));

        machine.send({ type: 'NAVIGATE', direction: 'next' }); // loop wrap
        await flush();
        expect(active()).toBe(en[0]);

        machine.send({ type: 'NAVIGATE', direction: 'prev' }); // loop wrap back
        await flush();
        expect(active()).toBe(en.at(-1));

        machine.send({ type: 'NAVIGATE', direction: 'first' });
        await flush();
        expect(active()).toBe(en[0]);

        const visited: (ItemId | null)[] = [active()];
        for (let i = 1; i < en.length; i++) {
          machine.send({ type: 'NAVIGATE', direction: 'next' });
          await flush();
          visited.push(active());
        }
        expect(visited).toEqual(en);

        for (let i = en.length - 2; i >= 0; i--) {
          machine.send({ type: 'NAVIGATE', direction: 'prev' });
          await flush();
          expect(active()).toBe(en[i]);
        }
        // Every active change reported to the caller was an enabled item.
        expect(s.onActiveChange).toHaveBeenCalled();
        for (const [id] of s.onActiveChange.mock.calls)
          expect(DISABLED.has(id as ItemId)).toBe(false);
      });

      it('ITEM_ACTIVATE on a disabled id is ignored, on an enabled id it activates', async () => {
        const { s, machine } = await make();
        using _m = machine;
        const en = enabledOf(machine.getState().filteredIds);
        const before = machine.getState().activeId;
        s.onActiveChange.mockClear();

        for (const id of DISABLED) {
          machine.send({ type: 'ITEM_ACTIVATE', id });
          await flush();
          expect(machine.getState().activeId).toBe(before);
        }
        expect(s.onActiveChange).not.toHaveBeenCalled();

        const target = en.at(-1) as ItemId;
        machine.send({ type: 'ITEM_ACTIVATE', id: target });
        await flush();
        expect(machine.getState().activeId).toBe(target);
      });

      it('ITEM_SELECT on a disabled id calls no onSelect; on an enabled id it does', async () => {
        const { s, machine } = await make();
        using _m = machine;
        for (const id of DISABLED) {
          machine.send({ type: 'ITEM_SELECT', id });
        }
        await flush();
        expect(s.itemSelect).not.toHaveBeenCalled();
        expect(s.onSelect).not.toHaveBeenCalled();

        machine.send({ type: 'ITEM_SELECT', id: IDS.e1 });
        await flush();
        expect(s.itemSelect).toHaveBeenCalledOnce();
        expect(s.onSelect).toHaveBeenCalledExactlyOnceWith(IDS.e1);
      });
    });
  });

  describe('a search engine that searches its own index and ignores the items it is handed', () => {
    function ownIndexEngine(): SearchEngine {
      let indexed: readonly CommandItem[] = [];
      return {
        index: (items: readonly CommandItem[]): void => {
          indexed = [...indexed, ...items];
        },
        // Searches `indexed` only: the `items` argument (the machine's candidates) is ignored
        search: (query: string) =>
          indexed
            .values()
            .filter((i) => i.value.toLowerCase().includes(query))
            .map((i) => ({ id: i.id, score: 1, matches: [] })),
        remove: () => undefined,
        clear: () => undefined,
        [Symbol.dispose]: () => undefined,
      };
    }

    it.each([
      ['show', [IDS.d0, IDS.e1, IDS.d2, IDS.e3, IDS.d4]],
      ['hide', [IDS.e1, IDS.e3]],
    ] as const)('disabledItems %s under a query lists %j', async (option, expected) => {
      const s = setup();
      using machine = createCommandMachine({
        items: s.items,
        search: ownIndexEngine(),
        disabledItems: option,
      });
      machine.send({ type: 'SEARCH_CHANGE', query: 'apple' });
      await flush();
      expect(machine.getState().filteredIds).toEqual(expected);
      expect(machine.getState().activeId).toBe(IDS.e1);
    });
  });

  describe('edges', () => {
    it('all items disabled: activeId is null, NAVIGATE and ITEM_ACTIVATE do nothing (show), nothing is listed (hide)', async () => {
      const items: CommandItem[] = [
        { id: IDS.d0, value: 'One', disabled: true },
        { id: IDS.d2, value: 'Two', disabled: true },
      ];
      using shown = createCommandMachine({ items, disabledItems: 'show' });
      expect(shown.getState().filteredIds).toEqual([IDS.d0, IDS.d2]);
      expect(shown.getState().activeId).toBeNull();
      for (const direction of ['next', 'prev', 'first', 'last'] as const) {
        shown.send({ type: 'NAVIGATE', direction });
      }
      shown.send({ type: 'ITEM_ACTIVATE', id: IDS.d0 });
      await flush();
      expect(shown.getState().activeId).toBeNull();

      using hidden = createCommandMachine({ items, disabledItems: 'hide' });
      expect(hidden.getState().filteredIds).toEqual([]);
      expect(hidden.getState().activeId).toBeNull();
    });

    it('disabled items at both ends are skipped by first/last/next/prev, with and without loop', async () => {
      const items: CommandItem[] = [
        { id: IDS.d0, value: 'A', disabled: true },
        { id: IDS.e1, value: 'B' },
        { id: IDS.e3, value: 'C' },
        { id: IDS.d4, value: 'D', disabled: true },
      ];
      for (const loop of [true, false]) {
        using machine = createCommandMachine({ items, loop });
        const active = (): ItemId | null => machine.getState().activeId;
        expect(active()).toBe(IDS.e1);

        machine.send({ type: 'NAVIGATE', direction: 'last' });
        await flush();
        expect(active()).toBe(IDS.e3);

        machine.send({ type: 'NAVIGATE', direction: 'next' });
        await flush();
        expect(active()).toBe(loop ? IDS.e1 : IDS.e3);

        machine.send({ type: 'NAVIGATE', direction: 'first' });
        await flush();
        expect(active()).toBe(IDS.e1);

        machine.send({ type: 'NAVIGATE', direction: 'prev' });
        await flush();
        expect(active()).toBe(loop ? IDS.e3 : IDS.e1);
      }
    });

    it('an active item that becomes disabled is replaced by the first enabled item', async () => {
      const s = setup();
      using machine = createCommandMachine({ items: s.items, onActiveChange: s.onActiveChange });
      machine.send({ type: 'ITEM_ACTIVATE', id: IDS.e3 });
      await flush();
      expect(machine.getState().activeId).toBe(IDS.e3);

      machine.send({
        type: 'REGISTER_ITEM',
        item: { id: IDS.e3, value: 'Apple Crumble', disabled: true },
      });
      await flush();
      expect(machine.getState().filteredIds).toContain(IDS.e3);
      expect(machine.getState().activeId).toBe(IDS.e1);

      // Re-registering d0 as enabled puts an enabled item first in the list, but the active item e1 is still
      // listed and enabled: it is kept, not replaced by the first item.
      machine.send({ type: 'REGISTER_ITEM', item: { id: IDS.d0, value: 'Apple' } });
      await flush();
      expect(machine.getState().activeId).toBe(IDS.e1);
    });

    it('an active item that is disabled while hidden leaves the list and the first enabled item is active', async () => {
      const s = setup();
      using machine = createCommandMachine({ items: s.items, disabledItems: 'hide' });
      machine.send({ type: 'ITEM_ACTIVATE', id: IDS.e3 });
      await flush();
      machine.send({
        type: 'REGISTER_ITEM',
        item: { id: IDS.e3, value: 'Apple Crumble', disabled: true },
      });
      await flush();
      expect(machine.getState().filteredIds).not.toContain(IDS.e3);
      expect(machine.getState().activeId).toBe(IDS.e1);
    });
  });
});
