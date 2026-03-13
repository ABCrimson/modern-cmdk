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
  createInitialState,
  DEFAULT_FRECENCY_DECAY,
  DEFAULT_MACHINE_OPTIONS,
  groupId,
  itemId,
} from 'modern-cmdk';
import { describe, expect, expectTypeOf, it } from 'vitest';

describe('Type Foundation (0.0.2)', () => {
  describe('Branded types', () => {
    it('should have ItemId as a branded string type', () => {
      const id = itemId('test');
      expectTypeOf(id).toMatchTypeOf<ItemId>();
      expectTypeOf(id).toMatchTypeOf<string>();
    });

    it('should have GroupId as a branded string type', () => {
      const id = groupId('test');
      expectTypeOf(id).toMatchTypeOf<GroupId>();
      expectTypeOf(id).toMatchTypeOf<string>();
    });

    it('should prevent mixing ItemId and GroupId', () => {
      const item = itemId('a');
      const group = groupId('b');
      // These are structurally different due to unique symbol brands
      expectTypeOf(item).not.toEqualTypeOf(group);
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
    });

    it('should use number for lastUpdated (epoch ms)', () => {
      expectTypeOf<CommandState['lastUpdated']>().toEqualTypeOf<number>();
    });

    it('should use ReadonlyMap for groupedIds', () => {
      expectTypeOf<CommandState['groupedIds']>().toMatchTypeOf<
        ReadonlyMap<GroupId, readonly ItemId[]>
      >();
    });
  });

  describe('CommandEvent', () => {
    it('should be a discriminated union on type', () => {
      const searchEvent: CommandEvent = { type: 'SEARCH_CHANGE', query: 'test' };
      const selectEvent: CommandEvent = { type: 'ITEM_SELECT', id: itemId('x') };
      const navEvent: CommandEvent = { type: 'NAVIGATE', direction: 'next' };
      const openEvent: CommandEvent = { type: 'OPEN' };
      const closeEvent: CommandEvent = { type: 'CLOSE' };
      const toggleEvent: CommandEvent = { type: 'TOGGLE' };

      expectTypeOf(searchEvent).toMatchTypeOf<CommandEvent>();
      expectTypeOf(selectEvent).toMatchTypeOf<CommandEvent>();
      expectTypeOf(navEvent).toMatchTypeOf<CommandEvent>();
      expectTypeOf(openEvent).toMatchTypeOf<CommandEvent>();
      expectTypeOf(closeEvent).toMatchTypeOf<CommandEvent>();
      expectTypeOf(toggleEvent).toMatchTypeOf<CommandEvent>();
    });
  });

  describe('CommandItem', () => {
    it('should have readonly properties', () => {
      expectTypeOf<CommandItem['id']>().toEqualTypeOf<ItemId>();
      expectTypeOf<CommandItem['value']>().toEqualTypeOf<string>();
    });

    it('should have optional properties with undefined union', () => {
      expectTypeOf<CommandItem['keywords']>().toEqualTypeOf<readonly string[] | undefined>();
    });
  });

  describe('CommandMachineOptions', () => {
    it('should use NoInfer on callback params', () => {
      const opts: CommandMachineOptions = {
        onSelect: (id: ItemId) => {
          expectTypeOf(id).toMatchTypeOf<ItemId>();
        },
      };
      expectTypeOf(opts).toMatchTypeOf<CommandMachineOptions>();
    });
  });

  describe('FrecencyDecayConfig', () => {
    it('should have optional weight properties', () => {
      expectTypeOf<FrecencyDecayConfig>().toHaveProperty('hourWeight');
      expectTypeOf<FrecencyDecayConfig>().toHaveProperty('dayWeight');
      expectTypeOf<FrecencyDecayConfig>().toHaveProperty('weekWeight');
      expectTypeOf<FrecencyDecayConfig>().toHaveProperty('monthWeight');
      expectTypeOf<FrecencyDecayConfig>().toHaveProperty('olderWeight');
    });
  });

  describe('Default values with satisfies', () => {
    it('DEFAULT_FRECENCY_DECAY should satisfy Required<FrecencyDecayConfig>', () => {
      expectTypeOf(DEFAULT_FRECENCY_DECAY).toMatchTypeOf<Required<FrecencyDecayConfig>>();
      // Vitest 4.1 — soft assertions to report all mismatched defaults at once
      expect.soft(DEFAULT_FRECENCY_DECAY.hourWeight).toBe(4.0);
      expect.soft(DEFAULT_FRECENCY_DECAY.dayWeight).toBe(2.0);
      expect.soft(DEFAULT_FRECENCY_DECAY.weekWeight).toBe(1.5);
      expect.soft(DEFAULT_FRECENCY_DECAY.monthWeight).toBe(1.0);
      expect.soft(DEFAULT_FRECENCY_DECAY.olderWeight).toBe(0.5);
    });

    it('DEFAULT_MACHINE_OPTIONS should satisfy Partial<CommandMachineOptions>', () => {
      expectTypeOf(DEFAULT_MACHINE_OPTIONS).toMatchTypeOf<Partial<CommandMachineOptions>>();
      expect.soft(DEFAULT_MACHINE_OPTIONS.loop).toBe(true);
      expect.soft(DEFAULT_MACHINE_OPTIONS.virtualizeThreshold).toBe(100);
    });
  });

  describe('createInitialState', () => {
    it('should return a valid CommandState', () => {
      const state = createInitialState();
      expectTypeOf(state).toMatchTypeOf<CommandState>();
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
    });

    it('SearchEngine should extend Disposable', () => {
      expectTypeOf<SearchEngine>().toHaveProperty(Symbol.dispose);
    });

    it('CommandMachine should extend Disposable', () => {
      expectTypeOf<CommandMachine>().toHaveProperty(Symbol.dispose);
    });
  });
});
