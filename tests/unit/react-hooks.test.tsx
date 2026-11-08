// tests/unit/react-hooks.test.tsx
// T10: the public React hooks driven directly with react-dom/client and `await act(async ...)`:
//   - useCommandState: render counts of a primitive slice and of the no-selector form
//   - useRegisterItem / useRegisterGroup: the register/unregister lifecycle, the `id` option, the
//     deprecated `forceId` alias and the once-only development warning when the two differ
//   - useVirtualizer: the exact virtual window, overscan and its clamps, scrollToIndex alignments
//   - useCommandDevtools: no event and no global in production, a mount and a state change
//     included; `dev` is false where `process` does not exist
//   - useCommand: the state, search and active-item actions it returns for a machine
//   - createKeydownHandler: the key to machine-event mapping and the keys it leaves alone
// RA-33: Command.Highlight ordering, the exclusive end index and highlightClassName. The other
// gaps RA-33 names are pinned in other files; this table maps each to the titles that cover it
// (titles verbatim).
//
// RA-33 gap                      file: title
// -----------------------------  ----------------------------------------------------------------
// useCommandDevtools             use-devtools.test.tsx:
//                                  'SEC-52: registers the label when NODE_ENV is development'
//                                  'SEC-52: leaves the registry uncreated when NODE_ENV is
//                                    production'
//                                  'RA-48: one state change dispatches one event per name with
//                                    the new state'
//                                react-hooks.test.tsx (T10 devtools titles below)
// StrictMode lifecycle           react-lifecycle.test.tsx:
//                                  'query survives StrictMode remount'
//                                  'StrictMode: an item shortcut still fires after the double
//                                    mount'
//                                  'D102: StrictMode builds one machine per mount'
// Activity lifecycle             react-lifecycle.test.tsx:
//                                  'registrations survive Activity hide/show'
//                                  'Activity hide/show keeps the active item'
// Visual vs navigation order     OPEN (RA-02, 1.8.0): no test until the fix lands
// Group visibility remount       group-remount.test.tsx:
//                                  'RA-05: a group toggling between no match and match keeps its
//                                    items mounted'
// Empty on first render          ssr-render.test.tsx:
//                                  'RP-31: server HTML lists the items and no Empty text'
//                                  'RP-31: the items option path lists pre-registered items in
//                                    the server HTML'
//                                RA-14 (the ARIA placement of an Empty shown at mount) is OPEN
//                                for 1.8.0
// IME Enter                      OPEN (RA-15, 1.8.0): no test until the fix lands
// Prop changes after mount       react-lifecycle.test.tsx:
//                                  'onSelect prop change fires the new callback'
//                                  'a loop prop change after mount changes wrap-around'
//                                  'a filter prop change refilters the current query'
//                                  'an items prop change registers added items and unregisters
//                                    removed ones'
// Highlight                      react-hooks.test.tsx (RA-33 titles below), command.test.tsx
//                                ('Highlight component') and cmdk-comparison.test.tsx
//                                ('17g. Highlight Component (Command.Highlight)')
// Shortcut SSR                   ssr-render.test.tsx:
//                                  'RA-19: Command.Shortcut hydrates under a macOS client with no
//                                    recoverable error'
// ErrorBoundary                  error-boundary.test.tsx:
//                                  'ARCH-58: fallback(error, reset) retries the children when
//                                    Retry is clicked'
//                                  'ARCH-58: a changed resetKeys entry clears the error'
//                                  'ARCH-58: unchanged resetKeys keep the fallback'

import type { CommandMachine, CommandState } from 'modern-cmdk';
import { createCommandMachine, groupId, itemId } from 'modern-cmdk';
import {
  Command,
  CommandStableContext,
  createKeydownHandler,
  type UseCommandReturn,
  useCommand,
  useCommandState,
  useRegisterGroup,
  useRegisterItem,
  useVirtualizer,
  type VirtualizerOptions,
  type VirtualizerReturn,
} from 'modern-cmdk/react';
import type { ReactNode } from 'react';
import { act, use } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface Mounted {
  readonly container: HTMLDivElement;
  readonly root: Root;
}

const mounted: Mounted[] = [];

/** Renders `ui` into a fresh container inside act and keeps the root for the afterEach unmount. */
async function mount(ui: ReactNode): Promise<Mounted> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const entry: Mounted = { container, root };
  mounted.push(entry);
  await act(async () => {
    root.render(ui);
  });
  return entry;
}

async function rerender({ root }: Mounted, ui: ReactNode): Promise<void> {
  await act(async () => {
    root.render(ui);
  });
}

/**
 * Waits one frame inside act: the machine's scheduler batches on requestAnimationFrame, which
 * happy-dom backs with setImmediate, so every batch queued before this call has run when it
 * returns.
 */
function settle(): Promise<void> {
  return act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}

/** Runs `change` inside act and then lets the scheduler's frame apply what it queued. */
function step(change: () => void): Promise<void> {
  return act(async () => {
    change();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}

afterEach(async () => {
  for (const { root, container } of mounted.splice(0)) {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.resetModules();
  Reflect.deleteProperty(globalThis, '__MODERN_CMDK_DEVTOOLS__');
  Reflect.deleteProperty(globalThis, '__CRIMSON_COMMAND_DEVTOOLS__');
});

/** Hands the machine of the enclosing <Command> to the test. */
function Capture({ onMachine }: { readonly onMachine: (machine: CommandMachine) => void }): null {
  const stable = use(CommandStableContext);
  if (stable) onMachine(stable.machine);
  return null;
}

function machineHolder(): { readonly capture: ReactNode; readonly live: () => CommandMachine } {
  let machine: CommandMachine | undefined;
  return {
    capture: (
      <Capture
        onMachine={(next: CommandMachine): void => {
          machine = next;
        }}
      />
    ),
    live: () => {
      if (!machine) throw new Error('the probe did not render inside <Command>');
      return machine;
    },
  };
}

/** What the state readers last saw, and how many times they rendered. */
const reads: { renders: number; count: number; state: CommandState | undefined } = {
  renders: 0,
  count: -1,
  state: undefined,
};

function SliceReader(): null {
  reads.count = useCommandState((state) => state.filteredCount);
  reads.renders += 1;
  return null;
}

function WholeReader(): null {
  reads.state = useCommandState();
  reads.renders += 1;
  return null;
}

describe('useCommandState', () => {
  it('T10: a primitive slice re-renders only when its value changes', async () => {
    reads.renders = 0;
    const { capture, live } = machineHolder();
    await mount(
      <Command label="slice">
        {capture}
        <SliceReader />
        <Command.List>
          <Command.Item value="alpha">Alpha</Command.Item>
          <Command.Item value="beta">Beta</Command.Item>
          <Command.Item value="gamma">Gamma</Command.Item>
        </Command.List>
      </Command>,
    );
    await settle();
    expect(reads.count).toBe(3);
    const settled = reads.renders;

    // A new active item changes the state but not the slice: no render
    const activeBefore = live().getState().activeId;
    await step(() => live().send({ type: 'NAVIGATE', direction: 'next' }));
    expect(live().getState().activeId).not.toBe(activeBefore);
    expect(reads.renders).toBe(settled);

    // A search that narrows the slice adds exactly one render and shows the new value
    await step(() => live().send({ type: 'SEARCH_CHANGE', query: 'alp' }));
    expect(reads.count).toBe(1);
    expect(reads.renders).toBe(settled + 1);
  });

  it('T10: the form without a selector returns the state and re-renders per change', async () => {
    reads.renders = 0;
    reads.state = undefined;
    const { capture, live } = machineHolder();
    await mount(
      <Command label="whole">
        {capture}
        <WholeReader />
        <Command.List>
          <Command.Item value="alpha">Alpha</Command.Item>
          <Command.Item value="beta">Beta</Command.Item>
        </Command.List>
      </Command>,
    );
    await settle();
    expect(reads.state).toBe(live().getState());
    const settled = reads.renders;

    await step(() => live().send({ type: 'NAVIGATE', direction: 'last' }));
    expect(reads.state).toBe(live().getState());
    expect(reads.renders).toBe(settled + 1);

    await step(() => live().send({ type: 'SEARCH_CHANGE', query: 'bet' }));
    expect(reads.state).toBe(live().getState());
    expect(live().getState().search).toBe('bet');
    expect(reads.renders).toBe(settled + 2);
  });
});

type ItemProbeProps = {
  readonly value: string;
  readonly id?: string;
  readonly forceId?: string;
  readonly onId?: (id: string) => void;
};

function ItemProbe({ value, id, forceId, onId }: ItemProbeProps): null {
  const registered = useRegisterItem(value, {
    ...(id === undefined ? {} : { id }),
    ...(forceId === undefined ? {} : { forceId }),
  });
  onId?.(registered);
  return null;
}

type GroupProbeProps = {
  readonly heading: string;
  readonly id?: string;
  readonly forceId?: string;
  readonly onId?: (id: string) => void;
};

function GroupProbe({ heading, id, forceId, onId }: GroupProbeProps): null {
  const registered = useRegisterGroup(heading, {
    ...(id === undefined ? {} : { id }),
    ...(forceId === undefined ? {} : { forceId }),
  });
  onId?.(registered);
  return null;
}

describe('useRegisterItem and useRegisterGroup', () => {
  /** A palette that renders `children` only while `show` is true. */
  function palette(show: boolean, capture: ReactNode, children: ReactNode): ReactNode {
    return (
      <Command label="register">
        {capture}
        {show ? children : null}
      </Command>
    );
  }

  it('T10: useRegisterItem registers on mount and unregisters on unmount', async () => {
    const { capture, live } = machineHolder();
    let returned = '';
    const probe = (
      <ItemProbe
        value="alpha"
        onId={(next: string): void => {
          returned = next;
        }}
      />
    );
    const entry = await mount(palette(true, capture, probe));
    const registry = live().getRegistry();
    expect(registry.getItems().map((item) => item.value)).toEqual(['alpha']);
    // Without an id option the registration id is the generated one the hook returns
    expect(returned).not.toBe('');
    expect(registry.getItems().map((item) => item.id)).toEqual([itemId(returned)]);

    await rerender(entry, palette(false, capture, probe));
    expect(registry.getItems()).toEqual([]);
    expect(registry.getItem(itemId(returned))).toBeUndefined();

    await rerender(entry, palette(true, capture, probe));
    expect(registry.getItems().map((item) => item.value)).toEqual(['alpha']);
  });

  it('T10: useRegisterItem registers under the id option and under the deprecated forceId', async () => {
    const { capture, live } = machineHolder();
    const entry = await mount(palette(true, capture, <ItemProbe value="alpha" id="by-id" />));
    const registry = live().getRegistry();
    expect(registry.getItems().map((item) => item.id)).toEqual([itemId('by-id')]);

    await rerender(entry, palette(true, capture, <ItemProbe value="alpha" forceId="by-force" />));
    expect(registry.getItems().map((item) => item.id)).toEqual([itemId('by-force')]);
    expect(registry.getItem(itemId('by-id'))).toBeUndefined();
  });

  it('T10: useRegisterGroup registers on mount, unregisters on unmount and honours id and forceId', async () => {
    const { capture, live } = machineHolder();
    let returned = '';
    const generated = (
      <GroupProbe
        heading="Fruit"
        onId={(next: string): void => {
          returned = next;
        }}
      />
    );
    const entry = await mount(palette(true, capture, generated));
    const registry = live().getRegistry();
    expect(registry.getGroups().map((group) => group.heading)).toEqual(['Fruit']);
    expect(registry.getGroups().map((group) => group.id)).toEqual([groupId(returned)]);

    await rerender(entry, palette(false, capture, generated));
    expect(registry.getGroups()).toEqual([]);

    await rerender(entry, palette(true, capture, <GroupProbe heading="Fruit" id="g-id" />));
    expect(registry.getGroups().map((group) => group.id)).toEqual([groupId('g-id')]);

    await rerender(entry, palette(true, capture, <GroupProbe heading="Fruit" forceId="g-force" />));
    expect(registry.getGroups().map((group) => group.id)).toEqual([groupId('g-force')]);
  });

  // The conflict warning fires once per module load: this is the only test in the file that
  // gives differing id and forceId values.
  it('T10: id wins over a differing forceId and the development warning fires once', async () => {
    using warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const conflict = (): string[] =>
      warn.mock.calls.map((call) => String(call[0])).filter((m) => m.includes('`forceId`'));
    const { capture, live } = machineHolder();

    // Equal values are no conflict
    const entry = await mount(
      palette(true, capture, <ItemProbe value="alpha" id="same" forceId="same" />),
    );
    expect(conflict()).toEqual([]);
    expect(
      live()
        .getRegistry()
        .getItems()
        .map((item) => item.id),
    ).toEqual([itemId('same')]);

    await rerender(
      entry,
      palette(true, capture, <ItemProbe value="alpha" id="winner" forceId="loser" />),
    );
    expect(
      live()
        .getRegistry()
        .getItems()
        .map((item) => item.id),
    ).toEqual([itemId('winner')]);
    expect(conflict()).toHaveLength(1);
    expect(conflict()[0]).toContain('`id` ("winner") and `forceId` ("loser")');

    // A second conflict, on an item and on a group, stays silent
    await rerender(
      entry,
      palette(
        true,
        capture,
        <>
          <ItemProbe value="beta" id="winner-2" forceId="loser-2" />
          <GroupProbe heading="Group" id="group-winner" forceId="group-loser" />
        </>,
      ),
    );
    expect(
      live()
        .getRegistry()
        .getGroups()
        .map((group) => group.id),
    ).toEqual([groupId('group-winner')]);
    expect(conflict()).toHaveLength(1);
  });
});

function VirtualizerProbe({
  options,
  onValue,
}: {
  readonly options: VirtualizerOptions;
  readonly onValue: (value: VirtualizerReturn) => void;
}): null {
  onValue(useVirtualizer(options));
  return null;
}

describe('useVirtualizer', () => {
  let notifyHeight: (height: number) => void = () => {};

  class StubResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      notifyHeight = (height: number): void => {
        callback([{ contentRect: { height } } as ResizeObserverEntry], this as ResizeObserver);
      };
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }

  interface Surface {
    readonly element: HTMLElement;
    readonly scrollTo: ReturnType<typeof vi.fn>;
    readonly setScrollTop: (top: number) => void;
  }

  /**
   * A scroll element with a writable `scrollTop`, a fixed `clientHeight` and one child whose
   * top edge sits `origin` px below the element's content top, as the rows would after padding.
   */
  function surface(viewport: number, origin = 0): Surface {
    const element = document.createElement('div');
    let top = 0;
    Object.defineProperty(element, 'scrollTop', {
      configurable: true,
      get: () => top,
      set: (next: number) => {
        top = next;
      },
    });
    Object.defineProperty(element, 'clientHeight', { configurable: true, value: viewport });
    element.getBoundingClientRect = (): DOMRect => ({ top: 0 }) as DOMRect;
    const child = document.createElement('div');
    child.getBoundingClientRect = (): DOMRect => ({ top: origin - top }) as DOMRect;
    element.append(child);
    const scrollTo = vi.fn();
    element.scrollTo = scrollTo as unknown as typeof element.scrollTo;
    return {
      element,
      scrollTo,
      setScrollTop: (next: number): void => {
        top = next;
      },
    };
  }

  async function mountVirtualizer(
    surfaceOf: Surface,
    options: Omit<VirtualizerOptions, 'scrollElement'>,
  ): Promise<{
    readonly current: () => VirtualizerReturn;
    readonly resize: (height: number) => Promise<void>;
    readonly scrollTo: (top: number) => Promise<void>;
    readonly update: (next: Omit<VirtualizerOptions, 'scrollElement'>) => Promise<void>;
  }> {
    vi.stubGlobal('ResizeObserver', StubResizeObserver);
    let value: VirtualizerReturn | undefined;
    const tree = (next: Omit<VirtualizerOptions, 'scrollElement'>): ReactNode => (
      <VirtualizerProbe
        options={{ ...next, scrollElement: surfaceOf.element }}
        onValue={(current: VirtualizerReturn): void => {
          value = current;
        }}
      />
    );
    const entry = await mount(tree(options));
    return {
      current: () => {
        if (!value) throw new Error('the hook never rendered');
        return value;
      },
      resize: (height: number): Promise<void> =>
        act(async () => {
          notifyHeight(height);
        }),
      scrollTo: (top: number): Promise<void> =>
        act(async () => {
          surfaceOf.setScrollTop(top);
          surfaceOf.element.dispatchEvent(new Event('scroll'));
        }),
      update: (next: Omit<VirtualizerOptions, 'scrollElement'>): Promise<void> =>
        rerender(entry, tree(next)),
    };
  }

  const windowOf = (value: VirtualizerReturn): { index: number; start: number }[] =>
    value.virtualItems.map(({ index, start }) => ({ index, start }));

  const rows = (from: number, to: number, size: number): { index: number; start: number }[] =>
    Array.from({ length: to - from + 1 }, (_, i) => ({
      index: from + i,
      start: (from + i) * size,
    }));

  it('T10: no items until the container reports a height, none when disabled', async () => {
    const hook = await mountVirtualizer(surface(200), { count: 100, estimateSize: 40 });
    expect(hook.current().virtualItems).toEqual([]);
    expect(hook.current().totalSize).toBe(4000);

    await hook.resize(200);
    expect(hook.current().virtualItems.length).toBeGreaterThan(0);

    await hook.update({ count: 100, estimateSize: 40, enabled: false });
    expect(hook.current().virtualItems).toEqual([]);
    expect(hook.current().totalSize).toBe(0);
  });

  it('T10: the window covers the viewport and overscan rows past it, at estimate-size offsets', async () => {
    const hook = await mountVirtualizer(surface(200), {
      count: 100,
      estimateSize: 40,
      overscan: 2,
    });
    await hook.resize(200);
    // Rows 0 to 4 fill the 200 px viewport; the window stops after the first row that ends
    // beyond 200 + 2 * 40 px
    expect(windowOf(hook.current())).toEqual(rows(0, 7, 40));
    expect(hook.current().virtualItems.every(({ size, key }, i) => size === 40 && key === i)).toBe(
      true,
    );
    expect(hook.current().totalSize).toBe(4000);
  });

  it('T10: a scroll moves the window and overscan widens it at both edges', async () => {
    const narrow = await mountVirtualizer(surface(200), {
      count: 100,
      estimateSize: 40,
      overscan: 0,
    });
    await narrow.resize(200);
    await narrow.scrollTo(400);
    // First visible row 9 (it ends at 400) to the first row ending beyond 600
    expect(windowOf(narrow.current())).toEqual(rows(9, 15, 40));

    await narrow.update({ count: 100, estimateSize: 40, overscan: 2 });
    // Two rows more before the first visible row and two rows more of reach after the viewport
    expect(windowOf(narrow.current())).toEqual(rows(7, 17, 40));
  });

  it('T10: overscan clamps at the first row and at the last row', async () => {
    const element = surface(200);
    const hook = await mountVirtualizer(element, { count: 100, estimateSize: 40, overscan: 8 });
    await hook.resize(200);
    await hook.scrollTo(40);
    expect(hook.current().virtualItems[0]).toMatchObject({ index: 0, start: 0 });

    await hook.scrollTo(3800);
    const last = hook.current().virtualItems;
    // First visible row 94, less 8 rows of overscan, to the final row 99
    expect(last[0]).toMatchObject({ index: 86, start: 3440 });
    expect(last.at(-1)).toMatchObject({ index: 99, start: 3960 });
    expect(last).toHaveLength(14);
  });

  it("T10: scrollToIndex 'start' scrolls to the row offset and clamps an index past the end", async () => {
    const element = surface(100);
    const hook = await mountVirtualizer(element, { count: 100, estimateSize: 40 });
    hook.current().scrollToIndex(3, 'start');
    expect(element.scrollTo).toHaveBeenLastCalledWith({ top: 120, behavior: 'instant' });
    hook.current().scrollToIndex(0);
    expect(element.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'instant' });
    hook.current().scrollToIndex(500);
    expect(element.scrollTo).toHaveBeenLastCalledWith({ top: 3960, behavior: 'instant' });
    expect(element.scrollTo).toHaveBeenCalledTimes(3);
  });

  it("T10: scrollToIndex 'nearest' brings a row above to the top edge and a partly hidden row to the bottom edge", async () => {
    const element = surface(100);
    const hook = await mountVirtualizer(element, { count: 100, estimateSize: 40 });
    // Row 2 spans 80 to 120 and the viewport 0 to 100: it moves just into view
    hook.current().scrollToIndex(2, 'nearest');
    expect(element.scrollTo).toHaveBeenLastCalledWith({ top: 20, behavior: 'instant' });

    // Scrolled to 1000, row 5 (200 to 240) is above the viewport and meets the top edge
    element.setScrollTop(1000);
    hook.current().scrollToIndex(5, 'nearest');
    expect(element.scrollTo).toHaveBeenLastCalledWith({ top: 200, behavior: 'instant' });

    // Scrolled to 100, row 3 (120 to 160) is fully inside 100 to 200: nothing moves
    element.setScrollTop(100);
    hook.current().scrollToIndex(3, 'nearest');
    expect(element.scrollTo).toHaveBeenCalledTimes(2);
  });

  it("T10: scrollToIndex 'nearest' counts the space before the first row", async () => {
    const element = surface(100, 16);
    const hook = await mountVirtualizer(element, { count: 100, estimateSize: 40 });
    // Row 5 spans 216 to 256 once 16 px of padding precede the rows: its bottom edge is 256
    hook.current().scrollToIndex(5, 'nearest');
    expect(element.scrollTo).toHaveBeenLastCalledWith({ top: 156, behavior: 'instant' });
    // 'start' ignores the padding
    hook.current().scrollToIndex(5, 'start');
    expect(element.scrollTo).toHaveBeenLastCalledWith({ top: 200, behavior: 'instant' });
  });

  it('T10: scrollToIndex does nothing when the hook is disabled', async () => {
    const element = surface(100);
    const hook = await mountVirtualizer(element, {
      count: 100,
      estimateSize: 40,
      enabled: false,
    });
    hook.current().scrollToIndex(5);
    hook.current().scrollToIndex(5, 'nearest');
    expect(element.scrollTo).not.toHaveBeenCalled();
  });
});

/** Calls useCommandDevtools from the module graph `react`, which the test imports fresh. */
function DevtoolsBridge({
  react,
  label,
  onMachine,
}: {
  readonly react: typeof import('modern-cmdk/react');
  readonly label: string;
  readonly onMachine: (machine: CommandMachine | undefined) => void;
}): null {
  react.useCommandDevtools(label);
  onMachine(use(react.CommandStableContext)?.machine);
  return null;
}

describe('useCommandDevtools: development against production', () => {
  const DEVTOOLS_KEY = '__MODERN_CMDK_DEVTOOLS__';
  const DEPRECATED_KEY = '__CRIMSON_COMMAND_DEVTOOLS__';
  const EVENTS = ['modern-cmdk-devtools', 'crimson-command-devtools'] as const;

  /** A fresh module graph so the module-scoped `dev` flag re-reads the stubbed NODE_ENV. */
  async function mountFresh(label: string): Promise<{ readonly machine: CommandMachine }> {
    vi.resetModules();
    const react: typeof import('modern-cmdk/react') = await import('modern-cmdk/react');
    let machine: CommandMachine | undefined;
    await mount(
      <react.Command label="devtools">
        <DevtoolsBridge
          react={react}
          label={label}
          onMachine={(next: CommandMachine | undefined): void => {
            machine = next;
          }}
        />
        <react.Command.List>
          <react.Command.Item value="alpha">Alpha</react.Command.Item>
        </react.Command.List>
      </react.Command>,
    );
    if (!machine) throw new Error('the bridge did not render inside <Command>');
    return { machine };
  }

  it('T10: in production the mount and a later state change dispatch no event and create no global', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    const received: string[] = [];
    const listeners = EVENTS.map((name) => {
      const listener = (): void => {
        received.push(name);
      };
      globalThis.addEventListener(name, listener);
      return [name, listener] as const;
    });
    try {
      const { machine } = await mountFresh('prod-bridge');
      await act(async () => {
        machine.send({ type: 'SEARCH_CHANGE', query: 'alp' });
        vi.advanceTimersToNextFrame();
      });
      expect(machine.getState().search).toBe('alp');
    } finally {
      for (const [name, listener] of listeners) globalThis.removeEventListener(name, listener);
    }
    expect(received).toEqual([]);
    expect(Reflect.has(globalThis, DEVTOOLS_KEY)).toBe(false);
    expect(Reflect.has(globalThis, DEPRECATED_KEY)).toBe(false);
  });

  it('T10: dev is false where process does not exist, so the hook stays inert', async () => {
    vi.resetModules();
    vi.stubGlobal('process', undefined);
    let flag: boolean;
    try {
      ({ dev: flag } = await import('../../packages/modern-cmdk/src/react/env.ts'));
    } finally {
      vi.unstubAllGlobals();
    }
    expect(flag).toBe(false);
    vi.resetModules();
    const { dev } = await import('../../packages/modern-cmdk/src/react/env.ts');
    expect(dev).toBe(true);
  });
});

describe('Command.Highlight', () => {
  /** The child nodes of the rendered highlight, text nodes as `text:` and marks as `mark:`. */
  const shape = ({ container }: Mounted): string[] =>
    Array.from(container.childNodes, (node) =>
      node.nodeType === Node.TEXT_NODE ? `text:${node.textContent}` : `mark:${node.textContent}`,
    );

  it('RA-33: ranges given out of order render in text order', async () => {
    const entry = await mount(
      <Command.Highlight
        text="Hello World"
        ranges={[
          [6, 11],
          [0, 2],
        ]}
      />,
    );
    expect(shape(entry)).toEqual(['mark:He', 'text:llo ', 'mark:World']);
    expect(entry.container.textContent).toBe('Hello World');
  });

  it('RA-33: the end index is exclusive and a range reaching the end leaves no trailing text', async () => {
    const inside = await mount(<Command.Highlight text="Hello" ranges={[[0, 2]]} />);
    expect(shape(inside)).toEqual(['mark:He', 'text:llo']);

    const atEnd = await mount(<Command.Highlight text="Hello" ranges={[[2, 5]]} />);
    expect(shape(atEnd)).toEqual(['text:He', 'mark:llo']);
  });

  it('RA-33: highlightClassName lands on every mark and only on marks', async () => {
    const { container } = await mount(
      <Command.Highlight
        text="Hello World"
        highlightClassName="hit"
        ranges={[
          [0, 1],
          [4, 5],
          [6, 11],
        ]}
      />,
    );
    const marks = Array.from(container.querySelectorAll('mark'));
    expect(marks.map((mark) => mark.textContent)).toEqual(['H', 'o', 'World']);
    expect(marks.map((mark) => mark.className)).toEqual(['hit', 'hit', 'hit']);
    expect(container.querySelectorAll('.hit')).toHaveLength(3);
  });
});

/** Calls useCommand for `machine` and hands the return value to `onValue`. */
function CommandProbe({
  machine,
  onValue,
}: {
  readonly machine: CommandMachine;
  readonly onValue: (value: UseCommandReturn) => void;
}): null {
  onValue(useCommand(machine));
  return null;
}

const fruit = [
  { id: itemId('a'), value: 'Alpha' },
  { id: itemId('b'), value: 'Beta' },
  { id: itemId('c'), value: 'Gamma' },
];

describe('useCommand', () => {
  async function mountCommand(machine: CommandMachine): Promise<() => UseCommandReturn> {
    let value: UseCommandReturn | undefined;
    await mount(
      <CommandProbe
        machine={machine}
        onValue={(next: UseCommandReturn): void => {
          value = next;
        }}
      />,
    );
    return () => {
      if (!value) throw new Error('the hook never rendered');
      return value;
    };
  }

  it('T10: useCommand exposes the machine state and its actions drive the machine', async () => {
    using machine = createCommandMachine({ items: fruit });
    const live = await mountCommand(machine);
    expect(live().state).toBe(machine.getState());
    expect(live().isPending).toBe(false);
    expect(live().id).not.toBe('');
    expect([...live().filteredIdSet]).toEqual([itemId('a'), itemId('b'), itemId('c')]);

    await step(() => live().updateSearch('bet'));
    expect(live().state.search).toBe('bet');
    expect(live().state).toBe(machine.getState());
    expect([...live().filteredIdSet]).toEqual([itemId('b')]);
  });

  it('T10: useCommand setOptimisticActiveId activates an item and ignores null', async () => {
    using machine = createCommandMachine({ items: fruit });
    const live = await mountCommand(machine);
    await step(() => live().setOptimisticActiveId(itemId('c')));
    expect(live().state.activeId).toBe(itemId('c'));

    await step(() => live().setOptimisticActiveId(null));
    expect(live().state.activeId).toBe(itemId('c'));
  });
});

describe('createKeydownHandler', () => {
  const frame = (): Promise<void> =>
    new Promise((resolve) => requestAnimationFrame(() => resolve()));

  /** Dispatches a cancelable keydown through `handler` and waits for the machine's frame. */
  async function press(
    handler: (event: KeyboardEvent) => void,
    key: string,
  ): Promise<KeyboardEvent> {
    const event = new KeyboardEvent('keydown', { key, cancelable: true });
    handler(event);
    await frame();
    return event;
  }

  it('T10: createKeydownHandler maps the arrow, Home and End keys to navigation and prevents default', async () => {
    using machine = createCommandMachine({ items: fruit });
    const handler = createKeydownHandler(machine, machine.getState);
    await frame();
    expect(machine.getState().activeId).toBe(itemId('a'));
    const keys: [string, string][] = [
      ['ArrowDown', 'b'],
      ['End', 'c'],
      ['ArrowUp', 'b'],
      ['Home', 'a'],
    ];
    for (const [key, id] of keys) {
      const event = await press(handler, key);
      expect(event.defaultPrevented, key).toBe(true);
      expect(machine.getState().activeId, key).toBe(itemId(id));
    }
  });

  it('T10: createKeydownHandler selects the active item on Enter and leaves unmapped keys alone', async () => {
    const onSelect = vi.fn();
    using machine = createCommandMachine({ items: fruit, onSelect });
    const handler = createKeydownHandler(machine, machine.getState);
    await frame();
    await press(handler, 'ArrowDown');

    const enter = await press(handler, 'Enter');
    expect(enter.defaultPrevented).toBe(true);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(itemId('b'));

    const before = machine.getState();
    for (const key of ['x', 'Tab', 'Backspace']) {
      const event = await press(handler, key);
      expect(event.defaultPrevented, key).toBe(false);
    }
    expect(machine.getState()).toBe(before);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('T10: createKeydownHandler closes on Escape unless it is already prevented and pops a page on an empty Backspace', async () => {
    using machine = createCommandMachine({ items: fruit });
    const handler = createKeydownHandler(machine, machine.getState);
    machine.send({ type: 'OPEN' });
    machine.send({ type: 'PAGE_PUSH', page: 'sub' });
    await frame();
    expect(machine.getState().open).toBe(true);
    expect(machine.getState().page).toBe('sub');

    const backspace = await press(handler, 'Backspace');
    expect(backspace.defaultPrevented).toBe(true);
    expect(machine.getState().pageStack).toEqual([]);

    const taken = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    taken.preventDefault();
    handler(taken);
    await frame();
    expect(machine.getState().open).toBe(true);

    const escaped = await press(handler, 'Escape');
    expect(escaped.defaultPrevented).toBe(true);
    expect(machine.getState().open).toBe(false);
  });
});
