// tests/unit/use-devtools.test.tsx
// SEC-52 (devtools half): useCommandDevtools registers its label in development and stays inert in production.
// RA-48: one state change publishes one event per name, carrying the new state.

import type { CommandMachine } from 'modern-cmdk';
import type * as ReactEntry from 'modern-cmdk/react';
import { act, use } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DEVTOOLS_KEY = '__MODERN_CMDK_DEVTOOLS__';
const DEPRECATED_KEY = '__CRIMSON_COMMAND_DEVTOOLS__';
const DEVTOOLS_EVENT = 'modern-cmdk-devtools';
const DEPRECATED_EVENT = 'crimson-command-devtools';

function clearRegistries(): void {
  Reflect.deleteProperty(globalThis, DEVTOOLS_KEY);
  Reflect.deleteProperty(globalThis, DEPRECATED_KEY);
}

function Probe({ devtools, label }: { devtools: (label: string) => void; label: string }): null {
  devtools(label);
  return null;
}

interface Mounted {
  readonly machine: CommandMachine;
  readonly cleanup: () => Promise<void>;
}

/** Fresh module graph so the hook's module-scoped dev check re-reads the stubbed NODE_ENV. */
async function mountDevtools(label: string): Promise<Mounted> {
  vi.resetModules();
  const { Command, CommandStableContext, useCommandDevtools }: typeof ReactEntry = await import(
    'modern-cmdk/react'
  );
  let machine: CommandMachine | undefined;
  const devtools = (probeLabel: string): void => {
    useCommandDevtools(probeLabel);
    machine = use(CommandStableContext)?.machine;
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Command label="devtools test">
        <Probe devtools={devtools} label={label} />
        <Command.List>
          <Command.Item value="alpha">Alpha</Command.Item>
        </Command.List>
      </Command>,
    );
  });
  if (!machine) throw new Error('the probe did not render inside <Command>');
  return {
    machine,
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('useCommandDevtools', () => {
  let cleanup: (() => Promise<void>) | undefined;

  beforeEach(clearRegistries);

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.resetModules();
    clearRegistries();
  });

  it('SEC-52: registers the label when NODE_ENV is development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    ({ cleanup } = await mountDevtools('unit-dev'));
    const registry = Reflect.get(globalThis, DEVTOOLS_KEY) as Map<string, unknown> | undefined;
    expect(registry?.has('unit-dev')).toBe(true);
  });

  it('SEC-52: leaves the registry uncreated when NODE_ENV is production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    ({ cleanup } = await mountDevtools('unit-prod'));
    expect(Reflect.has(globalThis, DEVTOOLS_KEY)).toBe(false);
    expect(Reflect.has(globalThis, DEPRECATED_KEY)).toBe(false);
  });

  it('D30: the new and the deprecated global hold the same registry', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    ({ cleanup } = await mountDevtools('unit-alias'));
    const registry = Reflect.get(globalThis, DEVTOOLS_KEY) as Map<string, unknown> | undefined;
    expect(registry?.has('unit-alias')).toBe(true);
    expect(Reflect.get(globalThis, DEPRECATED_KEY)).toBe(registry);

    // Another copy of the library may have created the old Map first: the hook reuses it under both names.
    await cleanup();
    cleanup = undefined;
    clearRegistries();
    const existing = new Map<string, unknown>();
    Reflect.set(globalThis, DEPRECATED_KEY, existing);
    ({ cleanup } = await mountDevtools('unit-existing'));
    expect(Reflect.get(globalThis, DEVTOOLS_KEY)).toBe(existing);
    expect(existing.has('unit-existing')).toBe(true);
  });

  it('RA-48: one state change dispatches one event per name with the new state', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    // The scheduler batches on requestAnimationFrame: fake only the frame clock, as machine-lifecycle.test.ts does.
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    const mounted = await mountDevtools('unit-events');
    cleanup = mounted.cleanup;
    type Detail = { label: string; state: { searchQuery: string } };
    const names = [DEVTOOLS_EVENT, DEPRECATED_EVENT] as const;
    const events = new Map<string, CustomEvent<Detail>[]>(names.map((name) => [name, []]));
    const listeners = names.map((name) => {
      const listener = (event: Event): void => {
        events.get(name)?.push(event as CustomEvent<Detail>);
      };
      globalThis.addEventListener(name, listener);
      return [name, listener] as const;
    });
    try {
      await act(async () => {
        mounted.machine.send({ type: 'SEARCH_CHANGE', query: 'alp' });
        vi.advanceTimersToNextFrame();
      });
    } finally {
      for (const [name, listener] of listeners) globalThis.removeEventListener(name, listener);
    }
    for (const name of names) {
      const received = events.get(name) ?? [];
      expect(received, name).toHaveLength(1);
      expect(received[0]?.detail.label, name).toBe('unit-events');
      expect(received[0]?.detail.state.searchQuery, name).toBe('alp');
    }
    expect(events.get(DEVTOOLS_EVENT)?.[0]?.detail).toEqual(
      events.get(DEPRECATED_EVENT)?.[0]?.detail,
    );
  });
});
