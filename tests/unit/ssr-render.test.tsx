// tests/unit/ssr-render.test.tsx
// Shortcut formatting on the server and under a macOS client — Vitest + happy-dom

import { formatShortcut, parseShortcut } from 'modern-cmdk';
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
