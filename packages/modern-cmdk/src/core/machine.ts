// packages/modern-cmdk/src/core/machine.ts
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
import { mapGroupBy } from './utils/group-by.js';
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
  /** Get the current set of filtered item IDs — O(1) membership checks */
  getFilteredIdSet(): ReadonlySet<ItemId>;
  /** Get the index map for filtered IDs — O(1) positional lookup */
  getFilteredIdIndex(): ReadonlyMap<ItemId, number>;
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

  // Sources with an outstanding load — state.loading is true while the set is non-empty
  const pendingSources = new Set<string>();

  let frecencyEngine: FrecencyEngine | null = null;
  if (options.frecency?.enabled) {
    frecencyEngine = new FrecencyEngine(options.frecency);
    // Fire-and-forget async hydration — loads persisted frecency data (IDB)
    // so bonuses are available after the first microtask settles
    void frecencyEngine.load();
  }

  // Batching: send() queues one scheduler closure per event. A handler's setState only marks the state
  // changed and registry events only mark it dirty; the last event of the batch refilters once (if dirty)
  // and emits stateChange once (if changed). Events sent from inside a handler run in the next batch.
  let queued = 0; // events sent and not yet handled
  let nextQueued = 0; // of those, the ones sent from inside a handler: they run in the next batch
  let inHandler = false;
  let dirty = false;
  let changed = false;

  // Register initial items and groups
  if (options.items) {
    registry.registerItems(options.items);
    searchEngine.index(options.items);
    // Auto-register keyboard shortcuts from items — for...of for void callback
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

  // Run initial filter (nobody listens yet: it is not a change to announce)
  refilter('');
  changed = false;

  function setState(patch: Partial<CommandState>): void {
    state = { ...state, ...patch, lastUpdated: Date.now() };
    changed = true;
  }

  function setOpen(open: boolean): void {
    setState({ open });
    emitter.emit('openChange', open);
    options.onOpenChange?.(open);
  }

  function refilter(query: string): void {
    dirty = false;
    const items = registry.getItems();
    const disableFilter = options.filter === false;

    let filteredIds: ItemId[];

    if (disableFilter || query === '') {
      // Iterator Helper pipeline — no manual for...push
      filteredIds = items
        .values()
        .filter((i) => !i.disabled)
        .map((i) => i.id)
        .toArray();
    } else {
      let results: readonly SearchResult[] = searchEngine.search(query, items).toArray();

      // Apply frecency re-ranking if enabled — toSorted for immutable sort consistency
      if (frecencyEngine) {
        const bonuses = frecencyEngine.getAllBonuses();
        results = results.toSorted((a, b) => {
          const aBonus = bonuses.get(a.id) ?? 0;
          const bBonus = bonuses.get(b.id) ?? 0;
          return b.score + bBonus - (a.score + aBonus);
        });
      }

      filteredIds = results.map((r) => r.id);
    }

    // Update the O(1) membership set and index map
    filteredIdSet = new Set(filteredIds);
    filteredIdIndex = new Map(filteredIds.entries().map(([i, id]) => [id, i] as const));

    // Build grouped IDs
    const groupedIds = mapGroupBy(filteredIds, (id) => {
      const item = registry.getItem(id);
      return (item?.groupId ?? ('__ungrouped' as GroupId)) as GroupId;
    });

    // Select first item if no active or active is no longer visible
    const activeId =
      state.activeId && filteredIdSet.has(state.activeId)
        ? state.activeId
        : (filteredIds[0] ?? null);

    setState({
      search: query,
      filteredIds,
      groupedIds,
      filteredCount: filteredIds.length,
      activeId,
    });
  }

  function navigate(direction: 'next' | 'prev' | 'first' | 'last'): void {
    const { filteredIds, activeId } = state;
    const last = filteredIds.length - 1;
    if (last < 0) return;

    const loop = options.loop ?? true;
    // O(1) index lookup via Map instead of O(n) indexOf
    const current = activeId ? (filteredIdIndex.get(activeId) ?? -1) : -1;
    let index: number;

    if (direction === 'first') index = 0;
    else if (direction === 'last') index = last;
    else if (direction === 'next')
      index = current < 0 || current >= last ? (loop ? 0 : last) : current + 1;
    else index = current <= 0 ? (loop ? last : 0) : current - 1;

    const newActiveId = filteredIds[index] ?? null;
    if (newActiveId !== activeId) {
      setState({ activeId: newActiveId });
      options.onActiveChange?.(newActiveId);
    }
  }

  /** Ends a batch: one refilter if a registry event ran, then one stateChange even if the refilter throws. */
  function commit(): void {
    try {
      if (dirty) refilter(state.search);
    } finally {
      if (changed) {
        changed = false;
        emitter.emit('stateChange', state);
      }
    }
  }

  function handleEvent(event: CommandEvent): void {
    // Navigation reads the filtered ids: bring them up to date after a registry event of this batch
    if (dirty && (event.type === 'NAVIGATE' || event.type === 'ITEM_ACTIVATE')) {
      refilter(state.search);
    }
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
          setState({ activeId: event.id });
          options.onActiveChange?.(event.id);
        }
        break;

      case 'NAVIGATE':
        navigate(event.direction);
        break;

      case 'PAGE_PUSH':
        setState({ page: event.page, pageStack: [...state.pageStack, state.page] });
        break;

      case 'PAGE_POP': {
        const prevPage = state.pageStack.at(-1);
        if (prevPage != null) {
          setState({ page: prevPage, pageStack: state.pageStack.toSpliced(-1, 1) });
        }
        break;
      }

      case 'OPEN':
        setOpen(true);
        break;

      case 'CLOSE':
        setOpen(false);
        break;

      case 'TOGGLE':
        setOpen(!state.open);
        break;

      case 'ITEMS_LOADED':
        registry.registerItems(event.items);
        searchEngine.index(event.items);
        dirty = true;
        break;

      case 'LOADING': {
        if (event.pending) pendingSources.add(event.source);
        else pendingSources.delete(event.source);
        const loading = pendingSources.size > 0;
        if (loading !== state.loading) setState({ loading });
        break;
      }

      case 'REGISTER_ITEM':
        registry.registerItem(event.item);
        searchEngine.index([event.item]);
        if (event.item.shortcut && event.item.onSelect) {
          keyboardRegistry.register(event.item.shortcut, event.item.id, event.item.onSelect);
        }
        dirty = true;
        break;

      case 'UNREGISTER_ITEM':
        registry.unregisterItem(event.id);
        searchEngine.remove(new Set([event.id]));
        keyboardRegistry.unregisterByItem(event.id);
        dirty = true;
        break;

      case 'REGISTER_GROUP':
        registry.registerGroup(event.group);
        dirty = true;
        break;

      case 'UNREGISTER_GROUP':
        registry.unregisterGroup(event.id);
        dirty = true;
        break;
    }
  }

  const machine: CommandMachine = {
    getState(): CommandState {
      return state;
    },

    send(event: CommandEvent): void {
      queued++;
      if (inHandler) nextQueued++;
      scheduler.schedule(() => {
        inHandler = true;
        try {
          handleEvent(event);
        } finally {
          inHandler = false;
          if (--queued === nextQueued) {
            // Last event of the batch: commit once
            nextQueued = 0;
            commit();
          }
        }
      });
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

    getFilteredIdSet(): ReadonlySet<ItemId> {
      return filteredIdSet;
    },

    getFilteredIdIndex(): ReadonlyMap<ItemId, number> {
      return filteredIdIndex;
    },

    [Symbol.dispose](): void {
      queued = nextQueued = 0; // the scheduler drops its pending closures
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
