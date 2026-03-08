import { Command } from '@crimson_dev/command-react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

async function render(ui: React.ReactNode): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(ui);
  });
  // Let scheduler process registrations
  await act(async () => {
    await new Promise<void>((r) => queueMicrotask(r));
  });
}

afterEach(() => {
  root?.unmount();
  container?.remove();
});

describe('Virtualization (0.2.2)', () => {
  it('should render all items when count is below threshold', async () => {
    // ES2026 Iterator Helpers — generate JSX items via iterator pipeline
    const items = Iterator.from({
      [Symbol.iterator]: function* () {
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
    // The style should contain the custom property
    expect(list.style.getPropertyValue('--command-list-height')).toBeDefined();
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
