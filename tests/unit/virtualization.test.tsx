import { Command, useVirtualizer, type VirtualizerReturn } from 'modern-cmdk/react';
import type { ReactNode } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

/**
 * Wait one frame inside act(). The machine's scheduler batches on requestAnimationFrame
 * (setImmediate-backed under happy-dom), not on a microtask. React's async act() yields to
 * setImmediate before it resolves, so the awaited act() before each call has already applied the
 * batch it queued; this frame is a guard that runs after any batch still queued.
 */
function flushFrame(): Promise<void> {
  return act(async () => {
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  });
}

async function render(ui: React.ReactNode): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(ui);
  });
  // The act() above ran the scheduler's frame on exit; one more frame as a guard
  await flushFrame();
}

afterEach(async () => {
  if (root) {
    await act(async () => {
      root.unmount();
    });
  }
  container?.remove();
});

describe('Virtualization', () => {
  it('should render all items when count is below threshold', async () => {
    // ES2025 Iterator helpers — generate JSX items via iterator pipeline
    const items: ReactNode[] = Iterator.from({
      [Symbol.iterator]: function* (): Generator<number> {
        for (let i = 0; i < 10; i++) yield i;
      },
    })
      .map((i) => (
        <Command.Item key={i} value={`item-${i}`} forceId={`item-${i}`}>
          Item {i}
        </Command.Item>
      ))
      .toArray();

    await render(
      <Command>
        <Command.Input />
        <Command.List>{items}</Command.List>
      </Command>,
    );

    await vi.waitFor(() => {
      const renderedItems = container.querySelectorAll('[data-command-item]');
      expect(renderedItems.length).toBe(10);
    });
  });

  it('should not show virtual container when virtualize is false', async () => {
    await render(
      <Command>
        <Command.Input />
        <Command.List virtualize={false}>
          <Command.Item value="one" forceId="one">
            One
          </Command.Item>
        </Command.List>
      </Command>,
    );

    await vi.waitFor(() => {
      const virtualContainer = container.querySelector('[data-command-list-virtual]');
      expect(virtualContainer).toBeNull();
      const innerContainer = container.querySelector('[data-command-list-inner]');
      expect(innerContainer).not.toBeNull();
    });
  });

  it('should have listbox role on the list element', async () => {
    await render(
      <Command>
        <Command.Input />
        <Command.List>
          <Command.Item value="test" forceId="test">
            Test
          </Command.Item>
        </Command.List>
      </Command>,
    );

    const list = container.querySelector('[data-command-list]');
    expect(list).not.toBeNull();
    expect(list?.getAttribute('role')).toBe('listbox');
  });

  it('should have aria-live region for screen reader announcements', async () => {
    await render(
      <Command>
        <Command.Input />
        <Command.List>
          <Command.Item value="apple" forceId="apple">
            Apple
          </Command.Item>
          <Command.Item value="banana" forceId="banana">
            Banana
          </Command.Item>
        </Command.List>
      </Command>,
    );

    await vi.waitFor(() => {
      const ariaLive = container.querySelector('[aria-live="polite"]');
      expect(ariaLive).not.toBeNull();
      expect(ariaLive?.textContent).toContain('result');
    });
  });

  it('should set --command-list-height CSS custom property', async () => {
    await render(
      <Command>
        <Command.Input />
        <Command.List>
          <Command.Item value="test" forceId="test">
            Test
          </Command.Item>
        </Command.List>
      </Command>,
    );

    const list = container.querySelector('[data-command-list]') as HTMLElement;
    expect(list).not.toBeNull();
    // The style should contain the custom property (getPropertyValue returns '' for missing props)
    expect(list.style.getPropertyValue('--command-list-height')).not.toBe('');
  });

  it('should accept estimateSize and overscan props', async () => {
    await render(
      <Command>
        <Command.Input />
        <Command.List estimateSize={48} overscan={4}>
          <Command.Item value="test" forceId="test">
            Test
          </Command.Item>
        </Command.List>
      </Command>,
    );

    // Should render without error — props are accepted
    const list = container.querySelector('[data-command-list]');
    expect(list).not.toBeNull();
  });
});

/** Calls useVirtualizer for `element` and hands the return value to `onValue`. */
function HookProbe({
  element,
  onValue,
}: {
  readonly element: HTMLElement;
  readonly onValue: (value: VirtualizerReturn) => void;
}): null {
  onValue(useVirtualizer({ count: 100, estimateSize: 44, scrollElement: element }));
  return null;
}

describe('useVirtualizer scrollToIndex', () => {
  /** Mounts the hook on a scroll element with a `clientHeight` of `viewport` and returns the hook value and the `scrollTo` spy. */
  async function mountHook(viewport: number): Promise<{
    readonly current: () => VirtualizerReturn;
    readonly scrollTo: ReturnType<typeof vi.fn>;
  }> {
    const element = document.createElement('div');
    Object.defineProperty(element, 'clientHeight', { value: viewport });
    const scrollTo = vi.fn();
    element.scrollTo = scrollTo as unknown as typeof element.scrollTo;
    let value: VirtualizerReturn | undefined;
    await render(
      <HookProbe
        element={element}
        onValue={(next: VirtualizerReturn): void => {
          value = next;
        }}
      />,
    );
    return {
      current: (): VirtualizerReturn => {
        if (!value) throw new Error('hook never rendered');
        return value;
      },
      scrollTo,
    };
  }

  it('CE-119: scrollToIndex aligns the row to the top by default, in view or not', async () => {
    const { current, scrollTo } = await mountHook(1000);
    current().scrollToIndex(5);
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 220, behavior: 'instant' });
  });

  it("CE-119: scrollToIndex with 'nearest' leaves a row in view alone and scrolls a row below just into view", async () => {
    const { current, scrollTo } = await mountHook(100);
    (current().scrollToIndex as (index: number, align: string) => void)(1, 'nearest');
    expect(scrollTo).not.toHaveBeenCalled();
    (current().scrollToIndex as (index: number, align: string) => void)(5, 'nearest');
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 164, behavior: 'instant' });
  });
});
