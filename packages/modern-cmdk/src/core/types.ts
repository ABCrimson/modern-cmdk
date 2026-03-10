// packages/command/src/types.ts
// TypeScript 6.0.1-rc — ES2026 target — all modern type features
// Branded types, const type params, NoInfer<T>, satisfies on values, Temporal

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

/** Create a branded {@link ItemId} from a plain string. Ensures well-formed Unicode (ES2026). */
export function itemId(id: string): ItemId {
  return (id.isWellFormed() ? id : id.toWellFormed()) as ItemId;
}

/** Create a branded {@link GroupId} from a plain string. Ensures well-formed Unicode (ES2026). */
export function groupId(id: string): GroupId {
  return (id.isWellFormed() ? id : id.toWellFormed()) as GroupId;
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
  /** Whether this item is disabled (excluded from filtering and selection) */
  readonly disabled?: boolean | undefined;
  /** Callback fired when this item is selected */
  readonly onSelect?: (() => void) | undefined;
  /** Arbitrary metadata attached to the item */
  readonly data?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * A command group for categorizing items.
 * Groups are rendered with headings and sorted by priority.
 */
export interface CommandGroup {
  /** Unique identifier (branded type) */
  readonly id: GroupId;
  /** Display heading text (rendered above the group's items) */
  readonly heading?: string | undefined;
  /** Sort priority — lower values appear first (default: 0) */
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
  /** Map of group IDs to their visible item IDs */
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
  /** Temporal.Instant of the last state mutation (ES2026) */
  readonly lastUpdated: Temporal.Instant;
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
  | { readonly type: 'REGISTER_ITEM'; readonly item: CommandItem }
  | { readonly type: 'UNREGISTER_ITEM'; readonly id: ItemId }
  | { readonly type: 'REGISTER_GROUP'; readonly group: CommandGroup }
  | { readonly type: 'UNREGISTER_GROUP'; readonly id: GroupId };

/** Frecency record for a single item */
export interface FrecencyRecord {
  readonly frequency: number;
  readonly lastUsed: Temporal.Instant;
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

/** Frecency exponential decay bucket configuration */
export interface FrecencyDecayConfig {
  readonly hourWeight?: number | undefined;
  readonly dayWeight?: number | undefined;
  readonly weekWeight?: number | undefined;
  readonly monthWeight?: number | undefined;
  readonly olderWeight?: number | undefined;
}

/** Frecency configuration options */
export interface FrecencyOptions {
  readonly enabled: boolean;
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
} as const satisfies Required<FrecencyDecayConfig>;

/** Options for creating a command machine — const type param for narrowed option inference */
export interface CommandMachineOptions {
  /** Pre-registered items to populate on creation */
  readonly items?: readonly CommandItem[] | undefined;
  /** Pre-registered groups for item categorization */
  readonly groups?: readonly CommandGroup[] | undefined;
  /** Custom filter function, or `false` to disable filtering entirely */
  readonly filter?: ((item: CommandItem, query: string) => number | false) | false | undefined;
  /** Accessible label for the command palette */
  readonly label?: string | undefined;
  /** Initial open state */
  readonly open?: boolean | undefined;
  /** Frecency configuration for usage-aware ranking */
  readonly frecency?: FrecencyOptions | undefined;
  /** Pluggable search engine — drop-in replacement for the default scorer (e.g., WASM engine) */
  readonly search?: import('./search/types.js').SearchEngine | undefined;
  /** Callback fired when an item is selected */
  readonly onSelect?: ((id: ItemId) => void) | undefined;
  /** Callback fired when the active (highlighted) item changes */
  readonly onActiveChange?: ((id: ItemId | null) => void) | undefined;
  /** Callback fired when the dialog open state changes */
  readonly onOpenChange?: ((open: boolean) => void) | undefined;
  /** Callback fired when the search query changes */
  readonly onSearchChange?: ((query: string) => void) | undefined;
  /** Whether keyboard navigation loops from last to first item (default: true) */
  readonly loop?: boolean | undefined;
  /** Item count threshold for automatic virtualization (default: 100) */
  readonly virtualizeThreshold?: number | undefined;
}

/** Default machine options */
export const DEFAULT_MACHINE_OPTIONS: Partial<CommandMachineOptions> = {
  loop: true,
  virtualizeThreshold: 100,
  open: false,
} as const satisfies Partial<CommandMachineOptions>;

/** Initial state factory */
export function createInitialState(options?: CommandMachineOptions): CommandState {
  return {
    search: '',
    activeId: null,
    filteredIds: [],
    groupedIds: new Map(),
    filteredCount: 0,
    loading: false,
    page: 'root',
    pageStack: [],
    open: options?.open ?? false,
    lastUpdated: Temporal.Now.instant(),
  };
}
