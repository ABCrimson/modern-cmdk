// tests/unit/list-virtual-switch.test.tsx
// Command.List across the virtualization threshold (cluster C2): the items stay mounted, so a search that
// moves the filtered count over 100 in either direction registers and unregisters nothing.

import type { CommandMachine } from 'modern-cmdk';
import { Command, CommandStableContext } from 'modern-cmdk/react';
import type { ReactNode, Ref, RefCallback } from 'react';
import { act, createRef, use } from 'react';
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

/** Runs the scheduler frames and the effects that follow a state change. */
const settle = (): Promise<void> =>
  act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  });

/** Records the machine the subtree holds. */
class MachineProbe {
  machine: CommandMachine | undefined;

  /** Probe child: place it inside `<Command>`. */
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

/** The `type` of every event a spy on `machine.send` recorded. */
const sentTypes = (spy: { readonly mock: { readonly calls: readonly unknown[][] } }): string[] =>
  spy.mock.calls.map(([event]) => (event as { readonly type: string }).type);

const COMMON = 120;
const RARE = 30;

/** Item values 'prefix 0' to 'prefix <count - 1>'. */
const values = (prefix: string, count: number): string[] =>
  Array.from({ length: count }, (_, i) => `${prefix} ${i}`);

describe('Command.List virtualization switch (C2)', () => {
  it('CE-123: crossing 100 matches sends no UNREGISTER_ITEM', async () => {
    const probe = new MachineProbe();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const current = root;
    await act(async () => {
      current.render(
        <Command>
          <probe.Probe />
          <Command.Input />
          <Command.List>
            {[...values('common', COMMON), ...values('rare', RARE)].map((value) => (
              <Command.Item key={value} value={value} forceId={value}>
                {value}
              </Command.Item>
            ))}
          </Command.List>
        </Command>,
      );
    });
    await settle();

    // 150 matches: the list virtualizes
    expect(container.querySelector('[data-command-list-virtual]')).not.toBeNull();
    const machine = probe.current;
    const search = async (query: string): Promise<void> => {
      await act(async () => {
        machine.send({ type: 'SEARCH_CHANGE', query });
      });
      await settle();
    };

    using send = vi.spyOn(machine, 'send');
    // 30 matches: down across the threshold (the latch releases at 50 or fewer)
    await search('rare');
    expect(container.querySelector('[data-command-list-inner]')).not.toBeNull();
    expect(container.querySelector('[data-command-list-virtual]')).toBeNull();
    // 150 matches again: up across it
    await search('');
    expect(container.querySelector('[data-command-list-virtual]')).not.toBeNull();

    const types = sentTypes(send);
    expect(types.filter((type) => type === 'UNREGISTER_ITEM')).toEqual([]);
    expect(types.filter((type) => type === 'REGISTER_ITEM')).toEqual([]);
  });
});

describe('Command.List ref prop (C2)', () => {
  /** Mounts a palette whose list takes `ref`; `render` re-renders it with another ref. */
  async function mountList(
    ref: Ref<HTMLDivElement>,
  ): Promise<(next: Ref<HTMLDivElement>) => Promise<void>> {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const current = root;
    const tree = (listRef: Ref<HTMLDivElement>): ReactNode => (
      <Command>
        <Command.List ref={listRef}>
          <Command.Item value="one" forceId="one">
            One
          </Command.Item>
        </Command.List>
      </Command>
    );
    await act(async () => {
      current.render(tree(ref));
    });
    await settle();
    return async (next: Ref<HTMLDivElement>): Promise<void> => {
      await act(async () => {
        current.render(tree(next));
      });
      await settle();
    };
  }

  it('RA-58: an inline callback ref attaches once per render and its cleanup runs on detach', async () => {
    const log: string[] = [];
    const inlineRef =
      (): RefCallback<HTMLDivElement> =>
      (el: HTMLDivElement | null): (() => void) => {
        log.push(el ? 'attach' : 'null-call');
        return () => {
          log.push('cleanup');
        };
      };
    const rerender = await mountList(inlineRef());
    expect(log).toEqual(['attach']);

    // A new inline function replaces the old one: the old cleanup runs, the new ref attaches, nothing loops
    await rerender(inlineRef());
    await rerender(inlineRef());
    expect(log).toEqual(['attach', 'cleanup', 'attach', 'cleanup', 'attach']);

    await act(async () => {
      root?.unmount();
    });
    root = undefined;
    expect(log.at(-1)).toBe('cleanup');
    expect(log.filter((entry) => entry === 'null-call')).toEqual([]);
  });

  it('RA-58: swapping the ref prop moves the list element to the new ref', async () => {
    const first = createRef<HTMLDivElement>();
    const second = createRef<HTMLDivElement>();
    const rerender = await mountList(first);
    const list = container?.querySelector('[data-command-list]');
    expect(list).not.toBeNull();
    expect(first.current).toBe(list);

    await rerender(second);
    expect(second.current).toBe(list);
    expect(first.current).toBeNull();
  });
});

describe('Command.List --command-list-height (C2)', () => {
  it('CE-123: the property does not take the virtual total after the list crosses 100 matches', async () => {
    // A ResizeObserver whose callbacks the test fires by hand
    const observers: { readonly callback: ResizeObserverCallback; readonly targets: Element[] }[] =
      [];
    class ManualResizeObserver {
      readonly #entry: (typeof observers)[number];
      constructor(callback: ResizeObserverCallback) {
        this.#entry = { callback, targets: [] };
        observers.push(this.#entry);
      }
      observe(target: Element): void {
        this.#entry.targets.push(target);
      }
      unobserve(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('ResizeObserver', ManualResizeObserver);
    try {
      const probe = new MachineProbe();
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
      const current = root;
      await act(async () => {
        current.render(
          <Command>
            <probe.Probe />
            <Command.Input />
            <Command.List>
              {[...values('common', COMMON), ...values('rare', RARE)].map((value) => (
                <Command.Item key={value} value={value} forceId={value}>
                  {value}
                </Command.Item>
              ))}
            </Command.List>
          </Command>,
        );
      });
      await settle();

      const list = container.querySelector<HTMLElement>('[data-command-list]');
      expect(list).not.toBeNull();
      /** Reports `height` for the inner element, as its ResizeObserver would. */
      const report = async (height: number): Promise<void> => {
        const inner = container?.querySelector(
          '[data-command-list-inner], [data-command-list-virtual]',
        );
        const watcher = observers.find((observer) => inner && observer.targets.includes(inner));
        if (!inner || !watcher) throw new Error('no observer watches the inner element');
        await act(async () => {
          watcher.callback(
            [{ target: inner, contentRect: { height } } as ResizeObserverEntry],
            watcher as unknown as ResizeObserver,
          );
        });
      };
      const height = (): string => list?.style.getPropertyValue('--command-list-height') ?? '';

      // 30 matches: the inner element reports its natural height
      const machine = probe.current;
      await act(async () => {
        machine.send({ type: 'SEARCH_CHANGE', query: 'rare' });
      });
      await settle();
      await report(300);
      expect(height()).toBe('300.0px');

      // 150 matches: the list virtualizes and its inner element is as tall as all the rows; the property keeps 300
      await act(async () => {
        machine.send({ type: 'SEARCH_CHANGE', query: '' });
      });
      await settle();
      expect(container.querySelector('[data-command-list-virtual]')).not.toBeNull();
      await report(6600);
      expect(height()).toBe('300.0px');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
