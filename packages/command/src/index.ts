// @crimson_dev/command — Framework-agnostic headless command palette engine
// ES2026 target — TypeScript 6.0.1-rc — ESM-only

export { IdbFrecencyStorage } from './frecency/idb-storage.js';
export { computeFrecencyBonus, FrecencyEngine } from './frecency/index.js';
export { MemoryFrecencyStorage } from './frecency/memory-storage.js';
export { KeyboardShortcutRegistry } from './keyboard/index.js';
export { detectConflicts, findMatchingShortcut, matchesShortcut } from './keyboard/matcher.js';
export { formatShortcut, parseShortcut } from './keyboard/parser.js';
export type { CommandMachine } from './machine.js';
export { createCommandMachine } from './machine.js';
export { CommandRegistry } from './registry.js';
export { scoreItem } from './search/default-scorer.js';
export { batchScoreItems, scoreItemAsync } from './search/fuzzy-scorer.js';
export { createSearchEngine } from './search/index.js';
export type { ScorerFn, SearchEngine, SearchResult } from './search/types.js';
export type { CommandTelemetryHooks, TelemetryMiddleware } from './telemetry.js';
export { createTelemetryMiddleware } from './telemetry.js';
export type {
  CommandEvent,
  CommandGroup,
  CommandItem,
  CommandMachineOptions,
  CommandState,
  FrecencyData,
  FrecencyDecayConfig,
  FrecencyOptions,
  FrecencyRecord,
  FrecencyStorage,
  GroupId,
  ItemId,
} from './types.js';
export {
  createInitialState,
  DEFAULT_FRECENCY_DECAY,
  DEFAULT_MACHINE_OPTIONS,
  groupId,
  itemId,
} from './types.js';
export { TypedEmitter } from './utils/event-emitter.js';
export { createScheduler } from './utils/scheduler.js';
