// tests/unit/use-devtools.test.tsx
// SEC-52 (devtools half): useCommandDevtools registers its label in development and stays inert in production.
// RA-48: one state change publishes one event per name, carrying the new state.

import type { CommandMachine } from 'modern-cmdk';
import type * as ReactEntry from 'modern-cmdk/react';
import { act, use } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DEVTOOLS_KEY = '__CRIMSON_COMMAND_DEVTOOLS__';
const DEVTOOLS_EVENT = 'crimson-command-devtools';

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

  beforeEach(() => {
    Reflect.deleteProperty(globalThis, DEVTOOLS_KEY);
  });

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.resetModules();
    Reflect.deleteProperty(globalThis, DEVTOOLS_KEY);
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
  });

  it('RA-48: one state change dispatches one event per name with the new state', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    // The scheduler batches on requestAnimationFrame: fake only the frame clock, as machine-lifecycle.test.ts does.
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    const mounted = await mountDevtools('unit-events');
    cleanup = mounted.cleanup;
    const events: CustomEvent<{ label: string; state: { searchQuery: string } }>[] = [];
    const listener = (event: Event): void => {
      events.push(event as CustomEvent<{ label: string; state: { searchQuery: string } }>);
    };
    globalThis.addEventListener(DEVTOOLS_EVENT, listener);
    try {
      await act(async () => {
        mounted.machine.send({ type: 'SEARCH_CHANGE', query: 'alp' });
        vi.advanceTimersToNextFrame();
      });
    } finally {
      globalThis.removeEventListener(DEVTOOLS_EVENT, listener);
    }
    expect(events).toHaveLength(1);
    expect(events[0]?.detail.label).toBe('unit-events');
    expect(events[0]?.detail.state.searchQuery).toBe('alp');
  });
});
