// tests/dist/devtools.test.tsx
// Exercises the BUILT package (packages/modern-cmdk/dist), not the src alias used by
// tests/unit: a free global in the bundle (the old `__DEV__` reference) only throws there.
// Needs `pnpm build` first — CI builds before `vitest run`.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DEVTOOLS_KEY = '__CRIMSON_COMMAND_DEVTOOLS__';
const distEntry: string = resolve(
  import.meta.dirname,
  '../../packages/modern-cmdk/dist/react/index.mjs',
);
const distBuilt: boolean = existsSync(distEntry);

if (!distBuilt && process.env.CI) {
  // A silent pass would hide a missing build — fail the whole file loudly in CI.
  throw new Error(
    `${distEntry} is missing — run pnpm build first (tests/dist needs the built package)`,
  );
}
if (!distBuilt) {
  // biome-ignore lint/suspicious/noConsole: tells the developer why this file is skipped
  console.warn(`[tests/dist] skipped: ${distEntry} is missing — run pnpm build first`);
}

type DistReact = typeof import('modern-cmdk/react');

/** Calls the built hook from inside <Command>, where the machine contexts exist. */
function DevtoolsProbe({
  devtools,
  label,
}: {
  devtools: DistReact['useCommandDevtools'];
  label: string;
}): null {
  devtools(label);
  return null;
}

/** Loads the built bundle together with the React copies it renders with. */
async function loadDist(): Promise<{
  dist: DistReact;
  act: typeof import('react').act;
  createRoot: typeof import('react-dom/client').createRoot;
}> {
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const dist: DistReact = await import(/* @vite-ignore */ pathToFileURL(distEntry).href);
  return { dist, act, createRoot };
}

/** Mounts <Command> with a child calling useCommandDevtools(label) and returns the cleanup. */
async function mountWithDevtools(label: string): Promise<() => Promise<void>> {
  const { dist, act, createRoot } = await loadDist();
  const { Command, useCommandDevtools } = dist;

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Command label="dist test">
        <DevtoolsProbe devtools={useCommandDevtools} label={label} />
        <Command.Input />
        <Command.List>
          <Command.Item value="alpha">Alpha</Command.Item>
        </Command.List>
      </Command>,
    );
  });
  return async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  };
}

describe.skipIf(!distBuilt)('built package: useCommandDevtools', () => {
  let cleanup: (() => Promise<void>) | undefined;

  beforeEach(() => {
    Reflect.deleteProperty(globalThis, DEVTOOLS_KEY);
  });

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
    vi.unstubAllEnvs();
    vi.resetModules();
    Reflect.deleteProperty(globalThis, DEVTOOLS_KEY);
  });

  it('should not throw and should register the label when NODE_ENV is not production', async () => {
    cleanup = await mountWithDevtools('dist-test');

    const registry = Reflect.get(globalThis, DEVTOOLS_KEY);
    expect(registry).toBeInstanceOf(Map);
    expect((registry as Map<string, unknown>).has('dist-test')).toBe(true);
  });

  it('should leave the devtools registry uncreated when NODE_ENV is production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    cleanup = await mountWithDevtools('dist-test');

    expect(Reflect.has(globalThis, DEVTOOLS_KEY)).toBe(false);
  });
});
