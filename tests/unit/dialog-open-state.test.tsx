// tests/unit/dialog-open-state.test.tsx
// The open state of <Command.Dialog> (cluster C1): a controlled `open` prop is the source of truth and a
// consumer that keeps it keeps the dialog open; one Escape reaches `onOpenChange` once; the input takes focus
// through the dialog content, so a portal container inside a shadow root works.

import type { CommandMachine } from 'modern-cmdk';
import { Command, CommandStableContext } from 'modern-cmdk/react';
import type { ReactNode } from 'react';
import { act, use, useState } from 'react';
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

/** Mounts `ui` in a fresh container and flushes the first render. */
async function mount(ui: ReactNode): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const current = root;
  await act(async () => {
    current.render(ui);
  });
}

/** Renders `ui` again into the mounted root (same tree position, new props). */
async function update(ui: ReactNode): Promise<void> {
  const current = root;
  if (!current) throw new Error('nothing mounted');
  await act(async () => {
    current.render(ui);
  });
}

/** Runs the scheduler frames, Radix's deferred listeners and the effects that follow an interaction. */
const settle = (): Promise<void> =>
  act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  });

/** Records the machine the dialog's subtree holds. */
class MachineProbe {
  machine: CommandMachine | undefined;

  /** Probe child: place it inside `<Command.Dialog>`. */
  readonly Probe = (): null => {
    const stable = use(CommandStableContext);
    if (stable) this.machine = stable.machine;
    return null;
  };

  /** The recorded machine; throws before the probe has rendered. */
  get current(): CommandMachine {
    if (!this.machine) throw new Error('probe never rendered');
    return this.machine;
  }
}

/** The command input inside `scope`, which the dialog renders into a portal. */
const inputIn = (scope: ParentNode): HTMLInputElement => {
  const input = scope.querySelector<HTMLInputElement>('[data-command-input]');
  if (!input) throw new Error('no command input rendered');
  return input;
};

/** Presses Escape the way a browser does: a bubbling, cancelable keydown on the focused element. */
async function pressEscape(target: Element): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  await act(async () => {
    target.dispatchEvent(event);
  });
  await settle();
  return event;
}

/** A parent that owns the dialog's `open` state; `keepOpen` makes it refuse every request to close. */
function Controlled({
  probe,
  onOpenChange,
  keepOpen = false,
}: {
  readonly probe: MachineProbe;
  readonly onOpenChange: (open: boolean) => void;
  readonly keepOpen?: boolean;
}): ReactNode {
  const [open, setOpen] = useState(true);
  return (
    <Command.Dialog
      open={open}
      onOpenChange={(next: boolean): void => {
        onOpenChange(next);
        if (!keepOpen) setOpen(next);
      }}
    >
      <probe.Probe />
      <Command.Input />
    </Command.Dialog>
  );
}

/** A parent that owns the dialog's `open` state, accepts every request and hands its setter to `parent`. */
function Handle({
  parent,
  probe,
  onOpenChange,
}: {
  readonly parent: { setOpen: (open: boolean) => void };
  readonly probe: MachineProbe;
  readonly onOpenChange: (open: boolean) => void;
}): ReactNode {
  const [open, setOpen] = useState(true);
  parent.setOpen = setOpen;
  return (
    <Command.Dialog
      open={open}
      onOpenChange={(next: boolean): void => {
        onOpenChange(next);
        setOpen(next);
      }}
    >
      <probe.Probe />
      <Command.Input />
    </Command.Dialog>
  );
}

/** The `type` of every event a spy on `machine.send` recorded. */
const sentTypes = (spy: { readonly mock: { readonly calls: readonly unknown[][] } }): string[] =>
  spy.mock.calls.map(([event]) => (event as { readonly type: string }).type);

describe('Command.Dialog open state (C1)', () => {
  it('ARCH-18: a controlled dialog mounted closed does not call onOpenChange', async () => {
    const onOpenChange = vi.fn();
    await mount(
      <Command.Dialog open={false} onOpenChange={onOpenChange}>
        <Command.Input />
      </Command.Dialog>,
    );
    await settle();

    expect(document.querySelector('[data-command-dialog]')).toBeNull();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('CE-117: an open prop change does not echo onOpenChange', async () => {
    const onOpenChange = vi.fn();
    const probe = new MachineProbe();
    const tree = (open: boolean): ReactNode => (
      <Command.Dialog open={open} onOpenChange={onOpenChange}>
        <probe.Probe />
        <Command.Input />
      </Command.Dialog>
    );
    await mount(tree(false));
    await update(tree(true));
    // The prop drives the dialog in the render it arrives in; the machine's state follows on its next frame
    expect(document.querySelector('[data-command-dialog]')?.getAttribute('data-state')).toBe(
      'open',
    );
    await settle();
    expect(probe.current.getState().open).toBe(true);
    await update(tree(false));
    await settle();

    expect(probe.current.getState().open).toBe(false);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('CE-118: one Escape on an uncontrolled dialog calls onOpenChange(false) once', async () => {
    const onOpenChange = vi.fn();
    const probe = new MachineProbe();
    // A dialog that is open and then drops its `open` prop keeps its machine's open state and is uncontrolled
    const tree = (open: boolean | undefined): ReactNode => (
      <Command.Dialog open={open} onOpenChange={onOpenChange}>
        <probe.Probe />
        <Command.Input />
      </Command.Dialog>
    );
    await mount(tree(true));
    await update(tree(undefined));
    await settle();
    const input = inputIn(document.body);
    input.focus();
    expect(onOpenChange).not.toHaveBeenCalled();

    using send = vi.spyOn(probe.current, 'send');
    const event = await pressEscape(input);

    expect(event.defaultPrevented).toBe(true);
    expect(onOpenChange.mock.calls).toEqual([[false]]);
    expect(sentTypes(send)).toEqual(['CLOSE']);
    expect(probe.current.getState().open).toBe(false);
  });

  it('RA-34: one Escape on a controlled dialog calls onOpenChange(false) once', async () => {
    const onOpenChange = vi.fn();
    const probe = new MachineProbe();
    await mount(<Controlled probe={probe} onOpenChange={onOpenChange} />);
    await settle();
    const input = inputIn(document.body);
    input.focus();

    using send = vi.spyOn(probe.current, 'send');
    await pressEscape(input);

    expect(onOpenChange.mock.calls).toEqual([[false]]);
    // One CLOSE: the machine follows the prop the parent set; the keydown handler adds none
    expect(sentTypes(send)).toEqual(['CLOSE']);
    expect(document.querySelector('[data-command-dialog]')).toBeNull();
    expect(probe.current.getState().open).toBe(false);
  });

  it('RA-35: a controlled dialog whose parent keeps open stays open after Escape', async () => {
    const onOpenChange = vi.fn();
    const probe = new MachineProbe();
    await mount(<Controlled probe={probe} onOpenChange={onOpenChange} keepOpen />);
    await settle();
    const input = inputIn(document.body);
    input.focus();

    using send = vi.spyOn(probe.current, 'send');
    await pressEscape(input);

    expect(onOpenChange.mock.calls).toEqual([[false]]);
    expect(sentTypes(send)).not.toContain('CLOSE');
    expect(probe.current.getState().open).toBe(true);
    const overlay = document.querySelector('[data-command-overlay]');
    const content = document.querySelector('[data-command-dialog]');
    expect(overlay?.getAttribute('data-state')).toBe('open');
    expect(content?.getAttribute('data-state')).toBe('open');
    expect(inputIn(document.body)).toBe(input);

    // A close the prop did not ask for never unmounts the dialog: the same input stays, and the machine is put back
    await act(async () => {
      probe.current.send({ type: 'CLOSE' });
    });
    await settle();
    expect(inputIn(document.body)).toBe(input);
    expect(probe.current.getState().open).toBe(true);
  });

  it('a controlled dialog reports a machine-originated close once and stays open until the parent changes open', async () => {
    const onOpenChange = vi.fn();
    const probe = new MachineProbe();
    const tree = (open: boolean): ReactNode => (
      <Command.Dialog open={open} onOpenChange={onOpenChange}>
        <probe.Probe />
        <Command.Input />
      </Command.Dialog>
    );
    await mount(tree(true));
    await settle();
    expect(onOpenChange).not.toHaveBeenCalled();

    await act(async () => {
      probe.current.send({ type: 'CLOSE' });
    });
    await settle();

    // The palette's own request reaches the consumer once; the parent keeps `open`, so the dialog stays
    expect(onOpenChange.mock.calls).toEqual([[false]]);
    expect(document.querySelector('[data-command-dialog]')?.getAttribute('data-state')).toBe(
      'open',
    );
    expect(probe.current.getState().open).toBe(true);

    // The parent then closes: the prop change reports nothing
    await update(tree(false));
    await settle();
    expect(document.querySelector('[data-command-dialog]')).toBeNull();
    expect(probe.current.getState().open).toBe(false);
    expect(onOpenChange.mock.calls).toEqual([[false]]);
  });

  it('a controlled dialog reports a machine-originated open once while the parent keeps it closed', async () => {
    const onOpenChange = vi.fn();
    const probe = new MachineProbe();
    const tree = (open: boolean): ReactNode => (
      <Command.Dialog open={open} onOpenChange={onOpenChange}>
        <probe.Probe />
        <Command.Input />
      </Command.Dialog>
    );
    // Open first so the probe records the machine, then the parent closes the dialog
    await mount(tree(true));
    await update(tree(false));
    await settle();
    expect(onOpenChange).not.toHaveBeenCalled();

    await act(async () => {
      probe.current.send({ type: 'TOGGLE' });
    });
    await settle();

    expect(onOpenChange.mock.calls).toEqual([[true]]);
    expect(document.querySelector('[data-command-dialog]')).toBeNull();
    expect(probe.current.getState().open).toBe(false);

    // The parent opens: the prop change reports nothing
    await update(tree(true));
    await settle();
    expect(document.querySelector('[data-command-dialog]')?.getAttribute('data-state')).toBe(
      'open',
    );
    expect(onOpenChange.mock.calls).toEqual([[true]]);
  });

  it('a controlled dialog the parent closes before the machine has followed its opening stays closed and reports nothing', async () => {
    const onOpenChange = vi.fn();
    const probe = new MachineProbe();
    const tree = (open: boolean): ReactNode => (
      <Command.Dialog open={open} onOpenChange={onOpenChange}>
        <probe.Probe />
        <Command.Input />
      </Command.Dialog>
    );
    await mount(tree(false));
    await settle();

    // The parent opens and closes within one frame: the machine's OPEN, sent when the prop turned true, is still
    // queued when the prop turns false. Its report is the machine following the prop, not a request to open.
    const frames: FrameRequestCallback[] = [];
    using _request = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback): number => frames.push(callback));
    await update(tree(true));
    await update(tree(false));
    // Run the frames as they are requested: the first applies the stale OPEN, the second the put-back CLOSE
    for (let round = 0; round < 3; round++) {
      await act(async () => {
        for (const callback of frames.splice(0)) callback(performance.now());
      });
    }
    await settle();

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(document.querySelector('[data-command-dialog]')).toBeNull();
    expect(probe.current.getState().open).toBe(false);
  });

  it('a controlled dialog reports a machine-originated open after its parent accepted the machine close', async () => {
    const onOpenChange = vi.fn();
    const probe = new MachineProbe();
    const parent: { setOpen: (open: boolean) => void } = { setOpen: () => undefined };
    await mount(<Handle parent={parent} probe={probe} onOpenChange={onOpenChange} />);
    await settle();
    // The parent closes and reopens: the effect asks the machine to open, and the machine applies it
    await act(async () => parent.setOpen(false));
    await settle();
    await act(async () => parent.setOpen(true));
    await settle();
    expect(onOpenChange).not.toHaveBeenCalled();

    // The palette's own close is reported and accepted
    await act(async () => {
      probe.current.send({ type: 'CLOSE' });
    });
    await settle();
    expect(onOpenChange.mock.calls).toEqual([[false]]);
    expect(probe.current.getState().open).toBe(false);

    // Its next request is a request again, however the parent got here
    await act(async () => {
      probe.current.send({ type: 'TOGGLE' });
    });
    await settle();
    expect(onOpenChange.mock.calls).toEqual([[false], [true]]);
    expect(document.querySelector('[data-command-dialog]')?.getAttribute('data-state')).toBe(
      'open',
    );
  });

  it('D109: a refused close is put back even when a second request lands in the put-back frame', async () => {
    const onOpenChange = vi.fn();
    const probe = new MachineProbe();
    await mount(<Controlled probe={probe} onOpenChange={onOpenChange} keepOpen />);
    await settle();

    const frames: FrameRequestCallback[] = [];
    const runFrame = (): Promise<void> =>
      act(async () => {
        for (const callback of frames.splice(0)) callback(performance.now());
      });
    {
      using _request = vi
        .spyOn(globalThis, 'requestAnimationFrame')
        .mockImplementation((callback: FrameRequestCallback): number => frames.push(callback));
      await act(async () => {
        probe.current.send({ type: 'CLOSE' });
      });
      await runFrame();
      // The close is reported and refused; the put-back OPEN waits for the next frame
      expect(onOpenChange.mock.calls).toEqual([[false]]);
      expect(frames).toHaveLength(1);

      // A second request lands in that frame: the frame applies the OPEN, then the CLOSE
      await act(async () => {
        probe.current.send({ type: 'CLOSE' });
      });
      for (let round = 0; round < 3; round++) await runFrame();
    }
    await settle();
    expect(onOpenChange.mock.calls).toEqual([[false], [false]]);
    expect(probe.current.getState().open).toBe(true);

    // The next request is reported, not dropped by a machine that stayed closed under the open dialog
    await act(async () => {
      probe.current.send({ type: 'CLOSE' });
    });
    await settle();
    expect(onOpenChange.mock.calls).toEqual([[false], [false], [false]]);
    expect(document.querySelector('[data-command-dialog]')?.getAttribute('data-state')).toBe(
      'open',
    );
  });

  it('an uncontrolled dialog shows nothing before the machine applies its opening, so no Escape can precede it', async () => {
    const onOpenChange = vi.fn();
    const probe = new MachineProbe();
    const tree = (open: boolean | undefined): ReactNode => (
      <Command.Dialog open={open} onOpenChange={onOpenChange}>
        <probe.Probe />
        <Command.Input />
      </Command.Dialog>
    );
    // Mount open to reach the machine, then hand the dialog its own open state and close it through the machine
    await mount(tree(true));
    await settle();
    await update(tree(undefined));
    await act(async () => {
      probe.current.send({ type: 'CLOSE' });
    });
    await settle();
    expect(document.querySelector('[data-command-dialog]')).toBeNull();
    onOpenChange.mockClear();

    const frames: FrameRequestCallback[] = [];
    using _request = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback): number => frames.push(callback));
    await act(async () => {
      probe.current.send({ type: 'OPEN' });
    });
    // The open state is the machine's: until the frame applies the OPEN there is no dialog to press Escape on
    expect(document.querySelector('[data-command-dialog]')).toBeNull();
    for (let round = 0; round < 3; round++) {
      await act(async () => {
        for (const callback of frames.splice(0)) callback(performance.now());
      });
    }
    await settle();
    expect(document.querySelector('[data-command-dialog]')?.getAttribute('data-state')).toBe(
      'open',
    );

    await pressEscape(inputIn(document.body));
    for (let round = 0; round < 3; round++) {
      await act(async () => {
        for (const callback of frames.splice(0)) callback(performance.now());
      });
    }
    await settle();
    expect(document.querySelector('[data-command-dialog]')).toBeNull();
    expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
  });

  it('RA-X3: the dialog focuses its input when the portal container is inside a shadow root', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const portalContainer = document.createElement('div');
    shadowRoot.appendChild(portalContainer);
    try {
      await mount(
        <Command.Dialog open container={portalContainer}>
          <Command.Input />
        </Command.Dialog>,
      );
      await settle();

      const input = inputIn(portalContainer);
      expect(input.isConnected).toBe(true);
      expect(shadowRoot.activeElement).toBe(input);
    } finally {
      // Unmount the dialog before its container goes away
      const mounted = root;
      root = undefined;
      await act(async () => {
        mounted?.unmount();
      });
      host.remove();
    }
  });
});
