// Pins CommandActivity (packages/modern-cmdk/src/react/activity.tsx).
// ACT-1: a visible child's text is read with a hard polling assertion, so a late arrival is retried
//        and a missing or wrong text fails the test.
// ACT-2: under React's Activity a hidden child stays in the DOM with display:none and keeps its
//        state across hidden and visible; without Activity the documented fallback unmounts it and
//        the state resets.

import { CommandActivity } from 'modern-cmdk/react';
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Whether the installed React exports Activity (stable since 19.2; the >=19.0 peer floor predates it). */
const activityAvailable: boolean = 'Activity' in React;
const itWithActivityBranch = it.skipIf(!activityAvailable);
const itWithFallbackBranch = it.skipIf(activityAvailable);

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

async function render(ui: React.ReactNode): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await rerender(ui);
}

async function rerender(ui: React.ReactNode): Promise<void> {
  await act(async () => {
    root.render(ui);
  });
}

afterEach(async () => {
  if (root) {
    await act(async () => {
      root.unmount();
    });
  }
  container?.remove();
});

/** A child with local state, so a test can tell whether its subtree was preserved or remounted. */
function Counter(): React.ReactNode {
  const [count, setCount] = React.useState(0);
  return (
    <button type="button" data-testid="counter" onClick={() => setCount((c) => c + 1)}>
      {count}
    </button>
  );
}

/** Writes the text after the commit through a DOM mutation, which is not a React state update. */
function writeTextLater(el: HTMLElement | null): void {
  if (el) setTimeout(() => (el.textContent = 'Hello'), 30);
}

const counter = (): HTMLElement | null => container.querySelector('[data-testid="counter"]');

async function increment(): Promise<void> {
  await act(async () => {
    counter()?.click();
  });
}

describe('CommandActivity', () => {
  it("ACT-1: the visible child's text is polled with a hard assertion", async () => {
    // The text is written by a DOM mutation after the render commits (not a React state update),
    // so it is absent on the first poll and the assertion has to retry.
    await render(
      <CommandActivity mode="visible">
        <div data-testid="child" ref={writeTextLater} />
      </CommandActivity>,
    );

    await expect
      .poll(() => container.querySelector('[data-testid="child"]')?.textContent)
      .toBe('Hello');
  });

  itWithActivityBranch(
    'ACT-2: a hidden child stays in the DOM with display none under Activity',
    async () => {
      await render(
        <CommandActivity mode="hidden">
          <div data-testid="child">Hidden</div>
        </CommandActivity>,
      );

      const child = container.querySelector('[data-testid="child"]');
      expect(child).not.toBeNull();
      expect(getComputedStyle(child as Element).display).toBe('none');
    },
  );

  itWithFallbackBranch('ACT-2: a hidden child is unmounted by the fallback', async () => {
    await render(
      <CommandActivity mode="hidden">
        <div data-testid="child">Hidden</div>
      </CommandActivity>,
    );

    expect(container.querySelector('[data-testid="child"]')).toBeNull();
  });

  itWithActivityBranch(
    'ACT-2: child state survives visible, hidden, visible under Activity',
    async () => {
      const ui = (mode: 'visible' | 'hidden'): React.ReactNode => (
        <CommandActivity mode={mode}>
          <Counter />
        </CommandActivity>
      );
      await render(ui('visible'));
      await increment();
      await increment();
      expect(counter()?.textContent).toBe('2');

      await rerender(ui('hidden'));
      await rerender(ui('visible'));
      expect(counter()?.textContent).toBe('2');
    },
  );

  itWithFallbackBranch(
    'ACT-2: child state resets after hidden, visible in the fallback',
    async () => {
      const ui = (mode: 'visible' | 'hidden'): React.ReactNode => (
        <CommandActivity mode={mode}>
          <Counter />
        </CommandActivity>
      );
      await render(ui('visible'));
      await increment();
      expect(counter()?.textContent).toBe('1');

      await rerender(ui('hidden'));
      await rerender(ui('visible'));
      expect(counter()?.textContent).toBe('0');
    },
  );

  it('should accept ReactNode children', async () => {
    await render(
      <CommandActivity mode="visible">
        <span>One</span>
        <span>Two</span>
      </CommandActivity>,
    );

    await vi.waitFor(() => {
      const spans = container.querySelectorAll('span');
      expect(spans.length).toBe(2);
    });
  });
});
