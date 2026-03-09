// packages/command/src/machine.ts
// Core state machine — pure functions, `using` for subscription cleanup
// Implements Disposable, useSyncExternalStore-compatible API

import { FrecencyEngine } from './frecency/index.js';
import { KeyboardShortcutRegistry } from './keyboard/index.js';
import { CommandRegistry } from './registry.js';
import { createSearchEngine } from './search/index.js';
import type { SearchEngine, SearchResult } from './search/types.js';
import type {
  CommandEvent,
  CommandItem,
  CommandMachineOptions,
  CommandState,
  GroupId,
  ItemId,
} from './types.js';
import { createInitialState } from './types.js';
import { TypedEmitter } from './utils/event-emitter.js';
import type { Scheduler } from './utils/scheduler.js';
import { createScheduler } from './utils/scheduler.js';

/** Events emitted by the machine for external listening */
type MachineEvents = {
  stateChange: CommandState;
  select: ItemId;
  openChange: boolean;
};

/** Command machine — explicit resource management via `using` */
export interface CommandMachine extends Disposable {
  getState(): CommandState;
  send(event: CommandEvent): void;
  /** Subscribe to state changes — useSyncExternalStore-compatible (returns cleanup function) */
  subscribe(listener: () => void): () => void;
  /** Subscribe to full state changes — returns Disposable for `using` pattern */
  subscribeState(listener: (state: CommandState) => void): Disposable;
  getRegistry(): CommandRegistry;
  getKeyboardRegistry(): KeyboardShortcutRegistry;
  [Symbol.dispose](): void;
}

/**
 * Creates a headless command palette state machine with search, frecency,
 * and keyboard shortcut support. Implements Disposable for `using` cleanup.
 *
 * @example
 * ```ts
 * using machine = createCommandMachine({ items, loop: true });
 * machine.subscribe(() => console.log(machine.getState()));
 * ```
 */
export function createCommandMachine(options: CommandMachineOptions = {}): CommandMachine {
  let state: CommandState = createInitialState(options);

  // O(1) membership check — kept in sync with filteredIds
  let filteredIdSet = new Set<ItemId>();
  // O(1) index lookup — kept in sync with filteredIds for navigate()
  let filteredIdIndex = new Map<ItemId, number>();

  const registry = new CommandRegistry();
  // Pluggable search engine: use options.search if provided, otherwise create default.
  const searchEngine: SearchEngine =
    options.search ??
    createSearchEngine(
      typeof options.filter === 'function'
        ? {
            scorer: (query: string, item: CommandItem) => {
              const score = (
                options.filter as (item: CommandItem, query: string) => number | false
              )(item, query);
              if (score === false) return null;
              return { id: item.id, score, matches: [] };
            },
          }
        : undefined,
    );
  const scheduler: Scheduler = createScheduler();
  const emitter = new TypedEmitter<MachineEvents>();
  const keyboardRegistry = new KeyboardShortcutRegistry();

  let frecencyEngine: FrecencyEngine | null = null;
  if (options.frecency?.enabled) {
    frecencyEngine = new FrecencyEngine(options.frecency);
  }

  // Register initial items and groups
  if (options.items) {
    registry.registerItems(options.items);
    searchEngine.index(options.items);
    // Auto-register keyboard shortcuts from items
    for (const item of options.items) {
      if (item.shortcut != null && item.onSelect != null) {
        keyboardRegistry.register(item.shortcut, item.id, item.onSelect);
      }
    }
  }
  if (options.groups) {
    for (const group of options.groups) {
      registry.registerGroup(group);
    }
  }

  // Run initial filter
  refilter('');

  function setState(newState: CommandState): void {
    state = newState;
    emitter.emit('stateChange', state);
  }

  function refilter(query: string): void {
    const items = registry.getItems();
    const disableFilter = options.filter === false;

    let filteredIds: ItemId[];

    if (disableFilter || query === '') {
      filteredIds = [];
      for (const i of items) {
        if (!i.disabled) filteredIds.push(i.id);
      }
    } else {
      const results: SearchResult[] = searchEngine.search(query, items).toArray();

      // Apply frecency re-ranking if enabled
      if (frecencyEngine) {
        const bonuses = frecencyEngine.getAllBonuses();
        results.sort((a, b) => {
          const aBonus = bonuses.get(a.id) ?? 0;
          const bBonus = bonuses.get(b.id) ?? 0;
          return b.score + bBonus - (a.score + aBonus);
        });
      }

      filteredIds = results.map((r) => r.id);
    }

    // Update the O(1) membership set and index map
    filteredIdSet = new Set(filteredIds);
    filteredIdIndex = new Map(filteredIds.map((id, i) => [id, i]));

    // Build grouped IDs — Map.groupBy (ES2026)
    const groupedIds = Map.groupBy(filteredIds, (id) => {
      const item = registry.getItem(id);
      return (item?.groupId ?? ('__ungrouped' as GroupId)) as GroupId;
    });

    // Select first item if no active or active is no longer visible
    const activeId =
      state.activeId && filteredIdSet.has(state.activeId)
        ? state.activeId
        : (filteredIds[0] ?? null);

    setState({
      ...state,
      search: query,
      filteredIds,
      groupedIds,
      filteredCount: filteredIds.length,
      activeId,
      lastUpdated: Temporal.Now.instant(),
    });
  }

  function navigate(direction: 'next' | 'prev' | 'first' | 'last'): void {
    const { filteredIds, activeId } = state;
    if (filteredIds.length === 0) return;

    // Fast path for first/last — skip indexOf entirely
    if (direction === 'first') {
      const newActiveId = filteredIds[0] ?? null;
      if (newActiveId !== activeId) {
        setState({ ...state, activeId: newActiveId, lastUpdated: Temporal.Now.instant() });
        options.onActiveChange?.(newActiveId);
      }
      return;
    }
    if (direction === 'last') {
      const newActiveId = filteredIds[filteredIds.length - 1] ?? null;
      if (newActiveId !== activeId) {
        setState({ ...state, activeId: newActiveId, lastUpdated: Temporal.Now.instant() });
        options.onActiveChange?.(newActiveId);
      }
      return;
    }

    const loop = options.loop ?? true;
    // O(1) index lookup via Map instead of O(n) indexOf
    const currentIdx = activeId ? (filteredIdIndex.get(activeId) ?? -1) : -1;
    let newIdx: number;

    if (direction === 'next') {
      if (currentIdx === -1 || currentIdx >= filteredIds.length - 1) {
        newIdx = loop ? 0 : filteredIds.length - 1;
      } else {
        newIdx = currentIdx + 1;
      }
    } else {
      // direction === 'prev'
      if (currentIdx <= 0) {
        newIdx = loop ? filteredIds.length - 1 : 0;
      } else {
        newIdx = currentIdx - 1;
      }
    }

    const newActiveId = filteredIds[newIdx] ?? null;
    if (newActiveId !== activeId) {
      setState({
        ...state,
        activeId: newActiveId,
        lastUpdated: Temporal.Now.instant(),
      });
      options.onActiveChange?.(newActiveId);
    }
  }

  function handleEvent(event: CommandEvent): void {
    switch (event.type) {
      case 'SEARCH_CHANGE':
        refilter(event.query);
        options.onSearchChange?.(event.query);
        break;

      case 'ITEM_SELECT': {
        const item = registry.getItem(event.id);
        if (item && !item.disabled) {
          item.onSelect?.();
          frecencyEngine?.recordSelection(event.id);
          emitter.emit('select', event.id);
          options.onSelect?.(event.id);
        }
        break;
      }

      case 'ITEM_ACTIVATE':
        // O(1) Set.has instead of O(n) Array.includes
        if (filteredIdSet.has(event.id)) {
          setState({
            ...state,
            activeId: event.id,
            lastUpdated: Temporal.Now.instant(),
          });
          options.onActiveChange?.(event.id);
        }
        break;

      case 'NAVIGATE':
        navigate(event.direction);
        break;

      case 'PAGE_PUSH':
        setState({
          ...state,
          page: event.page,
          pageStack: [...state.pageStack, state.page],
          lastUpdated: Temporal.Now.instant(),
        });
        break;

      case 'PAGE_POP': {
        const prevPage = state.pageStack.at(-1);
        if (prevPage != null) {
          setState({
            ...state,
            page: prevPage,
            pageStack: state.pageStack.slice(0, -1),
            lastUpdated: Temporal.Now.instant(),
          });
        }
        break;
      }

      case 'OPEN':
        setState({ ...state, open: true, lastUpdated: Temporal.Now.instant() });
        emitter.emit('openChange', true);
        options.onOpenChange?.(true);
        break;

      case 'CLOSE':
        setState({ ...state, open: false, lastUpdated: Temporal.Now.instant() });
        emitter.emit('openChange', false);
        options.onOpenChange?.(false);
        break;

      case 'TOGGLE': {
        const newOpen = !state.open;
        setState({ ...state, open: newOpen, lastUpdated: Temporal.Now.instant() });
        emitter.emit('openChange', newOpen);
        options.onOpenChange?.(newOpen);
        break;
      }

      case 'ITEMS_LOADED':
        registry.registerItems(event.items);
        searchEngine.index(event.items);
        // Single refilter handles both loading:false and filter — no double setState
        state = { ...state, loading: false };
        refilter(state.search);
        break;

      case 'REGISTER_ITEM':
        registry.registerItem(event.item);
        searchEngine.index([event.item]);
        if (event.item.shortcut && event.item.onSelect) {
          keyboardRegistry.register(event.item.shortcut, event.item.id, event.item.onSelect);
        }
        refilter(state.search);
        break;

      case 'UNREGISTER_ITEM':
        registry.unregisterItem(event.id);
        searchEngine.remove(new Set([event.id]));
        keyboardRegistry.unregisterByItem(event.id);
        refilter(state.search);
        break;

      case 'REGISTER_GROUP':
        registry.registerGroup(event.group);
        refilter(state.search);
        break;

      case 'UNREGISTER_GROUP':
        registry.unregisterGroup(event.id);
        refilter(state.search);
        break;
    }
  }

  const machine: CommandMachine = {
    getState(): CommandState {
      return state;
    },

    send(event: CommandEvent): void {
      scheduler.schedule(() => handleEvent(event));
    },

    /** useSyncExternalStore-compatible subscribe — returns cleanup function */
    subscribe(listener: () => void): () => void {
      const disposable = emitter.on('stateChange', listener as (data: CommandState) => void);
      return () => disposable[Symbol.dispose]();
    },

    /** Full state subscribe — returns Disposable for `using` pattern */
    subscribeState(listener: (state: CommandState) => void): Disposable {
      return emitter.on('stateChange', listener);
    },

    getRegistry(): CommandRegistry {
      return registry;
    },

    getKeyboardRegistry(): KeyboardShortcutRegistry {
      return keyboardRegistry;
    },

    [Symbol.dispose](): void {
      scheduler[Symbol.dispose]();
      registry[Symbol.dispose]();
      searchEngine[Symbol.dispose]();
      emitter[Symbol.dispose]();
      keyboardRegistry[Symbol.dispose]();
      frecencyEngine?.[Symbol.dispose]();
    },
  };

  return machine;
}
