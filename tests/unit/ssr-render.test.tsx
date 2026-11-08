// tests/unit/ssr-render.test.tsx
// Shortcut formatting on the server and under a macOS client — Vitest + happy-dom

import { formatShortcut, itemId, parseShortcut } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';
import { act, type ReactNode } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('shortcut platform', () => {
  it('CE-13: formatShortcut resolves Mod for the platform it is given', () => {
    // An explicit platform decides, whatever the host reports
    vi.stubGlobal('navigator', { platform: 'Win32' });
    expect(formatShortcut(parseShortcut('Mod+K', 'mac'), 'mac')).toBe('⌘K');
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
    expect(formatShortcut(parseShortcut('Mod+K', 'other'), 'other')).toBe('Ctrl+K');

    // Without one, the platform follows navigator at call time
    vi.stubGlobal('navigator', { platform: 'Win32' });
    expect(formatShortcut(parseShortcut('Mod+K'))).toBe('Ctrl+K');
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
    expect(formatShortcut(parseShortcut('Mod+K'))).toBe('⌘K');
  });
});

describe('Command.Shortcut hydration', () => {
  it('RA-19: Command.Shortcut hydrates under a macOS client with no recoverable error', async () => {
    const tree: ReactNode = (
      <Command label="Test">
        {/* Outside any Item: items register in layout effects and are not in the server HTML */}
        <Command.Shortcut shortcut="Mod+K" />
      </Command>
    );

    // The server renders with a non-macOS platform
    vi.stubGlobal('navigator', { platform: 'Win32' });
    const html = renderToString(tree);
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    expect(container.querySelector('kbd')?.textContent).toBe('Ctrl+K');

    // The client is macOS
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
    const onRecoverableError = vi.fn();
    let root: Root | undefined;
    await act(async () => {
      root = hydrateRoot(container, tree, { onRecoverableError });
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.querySelector('kbd')?.textContent).toBe('\u2318K');

    await act(async () => {
      root?.unmount();
    });
    container.remove();
  });
});

describe('SSR registration', () => {
  const mounted: Array<{ readonly root: Root; readonly container: HTMLElement }> = [];

  afterEach(async () => {
    for (const { root, container } of mounted.splice(0)) {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  /** Puts server HTML in a container and hydrates `tree` over it, counting the recoverable errors. */
  async function hydrate(
    html: string,
    tree: ReactNode,
  ): Promise<{ readonly container: HTMLElement; readonly onRecoverableError: Mock }> {
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const onRecoverableError = vi.fn();
    let root: Root | undefined;
    await act(async () => {
      root = hydrateRoot(container, tree, { onRecoverableError });
    });
    if (root) mounted.push({ root, container });
    return { container, onRecoverableError };
  }

  /** True when `node` or an ancestor up to `stop` hides itself with `display: none`. */
  const hidden = (node: Element, stop: Element): boolean => {
    for (let at: Element | null = node; at && at !== stop; at = at.parentElement) {
      if ((at as HTMLElement).style.display === 'none') return true;
    }
    return false;
  };

  const palette: ReactNode = (
    <Command label="Test">
      <Command.List>
        <Command.Group heading="Fruit">
          <Command.Item value="Apple">Apple</Command.Item>
          <Command.Item value="Banana">Banana</Command.Item>
        </Command.Group>
        <Command.Item value="Cherry">Cherry</Command.Item>
        <Command.Empty>Nothing found</Command.Empty>
      </Command.List>
    </Command>
  );

  it('RP-31: server HTML lists the items and no Empty text', async () => {
    const html = renderToString(palette);
    const probe = document.createElement('div');
    probe.innerHTML = html;
    for (const text of ['Apple', 'Banana', 'Cherry']) {
      const item = [...probe.querySelectorAll('[data-command-item]')].find(
        (el) => el.textContent === text,
      );
      expect(item, `${text} is in the server HTML`).toBeDefined();
      expect(hidden(item as Element, probe), `${text} is not display:none`).toBe(false);
    }
    expect(html).not.toContain('Nothing found');
    expect(html).not.toContain('0 results available');
    // The live region exists before its text changes
    expect(probe.querySelector('[data-command-aria-live]')?.textContent).toBe('');

    const { container, onRecoverableError } = await hydrate(html, palette);
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(
      [...container.querySelectorAll('[data-command-item]')].map((el) => el.textContent),
    ).toEqual(['Apple', 'Banana', 'Cherry']);
    expect(container.querySelector('[data-command-empty]')).toBeNull();
    expect(container.querySelector('[data-command-aria-live]')?.textContent).toBe(
      '3 results available.',
    );
  });

  it('RP-31: the items option path lists pre-registered items in the server HTML', async () => {
    const tree: ReactNode = (
      <Command
        label="Test"
        items={[
          { id: itemId('a'), value: 'Alpha' },
          { id: itemId('b'), value: 'Beta' },
        ]}
      >
        <Command.List>
          <Command.Item id="a" value="Alpha">
            Alpha
          </Command.Item>
          <Command.Item id="b" value="Beta">
            Beta
          </Command.Item>
          <Command.Empty>Nothing found</Command.Empty>
        </Command.List>
      </Command>
    );
    const html = renderToString(tree);
    expect(html).toContain('Alpha');
    expect(html).toContain('Beta');
    expect(html).not.toContain('Nothing found');
    const { container, onRecoverableError } = await hydrate(html, tree);
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.querySelectorAll('[data-command-item]')).toHaveLength(2);
  });

  it('RP-31: a non-empty search hides an item that is not registered yet', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });
    const ui = (late: boolean): ReactNode => (
      <Command label="Test">
        <Command.Input placeholder="Search" />
        <Command.List>
          <Command.Item value="Apple">Apple</Command.Item>
          {late ? <Command.Item value="Applesauce">Late</Command.Item> : null}
        </Command.List>
      </Command>
    );
    await act(async () => {
      root.render(ui(false));
    });
    const input = container.querySelector('input') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'zz');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(container.querySelector('[data-command-item]')).toBeNull();

    // The text of the late item never reaches the DOM, not even in its first render
    const seen: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) seen.push(node.textContent ?? '');
      }
    });
    observer.observe(container, { childList: true, subtree: true });
    await act(async () => {
      root.render(ui(true));
    });
    observer.disconnect();
    expect(seen.join('')).not.toContain('Late');
  });
});
