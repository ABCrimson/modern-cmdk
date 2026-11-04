// Tests for the main-thread worker engine, driven through a FakeWorker that answers the real
// message protocol of worker.ts. Runs without pkg/ (nothing here loads the WASM module).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import tsdownConfigSource from '../tsdown.config.ts?raw';
import type { WorkerMessage, WorkerResponse } from './worker.js';
import { createWorkerSearchEngine } from './worker-engine.js';
import workerEngineSource from './worker-engine.ts?raw';

vi.mock('./wasm-engine.js', () => ({
  createWasmSearchEngine: async () => ({
    isWasm: false,
    index(): void {},
    *search(): Generator<{ id: string; score: number; matches: never[] }> {
      yield { id: 'main', score: 1, matches: [] };
    },
    remove(): void {},
    clear(): void {},
    [Symbol.dispose](): void {},
    async [Symbol.asyncDispose](): Promise<void> {},
  }),
}));

type Listener = (event: never) => void;

let workers: FakeWorker[] = [];
let constructorError: Error | null = null;
let autoReady = true;
/** When true the fake holds every message, so tests release the answers by hand. */
let manual = false;

class FakeWorker {
  readonly url: URL;
  readonly options: WorkerOptions | undefined;
  readonly received: WorkerMessage[] = [];
  terminated = false;
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly held: WorkerMessage[] = [];

  constructor(url: URL, options?: WorkerOptions) {
    if (constructorError) throw constructorError;
    this.url = url;
    this.options = options;
    workers.push(this);
    if (autoReady) queueMicrotask(() => this.emit('message', { data: { type: 'ready' } }));
  }

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  emit(type: string, event: object): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event as never);
  }

  postMessage(message: WorkerMessage): void {
    this.received.push(message);
    if (manual) {
      this.held.push(message);
      return;
    }
    queueMicrotask(() => this.answer(message));
  }

  /** Answer the oldest held message (manual mode). */
  release(): void {
    const message = this.held.shift();
    if (message) this.answer(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  private answer(message: WorkerMessage): void {
    const reply = (data: WorkerResponse): void => this.emit('message', { data });
    switch (message.type) {
      case 'index':
        reply({ type: 'indexed' });
        break;
      case 'clear':
      case 'remove':
        reply({ type: 'cleared' });
        break;
      case 'search': {
        const fakes = [
          { id: 'a', score: 0.5, matches: [[0, 1]] as const },
          { id: 'b', score: 0.25, matches: [[1, 2]] as const },
        ];
        if (message.scoresBuffer) {
          const view = new Float32Array(message.scoresBuffer);
          fakes.forEach((fake, index) => {
            view[index] = fake.score;
          });
          reply({
            type: 'results-sab',
            count: fakes.length,
            ids: fakes.map((fake) => fake.id),
            matches: fakes.map((fake) => fake.matches),
          });
        } else {
          reply({ type: 'results', results: fakes });
        }
        break;
      }
      case 'dispose':
        break;
    }
  }
}

beforeEach(() => {
  workers = [];
  constructorError = null;
  autoReady = true;
  manual = false;
  vi.stubGlobal('Worker', FakeWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createWorkerSearchEngine', () => {
  it('resolves only after the worker signals ready', async () => {
    autoReady = false;
    let settled = false;
    const created = createWorkerSearchEngine().then((engine) => {
      settled = true;
      return engine;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    workers[0]?.emit('message', { data: { type: 'ready' } });
    const engine = await created;
    expect(settled).toBe(true);
    expect(engine.isWorker).toBe(true);
    expect(engine.useSharedMemory).toBe(false);
    engine[Symbol.dispose]();
  });

  it('falls back when the worker reports an error before ready', async () => {
    autoReady = false;
    const created = createWorkerSearchEngine();
    await Promise.resolve();
    workers[0]?.emit('message', { data: { type: 'error', message: 'wasm init failed' } });
    const engine = await Promise.race([
      created,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('never settled')), 500)),
    ]);
    expect(engine.isWorker).toBe(false);
    expect(workers[0]?.terminated).toBe(true);
  });

  it('returns the fake scores in order from searchAsync', async () => {
    const engine = await createWorkerSearchEngine();
    const results = await engine.searchAsync('a');
    expect(results.map((result) => result.id)).toEqual(['a', 'b']);
    expect(results.map((result) => result.score)).toEqual([0.5, 0.25]);
    expect([...engine.search('a', [])].map((result) => result.id)).toEqual(['a', 'b']);
    engine[Symbol.dispose]();
  });

  it('reads scores from the shared buffer when cross-origin isolated', async () => {
    vi.stubGlobal('crossOriginIsolated', true);
    const engine = await createWorkerSearchEngine({ maxResults: 4 });
    expect(engine.useSharedMemory).toBe(true);
    const results = await engine.searchAsync('a');
    expect(results.map((result) => result.score)).toEqual([0.5, 0.25]);
    engine[Symbol.dispose]();
  });

  it('queues a second request until the first has been answered', async () => {
    const engine = await createWorkerSearchEngine();
    const worker = workers[0] as FakeWorker;
    manual = true;

    const first = engine.searchAsync('one');
    const second = engine.searchAsync('two');
    await Promise.resolve();
    expect(worker.received.map((m) => m.type)).toEqual(['search']);

    worker.release();
    await first;
    await Promise.resolve();
    expect(worker.received.map((m) => m.type)).toEqual(['search', 'search']);
    expect((worker.received[0] as { query: string }).query).toBe('one');
    expect((worker.received[1] as { query: string }).query).toBe('two');

    worker.release();
    expect((await second).length).toBe(2);
    engine[Symbol.dispose]();
  });

  it('dispose terminates the worker and rejects pending and queued requests', async () => {
    const engine = await createWorkerSearchEngine();
    const worker = workers[0] as FakeWorker;
    manual = true;

    const settled = Promise.allSettled([engine.searchAsync('one'), engine.searchAsync('two')]);
    engine[Symbol.dispose]();

    const [first, second] = await settled;
    expect(first?.status).toBe('rejected');
    expect(second?.status).toBe('rejected');
    expect(worker.terminated).toBe(true);
    await expect(engine.searchAsync('three')).rejects.toThrow(/disposed/);
  });

  it('asyncDispose terminates the worker without waiting for a reply', async () => {
    const engine = await createWorkerSearchEngine();
    const worker = workers[0] as FakeWorker;
    await engine[Symbol.asyncDispose]();
    expect(worker.terminated).toBe(true);
    expect(worker.received.at(-1)).toEqual({ type: 'dispose' });
  });

  it('falls back to a main-thread engine when Worker construction throws', async () => {
    constructorError = new Error('blocked by CSP');
    const engine = await createWorkerSearchEngine();
    expect(engine.isWorker).toBe(false);
    await expect(engine.searchAsync('a')).resolves.toBeDefined();
    await engine[Symbol.asyncDispose]();
    // Vitest fails the run on any unhandled rejection raised while this settles
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('builds the worker URL from a file the build emits', async () => {
    const engine = await createWorkerSearchEngine();
    const worker = workers[0] as FakeWorker;
    expect(worker.options).toEqual({ type: 'module' });
    // Vite maps the .js specifier back to src/worker.ts in dev; a built package keeps worker.js
    expect(worker.url.pathname.split('/').at(-1)).toMatch(/^worker[.](js|ts)$/);
    expect(workerEngineSource).toContain("new URL('./worker.js', import.meta.url)");

    // tsdown emits that file as dist/worker.js from this second entry
    expect(tsdownConfigSource).toMatch(/entry:[^}]*worker: 'src[/]worker[.]ts'/);
    engine[Symbol.dispose]();
  });
});
