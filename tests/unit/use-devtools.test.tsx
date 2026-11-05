// tests/unit/use-devtools.test.tsx
// SEC-52 (devtools half): useCommandDevtools registers its label in development and stays inert in production.

import type * as ReactEntry from 'modern-cmdk/react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DEVTOOLS_KEY = '__CRIMSON_COMMAND_DEVTOOLS__';

function Probe({ devtools, label }: { devtools: (label: string) => void; label: string }): null {
  devtools(label);
  return null;
}

/** Fresh module graph so the hook's module-scoped dev check re-reads the stubbed NODE_ENV. */
async function mountDevtools(label: string): Promise<() => Promise<void>> {
  vi.resetModules();
  const { Command, useCommandDevtools }: typeof ReactEntry = await import('modern-cmdk/react');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Command label="devtools test">
        <Probe devtools={useCommandDevtools} label={label} />
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

describe('useCommandDevtools', () => {
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

  it('SEC-52: registers the label when NODE_ENV is development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    cleanup = await mountDevtools('unit-dev');
    const registry = Reflect.get(globalThis, DEVTOOLS_KEY) as Map<string, unknown> | undefined;
    expect(registry?.has('unit-dev')).toBe(true);
  });

  it('SEC-52: leaves the registry uncreated when NODE_ENV is production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    cleanup = await mountDevtools('unit-prod');
    expect(Reflect.has(globalThis, DEVTOOLS_KEY)).toBe(false);
  });
});
