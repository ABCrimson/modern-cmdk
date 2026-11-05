// modern-cmdk — Codemod: the worker-thread entry, and the one place a file is transformed.
//
// transformFile() reads a file, routes it (script, stylesheet or skip) and runs the transform;
// it never writes. cli.ts calls it in-process (--concurrency=1, or an injected loader) and this
// module's own worker side calls it for each path the main thread posts. The worker is started
// by cli.ts as `new Worker(new URL('./worker.mjs', import.meta.url), { workerData })`; the
// workerData marker below keeps importing this module for transformFile() from starting a loop.
// The transform module is loaded once, from `./transforms/<name>.mjs` next to this file; if that
// import fails, every file's outcome carries the error, so the run fails loudly on the first file.
// Writes, the dry-run diff and the summary stay on the main thread.

import { readFile } from 'node:fs/promises';
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import type { API, JSCodeshift } from 'jscodeshift';
import jscodeshift from 'jscodeshift';
import type { TransformModule } from './cli.js';
import { type ParserName, parserFor, routeFor } from './files.js';

/** What a worker (or the in-process path) reports for one file. */
export interface FileOutcome {
  readonly path: string;
  /** The transform produced different text; `output` is that text. */
  readonly changed: boolean;
  readonly output?: string;
  /** The file's text before the transform; only when asked for (a dry run needs it for the diff). */
  readonly source?: string;
  /** Routed to no transform: an unsupported extension, or a stylesheet with no stylesheet transform. */
  readonly skipped?: boolean;
  readonly error?: string;
  /** One entry per `api.report` call (or stylesheet `report`) the transform made. */
  readonly reports: readonly string[];
}

/** The workerData cli.ts starts a worker with. */
export interface WorkerInit {
  readonly kind: 'modern-cmdk-codemod-worker';
  readonly transform: string;
  /** Return the pre-transform text with a changed file (--dry-run). */
  readonly keepSource: boolean;
}

export type ApiForParser = (parser: ParserName, report: (message: string) => void) => API;

/** One jscodeshift API per parser; the API object itself is per file so reports carry the file. */
export function createApiFactory(): ApiForParser {
  const parsers = new Map<ParserName, JSCodeshift>();
  return (parser: ParserName, report: (message: string) => void): API => {
    let j = parsers.get(parser);
    if (j === undefined) {
      j = jscodeshift.withParser(parser);
      parsers.set(parser, j);
    }
    return { jscodeshift: j, j, stats: (): void => {}, report };
  };
}

/** Transform one file; a thrown error becomes `error`, with the reports made before it. */
export async function transformFile(
  path: string,
  mod: TransformModule,
  apiForParser: ApiForParser,
  keepSource: boolean,
): Promise<FileOutcome> {
  const reports: string[] = [];
  const report = (message: string): void => void reports.push(message);
  try {
    const route = routeFor(path);
    if (route === 'skip' || (route === 'stylesheet' && mod.transformStylesheet === undefined)) {
      return { path, changed: false, skipped: true, reports };
    }
    const source = await readFile(path, 'utf-8');
    const output =
      route === 'script'
        ? mod.default({ path, source }, apiForParser(parserFor(path) as ParserName, report))
        : (mod.transformStylesheet as NonNullable<TransformModule['transformStylesheet']>)(
            source,
            report,
          );
    if (output === source) return { path, changed: false, reports };
    return { path, changed: true, output, ...(keepSource ? { source } : {}), reports };
  } catch (err) {
    return {
      path,
      changed: false,
      error: err instanceof Error ? err.message : String(err),
      reports,
    };
  }
}

function isWorkerInit(value: unknown): value is WorkerInit {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'modern-cmdk-codemod-worker'
  );
}

if (!isMainThread && parentPort !== null && isWorkerInit(workerData)) {
  const port = parentPort;
  const { transform, keepSource } = workerData;
  const apiForParser = createApiFactory();
  const loaded = import(
    /* @vite-ignore */ new URL(`./transforms/${transform}.mjs`, import.meta.url).href
  ) as Promise<TransformModule>;
  // The failure is reported per file below; this branch only keeps it from being unhandled.
  loaded.catch((): void => {});
  port.on('message', async (path: string): Promise<void> => {
    let outcome: FileOutcome;
    try {
      outcome = await transformFile(path, await loaded, apiForParser, keepSource);
    } catch (err) {
      outcome = {
        path,
        changed: false,
        error: `cannot load transform "${transform}": ${err instanceof Error ? err.message : String(err)}`,
        reports: [],
      };
    }
    port.postMessage(outcome);
  });
}
