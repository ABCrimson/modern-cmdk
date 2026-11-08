// tests/unit/controlled-state.test.tsx
// Options of <Command> that the caller owns or controls: the search engine it passes.

import { createSearchEngine, itemId } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

it('searchEngine wins over the deprecated search', async () => {
  using preferred = createSearchEngine();
  using ignored = createSearchEngine();
  const preferredSearch = vi.spyOn(preferred, 'search');
  const ignoredSearch = vi.spyOn(ignored, 'search');
  const items = [
    { id: itemId('a'), value: 'Apple' },
    { id: itemId('b'), value: 'Banana' },
  ];

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Command searchEngine={preferred} search={ignored} items={items}>
        <Command.Input />
        <Command.List />
      </Command>,
    );
  });

  const input = container.querySelector('input');
  if (!input) throw new Error('no input rendered');
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setValue?.call(input, 'app');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  });

  expect(preferredSearch).toHaveBeenCalled();
  expect(ignoredSearch).not.toHaveBeenCalled();

  await act(async () => {
    root.unmount();
  });
  container.remove();
});
