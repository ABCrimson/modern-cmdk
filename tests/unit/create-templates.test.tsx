import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App as BasicApp } from '../../packages/create-modern-cmdk/templates/react-basic/src/App.js';
import { App as DialogApp } from '../../packages/create-modern-cmdk/templates/react-dialog/src/App.js';

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

async function press(key: string, init: KeyboardEventInit = { ctrlKey: true }): Promise<void> {
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
  });
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

describe('create-modern-cmdk templates', () => {
  it('CV-72: the react-dialog template opens on Mod+K with key K (Caps Lock)', async () => {
    vi.stubGlobal('navigator', { platform: 'Win32' });
    await render(<DialogApp />);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await press('K');
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await press('K');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('CV-72: the react-dialog template opens on Mod+K with key k', async () => {
    vi.stubGlobal('navigator', { platform: 'Win32' });
    await render(<DialogApp />);
    await press('k');
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await press('k');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('A2-1: Mod+K is Ctrl+K off Apple platforms: Cmd+K does nothing there', async () => {
    vi.stubGlobal('navigator', { platform: 'Win32' });
    await render(<DialogApp />);
    await press('k', { metaKey: true });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await press('k', { ctrlKey: true, shiftKey: true });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await press('k');
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('A2-1: Mod+K is Cmd+K on Apple platforms: Ctrl+K does nothing there', async () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
    await render(<DialogApp />);
    await press('k');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await press('k', { metaKey: true });
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await press('K', { metaKey: true });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('A2-1: the hint under the heading names the key of the platform', async () => {
    vi.stubGlobal('navigator', { platform: 'Win32' });
    await render(<DialogApp />);
    expect(container.querySelector('p kbd')?.textContent).toBe('Ctrl+K');
  });

  it('A2-7: choosing an item shows what was chosen and closes the dialog', async () => {
    vi.stubGlobal('navigator', { platform: 'Win32' });
    await render(<DialogApp />);
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Chosen: nothing yet');
    await press('k');
    const settings = [...document.querySelectorAll('[role="option"]')].find(
      (e) => e.textContent === 'Settings',
    );
    expect(settings).toBeDefined();
    await act(async () => {
      settings?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Chosen: Settings');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('CV-25: the react-basic template renders its items', async () => {
    await render(<BasicApp />);
    const items = [...document.querySelectorAll('[role="option"]')].map((e) => e.textContent);
    expect(items).toEqual(['Copy', 'Paste', 'Home', 'Settings']);
  });
});
