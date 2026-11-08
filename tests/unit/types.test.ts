import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  CommandEvent,
  CommandItem,
  CommandMachine,
  CommandMachineOptions,
  CommandState,
  FrecencyDecayConfig,
  FrecencyStorage,
  GroupId,
  ItemId,
  SearchEngine,
} from 'modern-cmdk';
import {
  createCommandMachine,
  createInitialState,
  createSearchEngine,
  DEFAULT_FRECENCY_DECAY,
  DEFAULT_MACHINE_OPTIONS,
  groupId,
  itemId,
  MemoryFrecencyStorage,
  scoreItem,
} from 'modern-cmdk';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

describe('Type Foundation', () => {
  describe('Branded types', () => {
    it('should have ItemId as a branded string type', () => {
      const id = itemId('test');
      expectTypeOf(id).toExtend<ItemId>();
      expectTypeOf(id).toExtend<string>();
      expect(typeof id).toBe('string');
      expect(id).toBe('test');
    });

    it('should have GroupId as a branded string type', () => {
      const id = groupId('test');
      expectTypeOf(id).toExtend<GroupId>();
      expectTypeOf(id).toExtend<string>();
      expect(typeof id).toBe('string');
      expect(id).toBe('test');
    });

    it('should prevent mixing ItemId and GroupId', () => {
      const item = itemId('a');
      const group = groupId('b');
      // These are structurally different due to unique symbol brands
      expectTypeOf(item).not.toEqualTypeOf(group);
      // At runtime a brand is just the string: distinct inputs stay distinct
      expect([item, group]).toEqual(['a', 'b']);
    });
  });

  describe('CommandState', () => {
    it('should have correct shape', () => {
      expectTypeOf<CommandState>().toHaveProperty('search');
      expectTypeOf<CommandState>().toHaveProperty('activeId');
      expectTypeOf<CommandState>().toHaveProperty('filteredIds');
      expectTypeOf<CommandState>().toHaveProperty('groupedIds');
      expectTypeOf<CommandState>().toHaveProperty('filteredCount');
      expectTypeOf<CommandState>().toHaveProperty('loading');
      expectTypeOf<CommandState>().toHaveProperty('page');
      expectTypeOf<CommandState>().toHaveProperty('pageStack');
      expectTypeOf<CommandState>().toHaveProperty('open');
      expectTypeOf<CommandState>().toHaveProperty('lastUpdated');
      expect(Object.keys(createInitialState())).toEqual(
        expect.arrayContaining([
          'search',
          'activeId',
          'filteredIds',
          'groupedIds',
          'filteredCount',
          'loading',
          'page',
          'pageStack',
          'open',
          'lastUpdated',
        ]),
      );
    });

    it('should use number for lastUpdated (epoch ms)', () => {
      expectTypeOf<CommandState['lastUpdated']>().toEqualTypeOf<number>();
      expect(typeof createInitialState().lastUpdated).toBe('number');
    });

    it('should use ReadonlyMap for groupedIds', () => {
      expectTypeOf<CommandState['groupedIds']>().toExtend<
        ReadonlyMap<GroupId, readonly ItemId[]>
      >();
      expect(createInitialState().groupedIds).toBeInstanceOf(Map);
    });
  });

  describe('CommandEvent', () => {
    it('should be a discriminated union on type', async () => {
      const searchEvent: CommandEvent = { type: 'SEARCH_CHANGE', query: 'test' };
      const selectEvent: CommandEvent = { type: 'ITEM_SELECT', id: itemId('x') };
      const navEvent: CommandEvent = { type: 'NAVIGATE', direction: 'next' };
      const openEvent: CommandEvent = { type: 'OPEN' };
      const closeEvent: CommandEvent = { type: 'CLOSE' };
      const toggleEvent: CommandEvent = { type: 'TOGGLE' };

      expectTypeOf(searchEvent).toExtend<CommandEvent>();
      expectTypeOf(selectEvent).toExtend<CommandEvent>();
      expectTypeOf(navEvent).toExtend<CommandEvent>();
      expectTypeOf(openEvent).toExtend<CommandEvent>();
      expectTypeOf(closeEvent).toExtend<CommandEvent>();
      expectTypeOf(toggleEvent).toExtend<CommandEvent>();
      using machine = createCommandMachine();
      machine.send(searchEvent);
      machine.send(openEvent);
      await vi.waitFor(() => {
        expect(machine.getState().search).toBe('test');
        expect(machine.getState().open).toBe(true);
      });
    });

    it('should list all 16 event variants in the type discriminant', () => {
      expectTypeOf<CommandEvent['type']>().toEqualTypeOf<
        | 'SEARCH_CHANGE'
        | 'ITEM_SELECT'
        | 'ITEM_ACTIVATE'
        | 'NAVIGATE'
        | 'PAGE_PUSH'
        | 'PAGE_POP'
        | 'OPEN'
        | 'CLOSE'
        | 'TOGGLE'
        | 'ITEMS_LOADED'
        | 'LOADING'
        | 'REGISTER_ITEM'
        | 'UPDATE_ITEM'
        | 'UNREGISTER_ITEM'
        | 'REGISTER_GROUP'
        | 'UNREGISTER_GROUP'
      >();
      // Runtime mirror of the union: `satisfies` keeps every entry a valid discriminant
      const variants = [
        'SEARCH_CHANGE',
        'ITEM_SELECT',
        'ITEM_ACTIVATE',
        'NAVIGATE',
        'PAGE_PUSH',
        'PAGE_POP',
        'OPEN',
        'CLOSE',
        'TOGGLE',
        'ITEMS_LOADED',
        'LOADING',
        'REGISTER_ITEM',
        'UPDATE_ITEM',
        'UNREGISTER_ITEM',
        'REGISTER_GROUP',
        'UNREGISTER_GROUP',
      ] as const satisfies readonly CommandEvent['type'][];
      const machineSource = readFileSync(
        join(import.meta.dirname, '../../packages/modern-cmdk/src/core/machine.ts'),
        'utf8',
      );
      const handled = [...machineSource.matchAll(/case '([A-Z_]+)':/g)].map(([, type]) => type);
      expect(handled.toSorted()).toEqual([...variants].toSorted());
    });
  });

  describe('CommandItem', () => {
    it('should have readonly properties', () => {
      // Readonly<T> only differs from T when some property is mutable
      expectTypeOf<CommandItem>().toEqualTypeOf<Readonly<CommandItem>>();
      expectTypeOf<CommandItem['id']>().toEqualTypeOf<ItemId>();
      expectTypeOf<CommandItem['value']>().toEqualTypeOf<string>();
      const item: CommandItem = { id: itemId('a'), value: 'Alpha' };
      expect(item).toEqual({ id: 'a', value: 'Alpha' });
    });

    it('should have optional properties with undefined union', () => {
      expectTypeOf<CommandItem['keywords']>().toEqualTypeOf<readonly string[] | undefined>();
      const bare: CommandItem = { id: itemId('a'), value: 'Alpha' };
      const tagged: CommandItem = { id: itemId('b'), value: 'Beta', keywords: ['x'] };
      expect(scoreItem('x', bare)).toBeNull();
      expect(scoreItem('x', tagged)?.score).toBe(1); // exact keyword match
    });
  });

  describe('CommandMachineOptions', () => {
    it('should type onSelect as an optional (id: ItemId) => void callback', async () => {
      expectTypeOf<CommandMachineOptions['onSelect']>().toEqualTypeOf<
        ((id: ItemId) => void) | undefined
      >();
      expectTypeOf<Parameters<NonNullable<CommandMachineOptions['onSelect']>>>().toEqualTypeOf<
        [id: ItemId]
      >();
      const onSelect = vi.fn<(id: ItemId) => void>();
      using machine = createCommandMachine({ onSelect });
      machine.send({ type: 'REGISTER_ITEM', item: { id: itemId('picked'), value: 'Picked' } });
      machine.send({ type: 'ITEM_SELECT', id: itemId('picked') });
      await vi.waitFor(() => expect(onSelect).toHaveBeenCalledExactlyOnceWith('picked'));
    });

    it("should type disabledItems as an optional 'hide' | 'show'", () => {
      expectTypeOf<CommandMachineOptions['disabledItems']>().toEqualTypeOf<
        'hide' | 'show' | undefined
      >();
      expect(createCommandMachine({ disabledItems: 'hide' })[Symbol.dispose]()).toBeUndefined();
    });
  });

  describe('FrecencyDecayConfig', () => {
    it('should have optional weight properties', () => {
      expectTypeOf<FrecencyDecayConfig>().toHaveProperty('hourWeight');
      expectTypeOf<FrecencyDecayConfig>().toHaveProperty('dayWeight');
      expectTypeOf<FrecencyDecayConfig>().toHaveProperty('weekWeight');
      expectTypeOf<FrecencyDecayConfig>().toHaveProperty('monthWeight');
      expectTypeOf<FrecencyDecayConfig>().toHaveProperty('olderWeight');
      expect(Object.keys(DEFAULT_FRECENCY_DECAY).sort()).toEqual([
        'dayWeight',
        'hourWeight',
        'monthWeight',
        'olderWeight',
        'weekWeight',
      ]);
    });
  });

  describe('Default values with satisfies', () => {
    it('DEFAULT_FRECENCY_DECAY should satisfy Required<FrecencyDecayConfig>', () => {
      expectTypeOf(DEFAULT_FRECENCY_DECAY).toExtend<Required<FrecencyDecayConfig>>();
      // Vitest — soft assertions to report all mismatched defaults at once
      expect.soft(DEFAULT_FRECENCY_DECAY.hourWeight).toBe(4.0);
      expect.soft(DEFAULT_FRECENCY_DECAY.dayWeight).toBe(2.0);
      expect.soft(DEFAULT_FRECENCY_DECAY.weekWeight).toBe(1.5);
      expect.soft(DEFAULT_FRECENCY_DECAY.monthWeight).toBe(1.0);
      expect.soft(DEFAULT_FRECENCY_DECAY.olderWeight).toBe(0.5);
    });

    it('DEFAULT_MACHINE_OPTIONS should satisfy Partial<CommandMachineOptions>', () => {
      expectTypeOf(DEFAULT_MACHINE_OPTIONS).toExtend<Partial<CommandMachineOptions>>();
      expectTypeOf(DEFAULT_MACHINE_OPTIONS.open).toEqualTypeOf<boolean | undefined>();
      expect.soft(DEFAULT_MACHINE_OPTIONS.open).toBe(false);
      expect.soft(DEFAULT_MACHINE_OPTIONS.loop).toBe(true);
      expect.soft(DEFAULT_MACHINE_OPTIONS.virtualizeThreshold).toBe(100);
    });
  });

  describe('createInitialState', () => {
    it('should return a valid CommandState', () => {
      const state = createInitialState();
      expectTypeOf(state).toExtend<CommandState>();
      expect(state.search).toBe('');
      expect(state.activeId).toBeNull();
      expect(state.filteredCount).toBe(0);
      expect(state.open).toBe(false);
      expect(state.page).toBe('root');
      expect(typeof state.lastUpdated).toBe('number');
      expect(state.lastUpdated).toBeGreaterThan(0);
    });

    it('should accept options for initial open state', () => {
      const state = createInitialState({ open: true });
      expect(state.open).toBe(true);
    });
  });

  describe('Disposable interfaces', () => {
    it('FrecencyStorage should extend Disposable', () => {
      expectTypeOf<FrecencyStorage>().toHaveProperty(Symbol.dispose);
      using storage = new MemoryFrecencyStorage();
      expect(typeof storage[Symbol.dispose]).toBe('function');
    });

    it('SearchEngine should extend Disposable', () => {
      expectTypeOf<SearchEngine>().toHaveProperty(Symbol.dispose);
      using engine = createSearchEngine();
      expect(typeof engine[Symbol.dispose]).toBe('function');
    });

    it('CommandMachine should extend Disposable', () => {
      expectTypeOf<CommandMachine>().toHaveProperty(Symbol.dispose);
      using machine = createCommandMachine();
      expect(typeof machine[Symbol.dispose]).toBe('function');
    });
  });
});
