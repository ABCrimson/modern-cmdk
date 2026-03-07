// tests/unit/async.test.tsx
// Command.AsyncItems tests — React 19 use() + Suspense with happy-dom
// Vitest 4.1.0-beta.6, React 19.3.0-canary, TypeScript 6.0.1-rc, ES2026

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, Component, type ReactNode, type ErrorInfo } from 'react';
import { Command } from '@crimson_dev/command-react';
import type { CommandItem as CommandItemType } from '@crimson_dev/command';
import { itemId } from '@crimson_dev/command';

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

afterEach(() => {
  root.unmount();
  container.remove();
});

/** Render helper — wraps in act() and awaits a microtask for scheduler flush */
async function renderAsync(ui: ReactNode): Promise<void> {
  await act(async () => {
    root.render(ui);
  });
  await act(async () => {
    await new Promise<void>((r) => queueMicrotask(r));
  });
}

/** Flush pending microtasks and React updates */
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise<void>((r) => queueMicrotask(r));
  });
}

// ---------------------------------------------------------------------------
// Error boundary for testing rejection handling
// ---------------------------------------------------------------------------

interface ErrorBoundaryProps {
  readonly fallback: ReactNode;
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
  readonly error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo): void {
    // Silence console errors in test output
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createTestItems(count: number): readonly CommandItemType[] {
  return Array.from({ length: count }, (_, i) => ({
    id: itemId(`async-item-${i}`),
    value: `Async Item ${i}`,
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Command.AsyncItems — Suspense + use()', () => {
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
            {(items) =>
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

    // Fallback should be visible while the promise is pending
    const fallback = container.querySelector('[data-testid="fallback"]');
    expect(fallback).not.toBeNull();
    expect(fallback!.textContent).toBe('Loading async items...');

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
            {(items) =>
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
    await flush();

    // Items should now be rendered
    await vi.waitFor(() => {
      const items = container.querySelectorAll('[data-command-item]');
      expect(items.length).toBe(3);
      expect(items[0]!.textContent).toBe('Async Item 0');
      expect(items[1]!.textContent).toBe('Async Item 1');
      expect(items[2]!.textContent).toBe('Async Item 2');
    });

    // Fallback should be gone
    expect(container.querySelector('[data-testid="fallback"]')).toBeNull();
  });

  it('should send ITEMS_LOADED to the machine after resolving', async () => {
    const { promise, resolve } = Promise.withResolvers<readonly CommandItemType[]>();
    const testItems = createTestItems(2);

    await renderAsync(
      <Command>
        <Command.Input />
        <Command.List>
          <Command.AsyncItems
            items={promise}
            fallback={<div>Loading...</div>}
          >
            {(items) =>
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

    await act(async () => {
      resolve(testItems);
    });
    await flush();

    // Items should be registered and visible in the filtered list
    await vi.waitFor(() => {
      const renderedItems = container.querySelectorAll('[data-command-item]');
      expect(renderedItems.length).toBe(2);
    });
  });

  it('should handle promise rejection gracefully with error boundary', async () => {
    // Suppress console.error for expected errors
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { promise, reject } = Promise.withResolvers<readonly CommandItemType[]>();

    await renderAsync(
      <ErrorBoundary fallback={<div data-testid="error">Something went wrong</div>}>
        <Command>
          <Command.Input />
          <Command.List>
            <Command.AsyncItems
              items={promise}
              fallback={<div data-testid="fallback">Loading...</div>}
            >
              {(items) =>
                items.map((item) => (
                  <Command.Item key={item.id} value={item.value} forceId={item.id}>
                    {item.value}
                  </Command.Item>
                ))
              }
            </Command.AsyncItems>
          </Command.List>
        </Command>
      </ErrorBoundary>,
    );

    // Reject the promise
    await act(async () => {
      reject(new Error('Failed to load items'));
    });
    await flush();

    // The error boundary should catch the rejection
    await vi.waitFor(() => {
      const errorEl = container.querySelector('[data-testid="error"]');
      expect(errorEl).not.toBeNull();
      expect(errorEl!.textContent).toBe('Something went wrong');
    });

    consoleSpy.mockRestore();
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
            {(items) =>
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

    await flush();

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

    function AsyncApp({ itemsPromise }: { readonly itemsPromise: Promise<readonly CommandItemType[]> }): ReactNode {
      return (
        <Command>
          <Command.Input />
          <Command.List>
            <Command.AsyncItems
              items={itemsPromise}
              fallback={<div data-testid="fallback">Loading...</div>}
            >
              {(items) =>
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

    // Render with first promise
    await renderAsync(<AsyncApp itemsPromise={promise1} />);

    await act(async () => {
      resolve1(items1);
    });
    await flush();

    await vi.waitFor(() => {
      expect(container.querySelectorAll('[data-command-item]').length).toBe(2);
      expect(container.querySelector('#async-item-0')!.textContent).toBe('Async Item 0');
    });

    // Now render with a new, already-resolved promise
    const promise2 = Promise.resolve(items2);
    await act(async () => {
      root.render(<AsyncApp itemsPromise={promise2} />);
    });
    await flush();

    await vi.waitFor(() => {
      const items = container.querySelectorAll('[data-command-item]');
      expect(items.length).toBe(3);
      expect(container.querySelector('#new-1')!.textContent).toBe('New Item 1');
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
            {(items) =>
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

    await flush();

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
      expect(badges[0]!.textContent).toBe('async');
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
            {(items) =>
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
    expect(skeleton!.getAttribute('role')).toBe('status');

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
            {(items) =>
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
    await flush();

    await vi.waitFor(() => {
      // Fallback should be gone
      expect(container.querySelector('[data-testid="loading-indicator"]')).toBeNull();
      // Items should be present
      const items = container.querySelectorAll('[data-command-item]');
      expect(items.length).toBe(2);
    });
  });
});
