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
import { createInitialState, DEFAULT_MACHINE_OPTIONS, UNGROUPED_GROUP_ID } from './types.js';
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
 * and keyboard shortcut support. Implements Disposable and AsyncDisposable for
 * `using` and `await using` cleanup (the latter awaits the pending frecency save).
 *
 * @example
 * ```ts
 * using machine = createCommandMachine({ items, loop: true });
 * machine.subscribe(() => console.log(machine.getState()));
 * ```
 */
export function createCommandMachine(
  options: CommandMachineOptions = {},
): CommandMachine & AsyncDisposable {
  let state: CommandState = createInitialState(options);

  // O(1) membership check — kept in sync with filteredIds
  let filteredIdSet = new Set<ItemId>();
  // O(1) index lookup — kept in sync with filteredIds
  let filteredIdIndex = new Map<ItemId, number>();
  // The filtered ids that navigation and activation may land on (disabled ones left out), same order
  let navIds: ItemId[] = [];

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
              // false and scores <= 0 exclude the item
              return score && score > 0 ? { id: item.id, score, matches: [] } : null;
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
    // Hydrate persisted frecency data (IDB) in the background: once the engine has merged it, mark the
    // results dirty so one refilter and one stateChange (through the batch commit, unless a batch is
    // pending and commits them itself) take the loaded bonuses; a failed load is reported, not thrown
    void frecencyEngine.load().then(
      () => {
        if (disposed) return;
        dirty = true;
        if (queued === 0) commit();
      },
      (error: unknown) => {
        // biome-ignore lint/suspicious/noConsole: Load-time diagnostic for production debugging, like the engine's save warning
        console.warn('[modern-cmdk] frecency load failed:', error);
      },
    );
  }

  // Batching: send() queues one scheduler closure per event. A handler's setState only marks the state
  // changed and registry events only mark it dirty; the last event of the batch refilters once (if dirty)
  // and emits stateChange once (if changed). Events sent from inside a handler run in the next batch.
  let queued = 0; // events sent and not yet handled
  let nextQueued = 0; // of those, the ones sent from inside a handler: they run in the next batch
  let inHandler = false;
  let dirty = false;
  let changed = false;
  let disposed = false; // set by dispose: a frecency load that settles later does nothing

  // Register initial items and groups
  if (options.items) {
    registry.registerItems(options.items);
    searchEngine.index(options.items);
    for (const item of options.items) bind(item);
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
      filteredIds = items.map((i) => i.id);
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

    // After the search too: an engine that searches its own index ignores the items it is handed
    if (options.disabledItems === 'hide') filteredIds = filteredIds.filter(isEnabled);

    // Update the O(1) membership set and index map
    filteredIdSet = new Set(filteredIds);
    filteredIdIndex = new Map(filteredIds.entries().map(([i, id]) => [id, i] as const));

    // Build grouped IDs, keys by group priority (lower first); the sort is stable, so equal priorities
    // (and ungrouped items, priority 0) keep their first-appearance order in filteredIds
    const priority = (g: GroupId): number => registry.getGroup(g)?.priority ?? 0;
    const groupedIds = new Map(
      [
        ...mapGroupBy(filteredIds, (id) => registry.getItem(id)?.groupId ?? UNGROUPED_GROUP_ID),
      ].sort((x, y) => priority(x[0]) - priority(y[0])),
    );

    // Navigation list: disabled items are listed but never active
    navIds = filteredIds.filter(isEnabled);

    // Keep the active item while it is still listed and enabled, else the first enabled one
    const activeId =
      state.activeId && filteredIdSet.has(state.activeId) && isEnabled(state.activeId)
        ? state.activeId
        : (navIds[0] ?? null);

    setState({
      search: query,
      filteredIds,
      groupedIds,
      filteredCount: filteredIds.length,
      activeId,
    });
  }

  function isEnabled(id: ItemId): boolean {
    return !registry.getItem(id)?.disabled;
  }

  /**
   * (Re)binds an item's keyboard shortcut — the one place that does it, for initial items, ITEMS_LOADED,
   * REGISTER_ITEM and UPDATE_ITEM. The item's old binding goes first. A disabled item is not bound at all (its key
   * stays free for the page and for other items on it); UPDATE_ITEM re-binds, so enabling an item binds it. Under
   * 'select' the binding dispatches ITEM_SELECT, whose guard checks the item; under 'direct' it only binds an item
   * with an onSelect and checks the registry entry again before calling it.
   */
  function bind({ id, shortcut, disabled, onSelect }: CommandItem): void {
    keyboardRegistry.unregisterByItem(id);
    if (!shortcut || disabled) return;
    if (options.shortcutAction === 'select') {
      keyboardRegistry.register(shortcut, id, () => machine.send({ type: 'ITEM_SELECT', id }));
    } else if (onSelect) {
      keyboardRegistry.register(shortcut, id, () => {
        if (isEnabled(id)) onSelect();
      });
    }
  }

  function navigate(direction: 'next' | 'prev' | 'first' | 'last'): void {
    const { activeId } = state;
    const last = navIds.length - 1;
    if (last < 0) return;

    const loop = options.loop ?? DEFAULT_MACHINE_OPTIONS.loop;
    const current = activeId ? navIds.indexOf(activeId) : -1;
    let index: number;

    if (direction === 'first') index = 0;
    else if (direction === 'last') index = last;
    else if (direction === 'next')
      index = current < 0 || current >= last ? (loop ? 0 : last) : current + 1;
    else index = current <= 0 ? (loop ? last : 0) : current - 1;

    const newActiveId = navIds[index] ?? null;
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
        // O(1) Set.has instead of O(n) Array.includes; a disabled item cannot become active
        if (filteredIdSet.has(event.id) && isEnabled(event.id)) {
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
        for (const item of event.items) bind(item);
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
      case 'UPDATE_ITEM':
        registry.registerItem(event.item);
        searchEngine.index([event.item]);
        bind(event.item);
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

  const machine: CommandMachine & AsyncDisposable = {
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
      disposed = true;
      queued = nextQueued = 0; // the scheduler drops its pending closures
      scheduler[Symbol.dispose]();
      registry[Symbol.dispose]();
      searchEngine[Symbol.dispose]();
      emitter[Symbol.dispose]();
      keyboardRegistry[Symbol.dispose]();
      frecencyEngine?.[Symbol.dispose]();
    },

    /** Awaits the pending frecency save, then disposes like [Symbol.dispose] — for `await using` */
    async [Symbol.asyncDispose](): Promise<void> {
      try {
        await frecencyEngine?.flush();
      } finally {
        machine[Symbol.dispose]();
      }
    },
  };

  return machine;
}
