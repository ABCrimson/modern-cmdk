// tests/dist/production-bundle.test.ts
// PERF-15, D105: the BUILT entries (packages/modern-cmdk/dist) bundled the way @size-limit/rolldown bundles them
// (rolldown, minify on, treeshake on, react and radix-ui external), once with `process.env.NODE_ENV` defined as
// "production" through `transform.define` and once without. Each development guard is
// `dev && process.env.NODE_ENV !== 'production'`, where `dev` is a module-scope flag (core/utils/env.ts,
// react/env.ts) that is false where `process` does not exist. So the production bundle folds the guarded branch and
// drops the strings inside it, a development bundle without a `process` global (Vite's dev server defines the
// expression but the browser has no `process`) keeps the branch, and an unbundled import without `process` does not
// throw. Needs `pnpm build` first.
//
// `platform: 'neutral'` makes the define the only variable: on rolldown's default (browser) platform the minifier
// already treats `process.env.NODE_ENV` as "production" when `output.minify` is on (observed with rolldown 1.2.16:
// the unminified bundle keeps the leak warning, the minified one drops it), so a control without a define would
// lose the strings too.
//
// rolldown is not a root dependency: the file resolves the copy @size-limit/rolldown uses (14.3.0 depends on
// rolldown ^1.2.15), through @size-limit/preset-small-lib, so the test bundles with the measuring tool's own engine.
// `transform.define` is TransformOptions.define and `output.format`, `output.name` and `output.globals` are
// OutputOptions in node_modules/rolldown/dist/shared/define-config-*.d.mts.

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const distRoot: string = resolve(import.meta.dirname, '../../packages/modern-cmdk/dist');
const distBuilt: boolean =
  existsSync(join(distRoot, 'core/index.mjs')) &&
  existsSync(join(distRoot, 'react/index.mjs')) &&
  existsSync(join(distRoot, 'react/dialog.mjs'));

if (!distBuilt && process.env.CI) {
  // A silent pass would hide a missing build: fail the whole file loudly in CI.
  throw new Error(
    `${distRoot} is missing its core, react or dialog build: run pnpm build first (tests/dist needs the built package)`,
  );
}
if (!distBuilt) {
  // biome-ignore lint/suspicious/noConsole: tells the developer why this file is skipped
  console.warn(`[tests/dist] skipped: ${distRoot} is not built: run pnpm build first`);
}

/** The slice of rolldown's `build()` this file calls. */
interface RolldownBuild {
  readonly build: (options: {
    readonly input: string;
    readonly external?: RegExp;
    readonly platform: 'neutral';
    readonly treeshake: boolean;
    readonly write: false;
    readonly transform?: { readonly define: Readonly<Record<string, string>> };
    readonly output: {
      readonly minify: boolean;
      readonly format?: 'iife';
      readonly name?: string;
      readonly globals?: Readonly<Record<string, string>>;
    };
    readonly onLog: (level: string, log: { readonly code?: string }) => void;
  }) => Promise<{
    readonly output: readonly { readonly type: string; readonly code?: string }[];
  }>;
}

/** Every development-only string a production bundle must not carry; one entry per guarded string (the devtools branch carries four: the key, its alias and the two event names). */
const DEV_ONLY_STRINGS: readonly string[] = [
  // core/search/index.ts: the FinalizationRegistry leak warning
  'was garbage collected without being disposed',
  // react/hooks/use-devtools.ts: the global devtools registry key and its deprecated alias
  '__MODERN_CMDK_DEVTOOLS__',
  '__CRIMSON_COMMAND_DEVTOOLS__',
  'modern-cmdk-devtools',
  'crimson-command-devtools',
  // react/hooks/use-command-setup.ts: the init-only prop warning
  'is read once, when the component mounts',
];

const ENTRIES: readonly {
  readonly name: string;
  readonly file: string;
  readonly needs: readonly string[];
}[] = [
  { name: 'dist/core/index.mjs', file: 'core/index.mjs', needs: DEV_ONLY_STRINGS.slice(0, 1) },
  { name: 'dist/react/index.mjs', file: 'react/index.mjs', needs: DEV_ONLY_STRINGS },
];

async function loadRolldown(): Promise<RolldownBuild> {
  const root = createRequire(import.meta.url);
  const preset = createRequire(root.resolve('@size-limit/preset-small-lib'));
  const sizeLimitRolldown = createRequire(preset.resolve('@size-limit/rolldown'));
  return (await import(pathToFileURL(sizeLimitRolldown.resolve('rolldown')).href)) as RolldownBuild;
}

/** What a bundle defines `process.env.NODE_ENV` as; `undefined` leaves the expression alone. */
type Define = 'production' | 'development' | undefined;

/**
 * Bundles one built entry with its own dependencies inlined, react and radix-ui external, minified. With `iifeName`
 * the output is an IIFE assigned to that global and every external import reads the global `__react`, so `vm` can
 * evaluate the bundle against a stub.
 */
async function bundle(file: string, define: Define, iifeName?: string): Promise<string> {
  const { build } = await loadRolldown();
  const result = await build({
    input: join(distRoot, file),
    external: /^(react|react-dom|radix-ui)($|\/)/u,
    platform: 'neutral',
    treeshake: true,
    write: false,
    ...(define === undefined
      ? {}
      : { transform: { define: { 'process.env.NODE_ENV': JSON.stringify(define) } } }),
    output: {
      minify: true,
      ...(iifeName === undefined
        ? {}
        : {
            format: 'iife' as const,
            name: iifeName,
            globals: {
              react: '__react',
              'react/jsx-runtime': '__react',
              'react-dom': '__react',
              'radix-ui': '__react',
            },
          }),
    },
    onLog(_level: string, log: { readonly code?: string }): void {
      if (log.code === 'UNRESOLVED_IMPORT') throw new Error(`unresolved import in ${file}`);
    },
  });
  return result.output
    .map((chunk) => (chunk.type === 'chunk' ? (chunk.code ?? '') : ''))
    .join('\n');
}

/** A `vm` context with a `window` and the given globals, and no `process` global: a fresh context has none. */
function browserLikeContext(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const sandbox: Record<string, unknown> = { window: {}, ...extra };
  createContext(sandbox);
  return sandbox;
}

describe.skipIf(!distBuilt)('built package: production bundle', () => {
  // Without the define the guards stay live: the control proves the strings are findable in each bundle.
  for (const entry of ENTRIES) {
    it(`control: the bundle of ${entry.name} without a define carries its development-only strings`, async () => {
      const code = await bundle(entry.file, undefined);
      for (const needle of entry.needs) expect(code, needle).toContain(needle);
    });
  }

  it('PERF-15: a production-defined bundle of the built dist carries none of the development-only strings', async () => {
    for (const entry of ENTRIES) {
      const code = await bundle(entry.file, 'production');
      for (const needle of DEV_ONLY_STRINGS)
        expect(code, `${entry.name}: ${needle}`).not.toContain(needle);
    }
    const dialog = await bundle('react/dialog.mjs', 'production');
    for (const needle of DEV_ONLY_STRINGS)
      expect(dialog, `dist/react/dialog.mjs: ${needle}`).not.toContain(needle);
  });

  it('PERF-15: a development-defined bundle without a process global turns the development branches on', async () => {
    // core: the module constructs its leak-detection FinalizationRegistry at load. A stub keeps each registry's
    // callback; calling them all, the one the search engine registers warns with the leak message.
    const callbacks: ((label: string) => void)[] = [];
    const warnings: string[] = [];
    const coreContext = browserLikeContext({
      console: { warn: (message: string): number => warnings.push(message) },
      FinalizationRegistry: class {
        constructor(callback: (label: string) => void) {
          callbacks.push(callback);
        }
        register(): void {}
        unregister(): void {}
      },
    });
    expect('process' in coreContext, 'core: the context has no process global').toBe(false);
    runInContext(await bundle('core/index.mjs', 'development', '__core'), coreContext);
    for (const callback of callbacks) {
      try {
        callback('probe');
      } catch {
        // another registry's callback expects a disposable, not a label
      }
    }
    expect(warnings.join(' '), 'core: the leak registry exists').toContain(DEV_ONLY_STRINGS[0]);

    // react: useCommandDevtools publishes its state on the global registry from inside an effect. A stub react runs
    // the effect at once, and `use` returns one value that serves as the stable context; its machine reports the state.
    const state = {
      filteredIds: [],
      search: '',
      activeId: null,
      page: 'root',
      pageStack: [],
      open: false,
      loading: false,
    };
    const fake = {
      machine: { getRegistry: () => new Map(), getState: () => state, subscribe: () => () => {} },
    };
    const overrides: Record<string, unknown> = {
      use: () => fake,
      useEffect: (effect: () => void) => void effect(),
      useRef: (current: unknown) => ({ current }),
      createContext: () => ({}),
      Component: class {},
    };
    const reactStub = new Proxy(overrides, {
      get: (target: Record<string, unknown>, key: string | symbol): unknown =>
        target[key as string] ?? (() => undefined),
    });
    const reactContext = browserLikeContext({ __react: reactStub });
    expect('process' in reactContext, 'react: the context has no process global').toBe(false);
    const reactCode = await bundle('react/index.mjs', 'development', '__cmdkReact');
    runInContext(`${reactCode}\n__cmdkReact.useCommandDevtools('probe');`, reactContext);
    const devtools = reactContext.__MODERN_CMDK_DEVTOOLS__ as Map<string, unknown> | undefined;
    expect([...(devtools?.keys() ?? [])], 'react: the devtools registry holds the probe').toEqual([
      'probe',
    ]);
    expect(
      reactContext.__CRIMSON_COMMAND_DEVTOOLS__,
      'react: the deprecated name is the same Map',
    ).toBe(devtools);
  });

  it('PERF-15: an unbundled import without a process global does not throw', async () => {
    // dist/core/index.mjs as shipped (no define), as an IIFE so that `vm` can run it: the bare
    // `process.env.NODE_ENV` read sits in env.ts's try/catch, and the guard's first operand is false before the
    // second reads `process`.
    const code = await bundle('core/index.mjs', undefined, '__core');
    const context = browserLikeContext();
    expect('process' in context).toBe(false);
    expect(() => runInContext(code, context)).not.toThrow();
  });
});
