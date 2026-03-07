// @crimson_dev/command — Framework-agnostic headless command palette engine
// ES2026 target — TypeScript 6.0.1-rc — ESM-only

export type {
  CommandState,
  CommandEvent,
  CommandItem,
  CommandGroup,
  CommandMachineOptions,
  ItemId,
  GroupId,
  FrecencyOptions,
  FrecencyRecord,
  FrecencyData,
  FrecencyStorage,
  FrecencyDecayConfig,
} from './types.js';

export {
  itemId,
  groupId,
  createInitialState,
  DEFAULT_FRECENCY_DECAY,
  DEFAULT_MACHINE_OPTIONS,
} from './types.js';

export type { SearchEngine, SearchResult, ScorerFn } from './search/types.js';

export type { CommandMachine } from './machine.js';

export { createCommandMachine } from './machine.js';
export { createSearchEngine } from './search/index.js';
export { scoreItem } from './search/default-scorer.js';
export { scoreItemAsync, batchScoreItems } from './search/fuzzy-scorer.js';
export { CommandRegistry } from './registry.js';
export { TypedEmitter } from './utils/event-emitter.js';
export { createScheduler } from './utils/scheduler.js';
export { computeFrecencyBonus, FrecencyEngine } from './frecency/index.js';
export { MemoryFrecencyStorage } from './frecency/memory-storage.js';
export { IdbFrecencyStorage } from './frecency/idb-storage.js';
export { parseShortcut, formatShortcut } from './keyboard/parser.js';
export { matchesShortcut, findMatchingShortcut, detectConflicts } from './keyboard/matcher.js';
export { KeyboardShortcutRegistry } from './keyboard/index.js';
