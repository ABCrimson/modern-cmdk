import { CommandActivity } from 'modern-cmdk/react';
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Whether the installed React ships the (experimental) Activity component. */
const activityAvailable: boolean = 'Activity' in React;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

async function render(ui: React.ReactNode): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(ui);
  });
}

afterEach(() => {
  root?.unmount();
  container?.remove();
});

describe('CommandActivity (0.2.5)', () => {
  it('should render children when mode is visible', async () => {
    await render(
      <CommandActivity mode="visible">
        <div data-testid="child">Hello</div>
      </CommandActivity>,
    );

    // Vitest — vi.waitFor() for async DOM assertions
    await vi.waitFor(() => {
      const child = container.querySelector('[data-testid="child"]');
      // Vitest — soft assertions for multi-property checks
      expect.soft(child).not.toBeNull();
      expect.soft(child?.textContent).toBe('Hello');
    });
  });

  it('should hide children when mode is hidden', async () => {
    await render(
      <CommandActivity mode="hidden">
        <div data-testid="child">Hidden</div>
      </CommandActivity>,
    );

    await vi.waitFor(() => {
      const child = container.querySelector('[data-testid="child"]');
      // With React's Activity API (experimental builds) hidden children remain in
      // the DOM with display:none for state preservation; without it
      // CommandActivity falls back to unmounting them. Both outcomes are asserted
      // unconditionally against the display the installed React should produce.
      const display = child === null ? null : getComputedStyle(child).display;
      expect(display).toBe(activityAvailable ? 'none' : null);
    });
  });

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
