// tests/unit/frecency-strict-mode.test.tsx
// CE-115, D95: under React StrictMode the dev double-mount runs the layout-effect cleanup, which suspends the
// machine, and the replay resumes it; unmount suspends it again. A storage the caller passed to
// <Command frecency> stays the caller's: it is never disposed, and it still saves.

import type { FrecencyStorage } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

/** Let the machine's scheduler frame run. */
const frame = (): Promise<void> =>
  act(async () => {
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  });

describe('<Command frecency> under StrictMode', () => {
  it('CE-115, D95: the caller storage ends undisposed and a selection is saved once', async () => {
    const save = vi.fn<FrecencyStorage['save']>(async () => {});
    const dispose = vi.fn<() => void>();
    const storage: FrecencyStorage = {
      load: () => ({ records: new Map() }),
      save,
      [Symbol.dispose]: dispose,
    };

    await act(async () => {
      root.render(
        <StrictMode>
          <Command frecency={{ enabled: true, storage }}>
            <Command.Input />
            <Command.List>
              <Command.Item value="apple" forceId="apple">
                Apple
              </Command.Item>
            </Command.List>
          </Command>
        </StrictMode>,
      );
    });
    await frame();

    await act(async () => {
      container.querySelector('#apple')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await frame();

    // Unmount suspends the machine; suspend starts the save of the pending selection and leaves the storage alone
    await act(async () => {
      root.unmount();
    });
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await frame();

    const saved = save.mock.calls[0]?.[1].records;
    expect([...(saved?.keys() ?? [])]).toEqual(['apple']);
    expect(saved?.get('apple' as never)?.frequency).toBe(1);
    expect(dispose).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
    root = createRoot(container);
  });
});
