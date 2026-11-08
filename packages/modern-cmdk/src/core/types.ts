// packages/modern-cmdk/src/core/types.ts
// TypeScript 7.1 — ESNext target — all modern type features
// Branded ids, item/group/state/option types and the default frecency and machine options

import { ensureWellFormed } from './utils/string-wellformed.js';

/**
 * Branded type for command item IDs.
 * Prevents accidental mixing with plain strings at the type level.
 *
 * @example
 * ```ts
 * const id = itemId('copy');
 * // id has type ItemId, not string — catches type errors at compile time
 * ```
 */
declare const __itemIdBrand: unique symbol;
export type ItemId = string & { readonly [__itemIdBrand]: never };

/**
 * Branded type for group IDs.
 * Prevents accidental mixing with plain strings or ItemId at the type level.
 */
declare const __groupIdBrand: unique symbol;
export type GroupId = string & { readonly [__groupIdBrand]: never };

/**
 * The `groupedIds` key of items that have no group. The value is an observable key of
 * `CommandState.groupedIds` and stays `'__ungrouped'`. A group registered under this id shares the
 * bucket: its items are listed with the ungrouped ones and the bucket takes its priority.
 */
export const UNGROUPED_GROUP_ID: GroupId = '__ungrouped' as GroupId;

/** Create a branded {@link ItemId} from a plain string. Ensures well-formed Unicode. */
export function itemId(id: string): ItemId {
  return ensureWellFormed(id) as ItemId;
}

/** Create a branded {@link GroupId} from a plain string. Ensures well-formed Unicode. */
export function groupId(id: string): GroupId {
  return ensureWellFormed(id) as GroupId;
}

/**
 * A registered command item in the palette.
 * All fields are readonly — state machine creates new items on update.
 */
export interface CommandItem {
  /** Unique identifier (branded type) */
  readonly id: ItemId;
  /** Display text — also used as the primary search target */
  readonly value: string;
  /** Additional searchable terms (matched but not displayed) */
  readonly keywords?: readonly string[] | undefined;
  /** Group this item belongs to (items without groupId are ungrouped) */
  readonly groupId?: GroupId | undefined;
  /** Keyboard shortcut string (e.g., "Ctrl+C", "Mod+K") */
  readonly shortcut?: string | undefined;
  /** Whether this item is disabled: excluded from navigation and selection; rendered unless `disabledItems: 'hide'` */
  readonly disabled?: boolean | undefined;
  /** Callback fired when this item is selected */
  readonly onSelect?: (() => void) | undefined;
  /** Arbitrary metadata attached to the item */
  readonly data?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * A command group for categorizing items.
 * Groups are rendered with headings; React renders `<Command.Group>` elements in JSX order.
 */
export interface CommandGroup {
  /** Unique identifier (branded type) */
  readonly id: GroupId;
  /** Display heading text (rendered above the group's items) */
  readonly heading?: string | undefined;
  /**
   * Orders the keys of `CommandState.groupedIds` and `getGroups()`: lower first, stable for equal
   * values (default: 0). The React adapter renders groups in JSX order.
   */
  readonly priority?: number | undefined;
}

/**
 * Immutable state snapshot of the command palette.
 * Consumed by React via `useSyncExternalStore` — each mutation
 * produces a new object reference for efficient re-render detection.
 */
export interface CommandState {
  /** Current search query string */
  readonly search: string;
  /** Currently active (highlighted) item ID, or null if none */
  readonly activeId: ItemId | null;
  /** Ordered list of item IDs that pass the current filter */
  readonly filteredIds: readonly ItemId[];
  /**
   * Map of group IDs to their visible item IDs. The keys are in group priority order (lower first; ungrouped
   * items and unregistered group ids count as 0, in first-appearance order), while `filteredIds` and
   * `NAVIGATE` keep the search order: a renderer that draws by `groupedIds` shows the groups in this order,
   * so arrow-key order and display order can differ when group priorities differ.
   */
  readonly groupedIds: ReadonlyMap<GroupId, readonly ItemId[]>;
  /** Count of visible items (shortcut for `filteredIds.length`) */
  readonly filteredCount: number;
  /** Whether async items are currently loading */
  readonly loading: boolean;
  /** Current page identifier (for multi-page navigation) */
  readonly page: string;
  /** Stack of previous pages for back-navigation */
  readonly pageStack: readonly string[];
  /** Whether the command palette dialog is open */
  readonly open: boolean;
  /** Epoch-millisecond timestamp of the last state mutation */
  readonly lastUpdated: number;
}

/** All possible events the state machine accepts */
export type CommandEvent =
  | { readonly type: 'SEARCH_CHANGE'; readonly query: string }
  | { readonly type: 'ITEM_SELECT'; readonly id: ItemId }
  | { readonly type: 'ITEM_ACTIVATE'; readonly id: ItemId }
  | { readonly type: 'NAVIGATE'; readonly direction: 'next' | 'prev' | 'first' | 'last' }
  | { readonly type: 'PAGE_PUSH'; readonly page: string }
  | { readonly type: 'PAGE_POP' }
  | { readonly type: 'OPEN' }
  | { readonly type: 'CLOSE' }
  | { readonly type: 'TOGGLE' }
  | { readonly type: 'ITEMS_LOADED'; readonly items: readonly CommandItem[] }
  /** An async source started (pending true) or finished (pending false) loading; `state.loading` is true while any source is pending */
  | { readonly type: 'LOADING'; readonly source: string; readonly pending: boolean }
  | { readonly type: 'REGISTER_ITEM'; readonly item: CommandItem }
  /** Upsert an item in place: its position is kept (an unknown id is appended), the search index is updated and its shortcut re-bound */
  | { readonly type: 'UPDATE_ITEM'; readonly item: CommandItem }
  | { readonly type: 'UNREGISTER_ITEM'; readonly id: ItemId }
  | { readonly type: 'REGISTER_GROUP'; readonly group: CommandGroup }
  | { readonly type: 'UNREGISTER_GROUP'; readonly id: GroupId };

/** Frecency record for a single item */
export interface FrecencyRecord {
  readonly frequency: number;
  /** Epoch-millisecond timestamp of last usage */
  readonly lastUsed: number;
}

/** Complete frecency data for persistence */
export interface FrecencyData {
  readonly records: ReadonlyMap<ItemId, FrecencyRecord>;
}

/** Pluggable frecency storage interface */
export interface FrecencyStorage extends Disposable {
  load(namespace: string): FrecencyData | Promise<FrecencyData>;
  save(namespace: string, data: FrecencyData): void | Promise<void>;
}

/** Frecency step-weight configuration per recency bucket (hour/day/week/month/older) */
export interface FrecencyDecayConfig {
  readonly hourWeight?: number | undefined;
  readonly dayWeight?: number | undefined;
  readonly weekWeight?: number | undefined;
  readonly monthWeight?: number | undefined;
  readonly olderWeight?: number | undefined;
}

/** Frecency configuration options */
export interface FrecencyOptions {
  /** Turns frecency tracking and re-ranking on. Default false. */
  readonly enabled?: boolean | undefined;
  /** Where the history persists; a storage you pass is yours to dispose, the engine disposes only the in-memory one it creates when you pass none. */
  readonly storage?: FrecencyStorage | undefined;
  readonly namespace?: string | undefined;
  readonly decayConfig?: FrecencyDecayConfig | undefined;
}

/** Default frecency decay configuration */
export const DEFAULT_FRECENCY_DECAY: Required<FrecencyDecayConfig> = {
  hourWeight: 4.0,
  dayWeight: 2.0,
  weekWeight: 1.5,
  monthWeight: 1.0,
  olderWeight: 0.5,
};

/** Options for creating a command machine */
export interface CommandMachineOptions {
  /** Pre-registered items to populate on creation */
  readonly items?: readonly CommandItem[] | undefined;
  /** Pre-registered groups for item categorization */
  readonly groups?: readonly CommandGroup[] | undefined;
  /**
   * Custom filter function, or `false` to disable filtering entirely. It returns a score: above 0 keeps the item
   * (higher ranks first); 0, a negative score or `false` excludes it.
   * In `<Command>`, a new function refilters the current query once; pass a stable function (module scope or
   * `useCallback`) so a parent render does not refilter.
   */
  readonly filter?: ((item: CommandItem, query: string) => number | false) | false | undefined;
  /** Accessible label for the command palette */
  readonly label?: string | undefined;
  /** Initial open state */
  readonly open?: boolean | undefined;
  /** Frecency configuration for usage-aware ranking */
  readonly frecency?: FrecencyOptions | undefined;
  /**
   * Pluggable search engine — drop-in replacement for the default scorer (e.g., WASM engine). A search engine
   * you pass is yours to dispose; the machine disposes only the engine it creates when you pass none.
   */
  readonly searchEngine?: import('./search/types.js').SearchEngine | undefined;
  /**
   * Pluggable search engine, the name `searchEngine` replaces. A search engine you pass is yours to dispose; the
   * machine disposes only the engine it creates when you pass none.
   *
   * @deprecated Use `searchEngine`; it wins when both are set. `search` is removed in 2.0.
   */
  readonly search?: import('./search/types.js').SearchEngine | undefined;
  /** Called for every select of an enabled item. `<Command>` and `Command.Dialog` forward every call. */
  readonly onSelect?: ((id: ItemId) => void) | undefined;
  /**
   * Called when navigation or `ITEM_ACTIVATE` makes an item active (an `ITEM_ACTIVATE` of the active id included); with a
   * controlled `activeId`, also for the candidate of every refilter. `<Command>` and `Command.Dialog` forward one call
   * per distinct value (a repeat of the last forwarded value is dropped); with a controlled `activeId`, they forward
   * every candidate, repeats included.
   */
  readonly onActiveChange?: ((id: ItemId | null) => void) | undefined;
  /**
   * The active (highlighted) item, controlled by the caller. When defined, `state.activeId` mirrors it while that id is
   * listed and enabled, and is `null` otherwise; `null` is a value that means no active item. The machine never
   * chooses the active item itself. Every candidate it would choose (navigation, `ITEM_ACTIVATE` of another id,
   * the refilter's fallback after the list or the query changes) is reported through `onActiveChange(candidate)` on
   * every attempt, repeats included, as a controlled input's `onChange` reports every keystroke the parent refuses;
   * the caller decides. `ITEM_ACTIVATE` of this option's own id applies it to the state without a call, since the
   * caller already knows it. Construction calls no callback. The machine reads the option on every refilter, and
   * `refresh()` applies a changed value without a report. Leave it `undefined` for the machine to own the active item.
   */
  readonly activeId?: ItemId | null | undefined;
  /** Called when the open state changes (`OPEN` while open and `CLOSE` while closed call nothing). `<Command>` and `Command.Dialog` forward one call per distinct value (a repeat of the last forwarded value is dropped). */
  readonly onOpenChange?: ((open: boolean) => void) | undefined;
  /** Called for every `SEARCH_CHANGE`, the same query again included. `<Command>` and `Command.Dialog` forward one call per distinct value (a repeat of the last forwarded value is dropped). */
  readonly onSearchChange?: ((query: string) => void) | undefined;
  /** Whether keyboard navigation loops from last to first item (default: true) */
  readonly loop?: boolean | undefined;
  /**
   * How disabled items are listed: `'show'` keeps them in `filteredIds` under every query (rendered with
   * `aria-disabled`, never active, skipped by navigation and activation, not selectable); `'hide'` drops them
   * from `filteredIds` in every branch (default: `'show'`)
   */
  readonly disabledItems?: 'hide' | 'show' | undefined;
  /**
   * What an item's keyboard shortcut does. `'direct'` (the default through 1.x) calls the item's `onSelect`
   * and binds only items that have one; `'select'` dispatches `ITEM_SELECT` for the item, so the disabled guard,
   * frecency, the select event and `options.onSelect` apply, and binds every enabled item with a shortcut. 2.0 flips
   * the default to `'select'`. Under both, a disabled item is not bound: its shortcut does nothing and leaves the key to the page.
   */
  readonly shortcutAction?: 'select' | 'direct' | undefined;
  /** Accepted but not read yet: Command.List uses fixed thresholds (on above 100 matches, off at 50 or fewer) (default: 100) */
  readonly virtualizeThreshold?: number | undefined;
  /**
   * Telemetry hooks the machine calls at the end of each batch, after its state reports; see
   * `CommandTelemetryHooks` for when each hook fires and its arguments. With none set the machine
   * calls no hook. The machine reads this option at the end of each batch, so a changed value
   * reaches it without a remount; `<Command>` and `<Command.Dialog>` forward the latest
   * `telemetry` prop. `createTelemetryMiddleware` is a standalone helper the machine does not use.
   *
   * @example
   * ```ts
   * const machine = createCommandMachine({
   *   items,
   *   telemetry: {
   *     onPaletteOpen: () => analytics.track('palette_opened'),
   *     // The raw query can hold personal data: report its result, not its text
   *     onSearchComplete: (_query, count, durationMs) =>
   *       analytics.track('search', { resultCount: count, durationMs }),
   *     onItemSelected: (id, _query, position) =>
   *       analytics.track('item_selected', { id, position }),
   *   },
   * });
   * ```
   */
  readonly telemetry?: import('./telemetry.js').CommandTelemetryHooks | undefined;
}

/**
 * Default machine options. The machine reads `loop` and `open` from here when its options leave them out
 * (the other options are opt-ins whose absence is their default); `virtualizeThreshold` is not read yet.
 */
export const DEFAULT_MACHINE_OPTIONS: Partial<CommandMachineOptions> = {
  loop: true,
  virtualizeThreshold: 100,
  open: false,
};

/** Initial state factory */
export function createInitialState(options?: CommandMachineOptions): CommandState {
  return {
    search: '',
    activeId: options?.activeId ?? null,
    filteredIds: [],
    groupedIds: new Map(),
    filteredCount: 0,
    loading: false,
    page: 'root',
    pageStack: [],
    open: options?.open ?? DEFAULT_MACHINE_OPTIONS.open ?? false,
    lastUpdated: Date.now(),
  };
}
