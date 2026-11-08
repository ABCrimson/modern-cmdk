// packages/modern-cmdk/src/core/machine.ts
// Core state machine — pure functions, `using` for subscription cleanup
// Implements Disposable, useSyncExternalStore-compatible API
// Browser floor of the core: Chrome, Edge and Android Chrome 122; Firefox and Android Firefox 131;
// Safari and iOS Safari 18.4. tests/unit/browser-floor.json pins it and tests/unit/browser-floor.test.ts
// recomputes it from web-features and fails on drift. Symbol.dispose and Symbol.asyncDispose are shimmed in
// core/frecency/idb-storage.ts (`??=`; its header says why it lives there; D83 as amended by G-48) for the Safari floor.

import { FrecencyEngine } from './frecency/index.js';
import { KeyboardShortcutRegistry } from './keyboard/index.js';
import { CommandRegistry } from './registry.js';
import { createSearchEngine } from './search/index.js';
import type { SearchEngine, SearchResult } from './search/types.js';
import { telemetryOver } from './telemetry.js';
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
  /**
   * Release every global hold the machine owns, reversibly: the shortcut keydown listener on `document`, the
   * frecency page-exit listeners (`pagehide`, `visibilitychange`), the frecency debounce timer and the scheduled
   * frame. The pending batch runs at once and the save of pending frecency data starts first (a failed save
   * is reported with a warning, never thrown). State, registered items and shortcut bindings, the search engine
   * and the frecency storage stay, so `resume()` takes the holds back with nothing lost. A suspended machine nobody
   * references can be collected, and the search engine it created is then disposed. An event sent while suspended
   * is scheduled as usual. Idempotent; does nothing after dispose, which stays the terminal teardown.
   * Optional on the interface so that a hand-written machine of the 1.5 shape stays a `CommandMachine`; the
   * machine `createCommandMachine` returns always has it.
   */
  suspend?(): void;
  /** Take back the holds `suspend()` released (the keydown listener, the page-exit listeners). Idempotent; does nothing after dispose. */
  resume?(): void;
  /**
   * Refilters with the options as they read now: it schedules one batch slot that runs the filter again over the
   * registered items and recomputes the active item, and reports no candidate to `onActiveChange` (the caller changed
   * its own props, which is not a choice the machine makes). It is not a `CommandEvent`: it passes through no `send()`,
   * so what observes `send()` does not see it. An options object whose getters return new values for `activeId`,
   * `disabledItems` or `filter` calls it after a change; the React root does so when its `activeId`, `disabledItems`
   * or `filter` prop changes (its `filter` getter returns a value of the first render's kind, so a swap to the
   * other kind refilters with the first render's filter).
   * Does nothing after dispose. Optional like `suspend`; the machine `createCommandMachine` returns always has it.
   */
  refresh?(): void;
  /**
   * The terminal teardown. Afterwards `send()` reduces nothing, calls no option callback and queues nothing, and a
   * batch that is running when dispose is called stops: the rest of the batch and its commit do not run.
   * `suspend()` and `resume()` are the reversible pause.
   */
  [Symbol.dispose](): void;
}

/** What `createCommandMachine` returns: a `CommandMachine` that also has `suspend`, `resume`, `refresh` and `Symbol.asyncDispose` */
type CreatedMachine = CommandMachine &
  AsyncDisposable &
  Required<Pick<CommandMachine, 'suspend' | 'resume' | 'refresh'>>;

/**
 * Collected without dispose: disposes the search engine the machine created, which unregisters the engine's dev
 * leak sentinel before it can warn. The held value is the engine; it must not reference the machine.
 */
const engineRegistry = new FinalizationRegistry<SearchEngine>((engine) => engine[Symbol.dispose]());

/**
 * The search engine a machine creates when its options pass none. The engine kind (custom scorer or default) is
 * chosen from `options.filter` at construction; a custom scorer reads `options.filter` on every call, so a getter
 * over a new function takes effect on the next query. The engine holds the options object and never the machine's
 * scope, so a collected machine can dispose it; an options object that references the machine would pin the machine.
 */
function createOwnedEngine(options: CommandMachineOptions): SearchEngine {
  return createSearchEngine(
    typeof options.filter === 'function'
      ? {
          scorer: (query: string, item: CommandItem) => {
            const score = (options.filter as (item: CommandItem, query: string) => number | false)(
              item,
              query,
            );
            // false and scores <= 0 exclude the item
            return score && score > 0 ? { id: item.id, score, matches: [] } : null;
          },
        }
      : undefined,
  );
}

/**
 * Creates a headless command palette state machine with search, frecency,
 * and keyboard shortcut support. Implements Disposable and AsyncDisposable for
 * `using` and `await using` cleanup (the latter awaits the pending frecency save). `suspend()` and `resume()`
 * release and re-take its global holds without ending it; dispose is the terminal teardown.
 *
 * @example
 * ```ts
 * const machine = createCommandMachine({ items, loop: true });
 * const unsubscribe = machine.subscribe(() => console.log(machine.getState()));
 * machine.send({ type: 'SEARCH_CHANGE', query: 'app' }); // handled in the next frame
 *
 * // on teardown
 * unsubscribe();
 * machine[Symbol.dispose]();
 * ```
 */
export function createCommandMachine(options: CommandMachineOptions = {}): CreatedMachine {
  let state: CommandState = createInitialState(options);

  // O(1) membership check — kept in sync with filteredIds
  let filteredIdSet = new Set<ItemId>();
  // O(1) index lookup — kept in sync with filteredIds
  let filteredIdIndex = new Map<ItemId, number>();
  // The filtered ids that navigation and activation may land on (disabled ones left out), same order
  let navIds: ItemId[] = [];

  const registry = new CommandRegistry();
  // Pluggable search engine: use options.searchEngine (or the deprecated options.search) if provided, otherwise
  // create the default. A caller's engine is the caller's to dispose: the machine disposes only the one it creates.
  const ownsEngine = (options.searchEngine ?? options.search) === undefined;
  const searchEngine: SearchEngine =
    options.searchEngine ?? options.search ?? createOwnedEngine(options);
  const scheduler: Scheduler = createScheduler();
  const emitter = new TypedEmitter<MachineEvents>();
  const telemetry = telemetryOver(() => options.telemetry);
  const keyboardRegistry = new KeyboardShortcutRegistry();

  // Sources with an outstanding load — state.loading is true while the set is non-empty
  const pendingSources = new Set<string>();

  let frecencyEngine: FrecencyEngine | null = null;
  if (options.frecency?.enabled) {
    frecencyEngine = new FrecencyEngine(options.frecency);
    // Hydrate persisted frecency data (IDB) in the background: once the engine has merged it, mark the
    // results dirty — only for a non-empty query with the filter on, the one case frecency re-ranks (DT-18) —
    // and commit as scheduled work, so one refilter and one stateChange take the loaded bonuses (unless events
    // are queued behind it: their batch commits them) and a throw in the refilter surfaces as an uncaught
    // exception through the scheduler, like one in a send() batch, not as an unhandled rejection; a failed
    // load is reported, not thrown
    void frecencyEngine.load().then(
      () => {
        // Frecency re-ranks only non-empty queries (DT-18) and `filter: false` lists registration order, so
        // there the loaded bonuses change no result: skip the refilter and the stateChange
        if (disposed || state.search === '' || options.filter === false) return;
        dirty = true;
        scheduler.schedule(() => {
          if (queued === 0) commit();
        });
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
  let disposed = false; // set by dispose: the scheduler queues nothing for a disposed machine, a batch stops at the next event and skips its commit, and a frecency load that settles later does nothing
  let announce = false; // set after the initial filter: a controlled activeId then hears the refilter's candidate

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
  announce = true;

  function setState(patch: Partial<CommandState>): void {
    state = { ...state, ...patch, lastUpdated: Date.now() };
    changed = true;
  }

  function setOpen(open: boolean): void {
    // OPEN while open and CLOSE while closed change nothing: no state change, no openChange, no onOpenChange
    if (state.open === open) return;
    setState({ open });
    emitter.emit('openChange', open);
    options.onOpenChange?.(open);
    if (open) telemetry.onOpen();
    else telemetry.onClose();
  }

  /** Recomputes the lists and the active item for `query`; `report` lets a controlled `activeId` hear the candidate it does not take. */
  function refilter(query: string, report = announce): void {
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
    const current = currentActiveId();
    const candidate =
      current && filteredIdSet.has(current) && isEnabled(current) ? current : (navIds[0] ?? null);
    let activeId = candidate;
    // A controlled activeId hears every candidate it does not hold; the state mirrors it when listed and enabled, else null
    if (options.activeId !== undefined) {
      if (report && candidate !== current) options.onActiveChange?.(candidate);
      activeId = candidate === current ? current : null;
    }

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
   * REGISTER_ITEM and UPDATE_ITEM. The item's bindings on other keys go first; one on the same key is replaced in place, so
   * it keeps its place in that key's stack (CE-108). A disabled item is not bound at all (its key
   * stays free for the page and for other items on it); UPDATE_ITEM re-binds, so enabling an item binds it. Under
   * 'select' the binding dispatches ITEM_SELECT, whose guard checks the item; under 'direct' it only binds an item
   * with an onSelect and checks the registry entry again before calling it.
   */
  function bind({ id, shortcut, disabled, onSelect }: CommandItem): void {
    const select = options.shortcutAction === 'select';
    const bound = shortcut && !disabled && (select || onSelect) ? shortcut : undefined;
    keyboardRegistry.unregisterByItem(id, bound);
    if (!bound) return;
    const handler = (): void => {
      if (select) machine.send({ type: 'ITEM_SELECT', id });
      else if (isEnabled(id)) onSelect?.();
    };
    keyboardRegistry.register(bound, id, handler);
  }

  /** The active item: the controlled `options.activeId` when defined, else the state's */
  function currentActiveId(): ItemId | null {
    return options.activeId === undefined ? state.activeId : options.activeId;
  }

  /**
   * Makes `id` the active item. Uncontrolled: applies it and reports it. Controlled (`options.activeId` defined):
   * the option's own id is applied without a report, any other id is only reported.
   */
  function activate(id: ItemId | null): void {
    if (options.activeId === undefined || id === options.activeId) setState({ activeId: id });
    if (options.activeId !== id) options.onActiveChange?.(id);
  }

  function navigate(direction: 'next' | 'prev' | 'first' | 'last'): void {
    const activeId = currentActiveId();
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
    if (newActiveId !== activeId) activate(newActiveId);
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
      case 'SEARCH_CHANGE': {
        const start = performance.now();
        refilter(event.query);
        telemetry.onSearch(event.query, state.filteredCount, start);
        options.onSearchChange?.(event.query);
        break;
      }

      case 'ITEM_SELECT': {
        const item = registry.getItem(event.id);
        if (item && !item.disabled) {
          item.onSelect?.();
          frecencyEngine?.recordSelection(event.id);
          emitter.emit('select', event.id);
          options.onSelect?.(event.id);
          telemetry.onSelect(event.id, state.search, filteredIdIndex.get(event.id) ?? -1);
        }
        break;
      }

      case 'ITEM_ACTIVATE':
        // O(1) Set.has instead of O(n) Array.includes; a disabled item cannot become active
        if (filteredIdSet.has(event.id) && isEnabled(event.id)) {
          activate(event.id);
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

  /** Schedules `run` as one slot of the batch; the last slot commits once. `send()` and `refresh()` share it. */
  function enqueue(run: () => void): void {
    queued++;
    if (inHandler) nextQueued++;
    scheduler.schedule(() => {
      // A listener may dispose the machine while a batch runs: the rest of that batch does not run
      if (disposed) return;
      inHandler = true;
      try {
        run();
      } finally {
        inHandler = false;
        if (--queued === nextQueued) {
          // Last slot of the batch: commit once
          nextQueued = 0;
          if (!disposed) commit();
        }
      }
    });
  }

  const machine: CreatedMachine = {
    getState(): CommandState {
      return state;
    },

    send(event: CommandEvent): void {
      enqueue(() => handleEvent(event));
    },

    refresh(): void {
      enqueue(() => refilter(state.search, false));
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

    suspend(): void {
      if (disposed) return;
      scheduler.flush();
      keyboardRegistry.suspend();
      frecencyEngine?.suspend();
    },

    resume(): void {
      keyboardRegistry.resume();
      frecencyEngine?.resume();
    },

    [Symbol.dispose](): void {
      disposed = true;
      scheduler[Symbol.dispose]();
      registry[Symbol.dispose]();
      if (ownsEngine) {
        engineRegistry.unregister(machine);
        searchEngine[Symbol.dispose]();
      }
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

  if (ownsEngine) engineRegistry.register(machine, searchEngine, machine);
  return machine;
}
