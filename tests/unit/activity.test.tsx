import { CommandActivity } from '@crimson_dev/command-react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

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

    const child = container.querySelector('[data-testid="child"]');
    expect(child).not.toBeNull();
    expect(child?.textContent).toBe('Hello');
  });

  it('should hide children when mode is hidden', async () => {
    await render(
      <CommandActivity mode="hidden">
        <div data-testid="child">Hidden</div>
      </CommandActivity>,
    );

    const child = container.querySelector('[data-testid="child"]');
    // Activity API is available in React 19.3.0-canary — hidden children
    // remain in DOM with display:none for state preservation
    if (child) {
      expect(getComputedStyle(child).display).toBe('none');
    } else {
      // Fallback: if Activity API unavailable, children are unmounted
      expect(child).toBeNull();
    }
  });

  it('should accept ReactNode children', async () => {
    await render(
      <CommandActivity mode="visible">
        <span>One</span>
        <span>Two</span>
      </CommandActivity>,
    );

    const spans = container.querySelectorAll('span');
    expect(spans.length).toBe(2);
  });
});
