// tests/unit/telemetry-react.test.tsx
// CE-18: <Command> and <Command.Dialog> forward the latest `telemetry` prop to the machine's
// option.

import { fireEvent } from '@testing-library/react';
import type { CommandMachine, CommandTelemetryHooks } from 'modern-cmdk';
import { Command, CommandStableContext } from 'modern-cmdk/react';
import type { ReactNode } from 'react';
import { Activity, act, StrictMode, use, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
  }
  container?.remove();
  root = undefined;
  container = undefined;
});

/** Renders `ui` into the mounted root, or into a fresh one on the first call. */
async function render(ui: ReactNode): Promise<void> {
  if (!root) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  const current = root;
  await act(async () => {
    current.render(ui);
  });
}

/** Runs the scheduler frames and the effects that follow an interaction. */
const settle = (): Promise<void> =>
  act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  });

// React 19.0, the peer floor, exports no Activity; the tests that render <Activity> exercise the
// experimental build. A named import of the missing export is undefined at run time.
const itWithActivity = it.skipIf(Activity === undefined);

/** A controlled input's change handler that keeps the value fixed */
const noop = (): void => {};

describe('telemetry prop (CE-18)', () => {
  it('CE-18: a changed telemetry prop reaches the machine without a remount', async () => {
    const a = { onSearchComplete: vi.fn() };
    const b = { onSearchComplete: vi.fn() };
    const tree = (telemetry: typeof a): ReactNode => (
      <Command label="telemetry" telemetry={telemetry}>
        <Command.Input />
        <Command.List>
          <Command.Item value="Apple">Apple</Command.Item>
          <Command.Item value="Banana">Banana</Command.Item>
        </Command.List>
      </Command>
    );
    await render(tree(a));
    await settle();
    await render(tree(b));

    const input = document.querySelector<HTMLInputElement>('[data-command-input]');
    if (!input) throw new Error('no command input rendered');
    fireEvent.change(input, { target: { value: 'app' } });
    await settle();

    expect(b.onSearchComplete).toHaveBeenCalledWith('app', expect.any(Number), expect.any(Number));
    expect(a.onSearchComplete).not.toHaveBeenCalled();
  });

  it('CE-18: Command.Dialog reports onPaletteOpen when its open prop turns true', async () => {
    const onPaletteOpen = vi.fn();
    const tree = (open: boolean): ReactNode => (
      <Command.Dialog open={open} telemetry={{ onPaletteOpen }}>
        <Command.Input />
      </Command.Dialog>
    );
    await render(tree(false));
    await settle();
    expect(onPaletteOpen).not.toHaveBeenCalled();

    await render(tree(true));
    await settle();
    expect(onPaletteOpen).toHaveBeenCalledTimes(1);
  });
});

describe('telemetry reports of controlled inputs (CE-18)', () => {
  const list = (
    <Command.List>
      <Command.Item value="Apple">Apple</Command.Item>
      <Command.Item value="Banana">Banana</Command.Item>
    </Command.List>
  );

  it('CE-18: a controlled Command.Input under StrictMode reports no search for its unchanged value', async () => {
    const onSearchComplete = vi.fn();
    await render(
      <StrictMode>
        <Command label="telemetry" telemetry={{ onSearchComplete }}>
          <Command.Input value="" onValueChange={noop} />
          {list}
        </Command>
      </StrictMode>,
    );
    await settle();

    expect(onSearchComplete).not.toHaveBeenCalled();
  });

  itWithActivity(
    'CE-18: an Activity show of a controlled Command.Input reports no search',
    async () => {
      const onSearchComplete = vi.fn();
      const tree = (mode: 'visible' | 'hidden'): ReactNode => (
        <Activity mode={mode}>
          <Command label="telemetry" telemetry={{ onSearchComplete }}>
            <Command.Input value="app" onValueChange={noop} />
            {list}
          </Command>
        </Activity>
      );
      await render(tree('visible'));
      await settle();
      // The mount reports the one change of the committed query, '' to 'app', with the batch's count
      expect(onSearchComplete).toHaveBeenCalledTimes(1);
      expect(onSearchComplete.mock.calls[0]?.slice(0, 2)).toEqual(['app', 1]);

      for (let i = 0; i < 2; i++) {
        await render(tree('hidden'));
        await settle();
        await render(tree('visible'));
        await settle();
      }
      expect(onSearchComplete).toHaveBeenCalledTimes(1);
    },
  );
});

/** A dialog rendered open while `show` holds, as a parent that mounts it on demand renders it */
function OpenDialog({ telemetry }: { readonly telemetry: CommandTelemetryHooks }): ReactNode {
  const [show, setShow] = useState(true);
  return (
    show && (
      <Command.Dialog open onOpenChange={setShow} telemetry={telemetry}>
        <Command.Input />
        <Command.List>
          <Command.Item value="Apple">Apple</Command.Item>
        </Command.List>
      </Command.Dialog>
    )
  );
}

describe('telemetry reports of a Command.Dialog mounted open (D113)', () => {
  it('D113: a Command.Dialog mounted open reports onPaletteOpen', async () => {
    const onPaletteOpen = vi.fn();
    const onPaletteClose = vi.fn();
    await render(<OpenDialog telemetry={{ onPaletteOpen, onPaletteClose }} />);
    await settle();

    expect(onPaletteOpen).toHaveBeenCalledTimes(1);
    expect(onPaletteClose).not.toHaveBeenCalled();
  });
});

/** Pushes the root's machine into `into`, for a test's own sends */
function Grab({ into }: { readonly into: CommandMachine[] }): null {
  const machine = use(CommandStableContext)?.machine;
  if (machine && !into.includes(machine)) into.push(machine);
  return null;
}

describe('telemetry of a hidden root (D114)', () => {
  itWithActivity("D114: a hidden root's machine reports a consumer's own send", async () => {
    const onSearchComplete = vi.fn();
    const onSearchChange = vi.fn();
    const captured: CommandMachine[] = [];
    const tree = (mode: 'visible' | 'hidden'): ReactNode => (
      <Activity mode={mode}>
        <Command label="telemetry" telemetry={{ onSearchComplete }} onSearchChange={onSearchChange}>
          <Grab into={captured} />
          <Command.Input />
          <Command.List>
            <Command.Item value="Apple">Apple</Command.Item>
          </Command.List>
        </Command>
      </Activity>
    );
    await render(tree('visible'));
    await settle();
    await render(tree('hidden'));
    await settle();

    const hidden = captured[0];
    if (!hidden) throw new Error('no machine captured');
    await act(async () => {
      hidden.send({ type: 'SEARCH_CHANGE', query: 'ap' });
    });
    await settle();

    expect(onSearchComplete).toHaveBeenCalledWith('ap', expect.any(Number), expect.any(Number));
    expect(onSearchChange).not.toHaveBeenCalled();
  });
});
