// tests/unit/use-command-state.test.tsx
// useCommandState caches its selector result per machine state (RA-36): a selector that returns a fresh
// object on every call hands useSyncExternalStore the same value for the same machine state, so React sees
// a stable getSnapshot (react.dev/reference/react/useSyncExternalStore: "The getSnapshot function must
// return the same value when called again with no change").

import { act, cleanup, render } from '@testing-library/react';
import type { CommandMachine } from 'modern-cmdk';
import { Command, CommandStableContext, useCommandState } from 'modern-cmdk/react';
import { use } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { silenceConsoleError } from '../act-guard.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

let machine: CommandMachine | null = null;
let renders = 0;
let lastQuery: string | null = null;

function Capture(): null {
  const stable = use(CommandStableContext);
  if (stable) machine = stable.machine;
  return null;
}

function Reader(): null {
  const slice = useCommandState((s) => ({ q: s.search }));
  renders += 1;
  lastQuery = slice.q;
  return null;
}

describe('useCommandState', () => {
  it('RA-36: a selector returning a fresh object renders once per machine tick without a getSnapshot warning', async () => {
    using spy = silenceConsoleError();
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const release = (): Promise<void> =>
      act(async () => {
        for (const frame of frames.splice(0)) frame(performance.now());
      });

    machine = null;
    renders = 0;
    lastQuery = null;

    render(
      <Command label="Test">
        <Capture />
        <Reader />
        <Command.List>
          <Command.Item value="alpha">Alpha</Command.Item>
        </Command.List>
      </Command>,
    );
    await release();
    await release();

    const live = (): CommandMachine => {
      if (!machine) throw new Error('machine not captured');
      return machine;
    };
    const settled = renders;

    await act(async () => {
      live().send({ type: 'SEARCH_CHANGE', query: 'a' });
    });
    await release();
    expect(lastQuery).toBe('a');
    const afterFirst = renders;

    await act(async () => {
      live().send({ type: 'SEARCH_CHANGE', query: 'ab' });
    });
    await release();
    expect(lastQuery).toBe('ab');

    const messages = spy.mock.calls.map((call) => String(call[0]));
    expect(
      messages.filter((m) => /getSnapshot should be cached|Maximum update depth/u.test(m)),
    ).toEqual([]);
    expect(afterFirst - settled).toBe(1);
    expect(renders - afterFirst).toBe(1);
  });
});
