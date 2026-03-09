// modern-cmdk-search-wasm — Optional WASM-accelerated fuzzy search
// ES2026 target — TypeScript 6.0.1-rc — ESM-only

export { createWasmSearchEngine } from './wasm-engine.js';
export type { WorkerMessage, WorkerResponse } from './worker.js';
export type { WorkerSearchEngine, WorkerSearchEngineOptions } from './worker-engine.js';
export { createWorkerSearchEngine } from './worker-engine.js';
