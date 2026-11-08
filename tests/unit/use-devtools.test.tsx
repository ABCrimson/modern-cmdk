// tests/unit/use-devtools.test.tsx
// SEC-52 (devtools half): useCommandDevtools registers its label in development and stays inert in production.
// RA-48: one state change publishes one event per name, carrying the new state.

import type { CommandMachine } from 'modern-cmdk';
import type * as ReactEntry from 'modern-cmdk/react';
import { act, use } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

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

type DevtoolsOptions = { readonly redactQuery?: boolean | undefined };

interface Mounted {
  readonly machine: CommandMachine;
  readonly cleanup: () => Promise<void>;
  /** Renders the same tree again with other options, inside act. */
  readonly rerender: (options?: DevtoolsOptions) => Promise<void>;
}

/** Fresh module graph so the hook's module-scoped dev check re-reads the stubbed NODE_ENV. */
async function mountDevtools(label: string, options?: DevtoolsOptions): Promise<Mounted> {
  vi.resetModules();
  const { Command, CommandStableContext, useCommandDevtools }: typeof ReactEntry = await import(
    'modern-cmdk/react'
  );
  let machine: CommandMachine | undefined;
  const devtools = (probeLabel: string): void => {
    useCommandDevtools(probeLabel, current);
    machine = use(CommandStableContext)?.machine;
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let current = options;
  const tree = (): React.JSX.Element => (
    <Command label="devtools test">
      <Probe devtools={devtools} label={label} />
      <Command.List>
        <Command.Item value="alpha">Alpha</Command.Item>
      </Command.List>
    </Command>
  );
  await act(async () => {
    root.render(tree());
  });
  if (!machine) throw new Error('the probe did not render inside <Command>');
  return {
    machine,
    rerender: async (next: DevtoolsOptions | undefined) => {
      current = next;
      await act(async () => {
        root.render(tree());
      });
    },
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

    // Another copy of the library may have created the old Map first: the hook reuses it under
    // both names.
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
    // The scheduler batches on requestAnimationFrame: fake only the frame clock, as
    // machine-lifecycle.test.ts does.
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

  /** Mounts with the option, sends one search change, returns the registry entry and detail. */
  async function searchWith(
    label: string,
    options?: DevtoolsOptions,
  ): Promise<{ entry: unknown; detail: unknown }> {
    vi.stubEnv('NODE_ENV', 'development');
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    const mounted = await mountDevtools(label, options);
    cleanup = mounted.cleanup;
    let detail: unknown;
    const listener = (event: Event): void => {
      detail = (event as CustomEvent).detail;
    };
    globalThis.addEventListener(DEVTOOLS_EVENT, listener);
    try {
      await act(async () => {
        mounted.machine.send({ type: 'SEARCH_CHANGE', query: 'secret' });
        vi.advanceTimersToNextFrame();
      });
    } finally {
      globalThis.removeEventListener(DEVTOOLS_EVENT, listener);
    }
    const registry = Reflect.get(globalThis, DEVTOOLS_KEY) as Map<string, unknown>;
    return { entry: registry.get(label), detail };
  }

  it('SEC-32: redactQuery replaces the query with its length', async () => {
    const { entry, detail } = await searchWith('unit-redacted', { redactQuery: true });
    expect(entry).toMatchObject({ searchQuery: 6 });
    expect(detail).toMatchObject({ label: 'unit-redacted', state: { searchQuery: 6 } });
    expect(JSON.stringify([entry, detail])).not.toContain('secret');
  });

  it('SEC-32: without redactQuery the registry carries the raw query', async () => {
    const { entry, detail } = await searchWith('unit-raw');
    expect(entry).toMatchObject({ searchQuery: 'secret' });
    expect(detail).toMatchObject({ state: { searchQuery: 'secret' } });
  });

  it('ARCH-30: useCommandDevtools accepts redactQuery: undefined', async () => {
    type Options = Parameters<typeof ReactEntry.useCommandDevtools>[1];
    // exactOptionalPropertyTypes is on: only `| undefined` on the property admits an explicit
    // undefined.
    expectTypeOf<{ readonly redactQuery: undefined }>().toExtend<NonNullable<Options>>();
    expectTypeOf<{ readonly redactQuery: boolean | undefined }>().toExtend<NonNullable<Options>>();

    vi.stubEnv('NODE_ENV', 'development');
    ({ cleanup } = await mountDevtools('unit-undefined', { redactQuery: undefined }));
    const registry = Reflect.get(globalThis, DEVTOOLS_KEY) as Map<string, unknown> | undefined;
    expect(registry?.has('unit-undefined')).toBe(true);
  });

  it('SEC-32: a redactQuery change after mount republishes the redacted query', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    const mounted = await mountDevtools('unit-flip', { redactQuery: false });
    cleanup = mounted.cleanup;
    await act(async () => {
      mounted.machine.send({ type: 'SEARCH_CHANGE', query: 'secret' });
      vi.advanceTimersToNextFrame();
    });
    const registry = Reflect.get(globalThis, DEVTOOLS_KEY) as Map<string, unknown>;
    expect(registry.get('unit-flip')).toMatchObject({ searchQuery: 'secret' });

    const details: unknown[] = [];
    const listener = (event: Event): void => {
      details.push((event as CustomEvent).detail);
    };
    globalThis.addEventListener(DEVTOOLS_EVENT, listener);
    try {
      await mounted.rerender({ redactQuery: true });
    } finally {
      globalThis.removeEventListener(DEVTOOLS_EVENT, listener);
    }
    expect(registry.get('unit-flip')).toMatchObject({ searchQuery: 6 });
    expect(details.at(-1)).toMatchObject({ label: 'unit-flip', state: { searchQuery: 6 } });
    expect(JSON.stringify([...registry.values(), ...details])).not.toContain('secret');
  });

  it('D30: unmount removes the label from the registry under both names', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const mounted = await mountDevtools('unit-unmount');
    const registry = Reflect.get(globalThis, DEVTOOLS_KEY) as Map<string, unknown>;
    const deprecated = Reflect.get(globalThis, DEPRECATED_KEY) as Map<string, unknown>;
    expect(registry.has('unit-unmount')).toBe(true);
    expect(deprecated.has('unit-unmount')).toBe(true);
    await mounted.cleanup();
    expect(registry.has('unit-unmount')).toBe(false);
    expect(deprecated.has('unit-unmount')).toBe(false);
  });
});
