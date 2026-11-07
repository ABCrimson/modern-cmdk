import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
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
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

describe('create-modern-cmdk templates', () => {
  it('CV-72: the react-dialog template opens on Mod+K with key K (Caps Lock)', async () => {
    await render(<DialogApp />);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await press('K');
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await press('K');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('CV-72: the react-dialog template opens on Mod+K with key k, and on Cmd+K', async () => {
    await render(<DialogApp />);
    await press('k');
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await press('k', { metaKey: true });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await press('k', { metaKey: true });
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('CV-25: the react-basic template renders its items', async () => {
    await render(<BasicApp />);
    const items = [...document.querySelectorAll('[role="option"]')].map((e) => e.textContent);
    expect(items).toEqual(['Copy', 'Paste', 'Home', 'Settings']);
  });
});
