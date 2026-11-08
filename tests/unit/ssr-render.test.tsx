// tests/unit/ssr-render.test.tsx
// Shortcut formatting on the server and under a macOS client — Vitest + happy-dom

import { formatShortcut, parseShortcut } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';
import { act, type ReactNode } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
