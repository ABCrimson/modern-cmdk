// tests/unit/async.test.tsx
// Command.AsyncItems tests — React 19 use() + Suspense with happy-dom
// Pins ASY-1 (the machine receives ITEMS_LOADED), ASY-4 (the console spy is disposed with `using`)
// and ASY-5/T35 (rejection and reset through the shipped CommandErrorBoundary).
// Vitest + React (experimental channel build) + TypeScript, ESNext

import type { CommandItem as CommandItemType } from 'modern-cmdk';
import { itemId } from 'modern-cmdk';
import { Command, CommandErrorBoundary, useCommandState } from 'modern-cmdk/react';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { silenceConsoleError } from '../act-guard.ts';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

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
});

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

/** Render helper — wraps in act() (whose exit runs the scheduler's frame) and waits one more frame */
async function renderAsync(ui: ReactNode): Promise<void> {
  await act(async () => {
    root.render(ui);
  });
  await flushFrame();
}

/** Reads the machine's filtered count, so a test observes what the machine holds. */
function MachineCount(): ReactNode {
  const count = useCommandState((state) => state.filteredCount);
  return <output data-testid="count">{count}</output>;
}

const countText = (): string | null =>
  container.querySelector('[data-testid="count"]')?.textContent ?? null;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

// ES2025 Iterator helpers — generate async test items via iterator pipeline
function createTestItems(count: number): readonly CommandItemType[] {
  return Iterator.from({
    [Symbol.iterator]: function* (): Generator<number> {
      for (let i = 0; i < count; i++) yield i;
    },
  })
    .map((i) => ({
      id: itemId(`async-item-${i}`),
      value: `Async Item ${i}`,
    }))
    .toArray();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/** Module-level so React keeps one component identity across re-renders. */
function AsyncApp({
  itemsPromise,
}: {
  readonly itemsPromise: Promise<readonly CommandItemType[]>;
}): ReactNode {
  return (
    <Command>
      <Command.Input />
      <Command.List>
        <Command.AsyncItems
          items={itemsPromise}
          fallback={<div data-testid="fallback">Loading...</div>}
        >
          {(items: readonly CommandItemType[]): ReactNode[] =>
            items.map((item) => (
              <Command.Item key={item.id} value={item.value} forceId={item.id}>
                {item.value}
              </Command.Item>
            ))
          }
        </Command.AsyncItems>
      </Command.List>
    </Command>
  );
}

describe('Command.AsyncItems — Suspense + use()', () => {
  it('TEB-95: Command.Empty stays hidden while an AsyncItems source is pending and appears once it settles with no items', async () => {
    const { promise, resolve } = Promise.withResolvers<readonly CommandItemType[]>();

    await renderAsync(
      <Command>
        <Command.Input />
        <Command.List>
          <Command.AsyncItems items={promise} fallback={null}>
            {(items: readonly CommandItemType[]): ReactNode[] =>
              items.map((item) => (
                <Command.Item key={item.id} value={item.value} forceId={item.id}>
                  {item.value}
                </Command.Item>
              ))
            }
          </Command.AsyncItems>
          <Command.Empty>No results.</Command.Empty>
        </Command.List>
      </Command>,
    );

    const list = (): Element | null => container.querySelector('[data-command-list]');
    expect(container.querySelector('[data-command-empty]')).toBeNull();
    expect(list()?.getAttribute('aria-busy')).toBe('true');

    await act(async () => {
      resolve([]);
    });
    await flushFrame();

    await vi.waitFor(() => {
      expect(container.querySelector('[data-command-empty]')).not.toBeNull();
    });
    expect(list()?.getAttribute('aria-busy')).toBe('false');
  });

  it('should render fallback while promise is pending', async () => {
    const { promise } = Promise.withResolvers<readonly CommandItemType[]>();

    await renderAsync(
      <Command>
        <Command.Input />
        <Command.List>
          <Command.AsyncItems
            items={promise}
            fallback={<div data-testid="fallback">Loading async items...</div>}
          >
            {(items: readonly CommandItemType[]): ReactNode[] =>
              items.map((item) => (
                <Command.Item key={item.id} value={item.value} forceId={item.id}>
                  {item.value}
                </Command.Item>
              ))
            }
          </Command.AsyncItems>
        </Command.List>
      </Command>,
    );

    // Vitest — soft assertions for multi-check DOM state
    const fallback = container.querySelector('[data-testid="fallback"]');
    expect.soft(fallback).not.toBeNull();
    expect.soft(fallback?.textContent).toBe('Loading async items...');

    // No items should be rendered yet
    expect(container.querySelectorAll('[data-command-item]').length).toBe(0);
  });

  it('should render items after promise resolves', async () => {
    const { promise, resolve } = Promise.withResolvers<readonly CommandItemType[]>();
    const testItems = createTestItems(3);

    await renderAsync(
      <Command>
        <Command.Input />
        <Command.List>
          <Command.AsyncItems
            items={promise}
            fallback={<div data-testid="fallback">Loading...</div>}
          >
            {(items: readonly CommandItemType[]): ReactNode[] =>
              items.map((item) => (
                <Command.Item key={item.id} value={item.value} forceId={item.id}>
                  {item.value}
                </Command.Item>
              ))
            }
          </Command.AsyncItems>
        </Command.List>
      </Command>,
    );

    // Resolve the promise
    await act(async () => {
      resolve(testItems);
    });
    await flushFrame();

    // Items should now be rendered
    await vi.waitFor(() => {
      const items = container.querySelectorAll('[data-command-item]');
      expect(items.length).toBe(3);
      expect(items[0]?.textContent).toBe('Async Item 0');
      expect(items[1]?.textContent).toBe('Async Item 1');
      expect(items[2]?.textContent).toBe('Async Item 2');
    });

    // Fallback should be gone
    expect(container.querySelector('[data-testid="fallback"]')).toBeNull();
  });

  it('ASY-1: ITEMS_LOADED registers the resolved items with the machine, not the render prop', async () => {
    const { promise, resolve } = Promise.withResolvers<readonly CommandItemType[]>();

    await renderAsync(
      <Command>
        <MachineCount />
        <Command.Input />
        <Command.List>
          <Command.AsyncItems items={promise} fallback={<div>Loading...</div>}>
            {(): ReactNode => null}
          </Command.AsyncItems>
        </Command.List>
      </Command>,
    );
    expect(countText()).toBe('0');

    await act(async () => {
      resolve(createTestItems(2));
    });
    await flushFrame();

    // The render prop renders no Command.Item: only the machine's registration can make the count 2.
    await vi.waitFor(() => {
      expect(countText()).toBe('2');
    });
    expect(container.querySelectorAll('[data-command-item]').length).toBe(0);
  });

  it('ASY-5: a rejected promise reaches the shipped CommandErrorBoundary fallback and onError', async () => {
    using _consoleSpy = silenceConsoleError();
    const onError = vi.fn();
    const { promise, reject } = Promise.withResolvers<readonly CommandItemType[]>();
    const failure = new Error('Failed to load items');

    await renderAsync(
      <CommandErrorBoundary
        fallback={(error: Error): ReactNode => <div data-testid="error">{error.message}</div>}
        onError={onError}
      >
        <Command>
          <Command.Input />
          <Command.List>
            <Command.AsyncItems
              items={promise}
              fallback={<div data-testid="fallback">Loading...</div>}
            >
              {(items: readonly CommandItemType[]): ReactNode[] =>
                items.map((item) => (
                  <Command.Item key={item.id} value={item.value} id={item.id}>
                    {item.value}
                  </Command.Item>
                ))
              }
            </Command.AsyncItems>
          </Command.List>
        </Command>
      </CommandErrorBoundary>,
    );

    await act(async () => {
      reject(failure);
    });
    await flushFrame();

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="error"]')?.textContent).toBe(
        'Failed to load items',
      );
    });
    expect(onError).toHaveBeenCalledExactlyOnceWith(failure, expect.anything());
  });

  it('T35: reset after a rejection renders a new resolved batch and the machine holds it', async () => {
    using _consoleSpy = silenceConsoleError();
    const { promise: failing, reject } = Promise.withResolvers<readonly CommandItemType[]>();

    const tree = (itemsPromise: Promise<readonly CommandItemType[]>): ReactNode => (
      <Command>
        <MachineCount />
        <Command.Input />
        <Command.List>
          <CommandErrorBoundary
            fallback={(error: Error, resetBoundary: () => void): ReactNode => (
              <button type="button" data-testid="retry" onClick={resetBoundary}>
                {error.message}
              </button>
            )}
          >
            <Command.AsyncItems items={itemsPromise} fallback={<div>Loading...</div>}>
              {(items: readonly CommandItemType[]): ReactNode[] =>
                items.map((item) => (
                  <Command.Item key={item.id} value={item.value} id={item.id}>
                    {item.value}
                  </Command.Item>
                ))
              }
            </Command.AsyncItems>
          </CommandErrorBoundary>
        </Command.List>
      </Command>
    );

    await renderAsync(tree(failing));
    await act(async () => {
      reject(new Error('Failed to load items'));
    });
    await flushFrame();
    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="retry"]')).not.toBeNull();
    });
    expect(countText()).toBe('0');

    // A new resolved promise, then the reset: the boundary renders its children again.
    await renderAsync(tree(Promise.resolve(createTestItems(2))));
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="retry"]')?.click();
    });
    await flushFrame();

    await vi.waitFor(() => {
      expect(container.querySelectorAll('[data-command-item]').length).toBe(2);
    });
    expect(container.querySelector('[data-testid="retry"]')).toBeNull();
    expect(countText()).toBe('2');
  });

  it('should work with a pre-resolved promise', async () => {
    const testItems = createTestItems(2);
    const resolvedPromise = Promise.resolve(testItems);

    await renderAsync(
      <Command>
        <Command.Input />
        <Command.List>
          <Command.AsyncItems
            items={resolvedPromise}
            fallback={<div data-testid="fallback">Loading...</div>}
          >
            {(items: readonly CommandItemType[]): ReactNode[] =>
              items.map((item) => (
                <Command.Item key={item.id} value={item.value} forceId={item.id}>
                  {item.value}
                </Command.Item>
              ))
            }
          </Command.AsyncItems>
        </Command.List>
      </Command>,
    );

    await flushFrame();

    // Items should render without showing fallback (or fallback shown very briefly)
    await vi.waitFor(() => {
      const items = container.querySelectorAll('[data-command-item]');
      expect(items.length).toBe(2);
    });
  });

  it('should re-render when promise reference changes', async () => {
    const items1 = createTestItems(2);
    const items2: readonly CommandItemType[] = [
      { id: itemId('new-1'), value: 'New Item 1' },
      { id: itemId('new-2'), value: 'New Item 2' },
      { id: itemId('new-3'), value: 'New Item 3' },
    ];

    const { promise: promise1, resolve: resolve1 } =
      Promise.withResolvers<readonly CommandItemType[]>();

    // Render with first promise
    await renderAsync(<AsyncApp itemsPromise={promise1} />);

    await act(async () => {
      resolve1(items1);
    });
    await flushFrame();

    await vi.waitFor(() => {
      expect(container.querySelectorAll('[data-command-item]').length).toBe(2);
      expect(container.querySelector('#async-item-0')?.textContent).toBe('Async Item 0');
    });

    // Now render with a new, already-resolved promise
    const promise2 = Promise.resolve(items2);
    await act(async () => {
      root.render(<AsyncApp itemsPromise={promise2} />);
    });
    await flushFrame();

    await vi.waitFor(() => {
      const items = container.querySelectorAll('[data-command-item]');
      expect(items.length).toBe(3);
      expect(container.querySelector('#new-1')?.textContent).toBe('New Item 1');
    });
  });

  it('should work within a full Command compound component tree', async () => {
    const testItems = createTestItems(3);
    const resolved = Promise.resolve(testItems);

    await renderAsync(
      <Command label="Async palette">
        <Command.Input placeholder="Search async items..." />
        <Command.List>
          <Command.AsyncItems
            items={resolved}
            fallback={<Command.Loading loading>Fetching...</Command.Loading>}
          >
            {(items: readonly CommandItemType[]): ReactNode[] =>
              items.map((item) => (
                <Command.Item key={item.id} value={item.value} forceId={item.id}>
                  {item.value}
                  <Command.Badge>async</Command.Badge>
                </Command.Item>
              ))
            }
          </Command.AsyncItems>
          <Command.Empty>No results.</Command.Empty>
        </Command.List>
      </Command>,
    );

    await flushFrame();

    // Verify the full tree rendered correctly
    await vi.waitFor(() => {
      // Root
      expect(container.querySelector('[data-command-root]')).not.toBeNull();
      // Input
      expect(container.querySelector('[data-command-input]')).not.toBeNull();
      // Items
      const items = container.querySelectorAll('[data-command-item]');
      expect(items.length).toBe(3);
      // Badges
      const badges = container.querySelectorAll('[data-command-badge]');
      expect(badges.length).toBe(3);
      expect(badges[0]?.textContent).toBe('async');
    });
  });

  it('should show fallback without rendering any items initially', async () => {
    const { promise } = Promise.withResolvers<readonly CommandItemType[]>();

    await renderAsync(
      <Command>
        <Command.Input />
        <Command.List>
          <Command.AsyncItems
            items={promise}
            fallback={
              <div data-testid="skeleton" role="status">
                <span>Loading skeleton...</span>
              </div>
            }
          >
            {(items: readonly CommandItemType[]): ReactNode[] =>
              items.map((item) => (
                <Command.Item key={item.id} value={item.value} forceId={item.id}>
                  {item.value}
                </Command.Item>
              ))
            }
          </Command.AsyncItems>
        </Command.List>
      </Command>,
    );

    // The Suspense fallback should be shown
    const skeleton = container.querySelector('[data-testid="skeleton"]');
    expect(skeleton).not.toBeNull();
    expect(skeleton?.getAttribute('role')).toBe('status');

    // No command items should be in the DOM
    expect(container.querySelectorAll('[data-command-item]').length).toBe(0);
  });

  it('should transition from fallback to items smoothly', async () => {
    const { promise, resolve } = Promise.withResolvers<readonly CommandItemType[]>();
    const testItems = createTestItems(2);

    await renderAsync(
      <Command>
        <Command.Input />
        <Command.List>
          <Command.AsyncItems
            items={promise}
            fallback={<div data-testid="loading-indicator">Please wait...</div>}
          >
            {(items: readonly CommandItemType[]): ReactNode[] =>
              items.map((item) => (
                <Command.Item key={item.id} value={item.value} forceId={item.id}>
                  {item.value}
                </Command.Item>
              ))
            }
          </Command.AsyncItems>
        </Command.List>
      </Command>,
    );

    // Phase 1: fallback visible, no items
    expect(container.querySelector('[data-testid="loading-indicator"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-command-item]').length).toBe(0);

    // Phase 2: resolve and verify transition
    await act(async () => {
      resolve(testItems);
    });
    await flushFrame();

    await vi.waitFor(() => {
      // Fallback should be gone
      expect(container.querySelector('[data-testid="loading-indicator"]')).toBeNull();
      // Items should be present
      const items = container.querySelectorAll('[data-command-item]');
      expect(items.length).toBe(2);
    });
  });
});
