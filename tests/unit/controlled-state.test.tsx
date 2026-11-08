// tests/unit/controlled-state.test.tsx
// Options of <Command> that the caller owns or controls: its search engine, input text, active item and root element.

import { cleanup, fireEvent, render } from '@testing-library/react';
import type { CommandMachine, ItemId } from 'modern-cmdk';
import { createSearchEngine, itemId } from 'modern-cmdk';
import { Command, CommandStableContext } from 'modern-cmdk/react';
import type { ReactNode } from 'react';
import { act, use, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(cleanup);

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

interface Held {
  machine?: CommandMachine;
}

/** Stores the root's machine on `held` so a test can read its state. */
function Probe({ held }: { readonly held: Held }): null {
  const stable = use(CommandStableContext);
  if (stable) held.machine = stable.machine;
  return null;
}

const settle = (): Promise<void> =>
  act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  });

/** A parent that applies each reported change upper-cased, so the prop differs from the keystroke. */
function Applying({
  held,
  reported,
}: {
  readonly held: Held;
  readonly reported: string[];
}): ReactNode {
  const [value, setValue] = useState('');
  return (
    <Command items={[{ id: itemId('a'), value: 'Apple' }]}>
      <Probe held={held} />
      <Command.Input
        value={value}
        onValueChange={(next: string): void => {
          reported.push(next);
          setValue(next.toUpperCase());
        }}
      />
      <Command.List />
    </Command>
  );
}

it('a controlled Input shows its value prop and reports changes through onValueChange', async () => {
  const held: Held = {};
  const reported: string[] = [];
  const view = render(<Applying held={held} reported={reported} />);
  const input = view.getByRole('combobox') as HTMLInputElement;

  fireEvent.change(input, { target: { value: 'ap' } });
  expect(reported).toEqual(['ap']);
  expect(input.value).toBe('AP');
  fireEvent.change(input, { target: { value: 'APp' } });
  expect(reported).toEqual(['ap', 'APp']);
  expect(input.value).toBe('APP');
  await settle();
  // The machine searched the prop, not the keystroke
  expect(held.machine?.getState().search).toBe('APP');
  expect(input.value).toBe('APP');
  view.unmount();

  // A parent that ignores onValueChange keeps the input at its value
  const ignoredHeld: Held = {};
  const ignored: string[] = [];
  const fixed = render(
    <Command>
      <Probe held={ignoredHeld} />
      <Command.Input
        value="fixed"
        onValueChange={(next: string): void => {
          ignored.push(next);
        }}
      />
    </Command>,
  );
  const fixedInput = fixed.getByRole('combobox') as HTMLInputElement;
  fireEvent.change(fixedInput, { target: { value: 'typed' } });
  await settle();
  expect(ignored).toEqual(['typed']);
  expect(fixedInput.value).toBe('fixed');
  expect(ignoredHeld.machine?.getState().search).toBe('fixed');
});

/** A parent that holds `activeId` in state and applies every candidate (`apply`), or ignores them. */
function Navigating({
  held,
  reported,
  apply,
}: {
  readonly held: Held;
  readonly reported: (string | null)[];
  readonly apply: boolean;
}): ReactNode {
  const [active, setActive] = useState<ItemId | null>(itemId('a'));
  return (
    <Command
      activeId={active}
      onActiveChange={(id: ItemId | null): void => {
        reported.push(id);
        if (apply) setActive(id);
      }}
    >
      <Probe held={held} />
      <Command.Input />
      <Command.List>
        {['a', 'b', 'c'].map((value) => (
          <Command.Item key={value} value={value} forceId={value}>
            {value}
          </Command.Item>
        ))}
      </Command.List>
    </Command>
  );
}

it('a controlled activeId holds while navigation reports the candidate', async () => {
  const held: Held = {};
  const reported: (string | null)[] = [];
  const view = render(<Navigating held={held} reported={reported} apply={false} />);
  const input = view.getByRole('combobox') as HTMLInputElement;
  await settle();
  expect(held.machine?.getState().activeId).toBe('a');
  expect(input.getAttribute('aria-activedescendant')).toBe('a');

  // A parent that ignores the candidate: the active item stays and the callback hears the candidate once
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  await settle();
  expect(reported).toEqual(['b']);
  expect(held.machine?.getState().activeId).toBe('a');
  expect(input.getAttribute('aria-activedescendant')).toBe('a');
  view.unmount();

  // A parent that applies the candidate moves the active item and hears no echo for its own prop
  const applied: (string | null)[] = [];
  const appliedHeld: Held = {};
  const moving = render(<Navigating held={appliedHeld} reported={applied} apply={true} />);
  const movingInput = moving.getByRole('combobox') as HTMLInputElement;
  await settle();
  fireEvent.keyDown(movingInput, { key: 'ArrowDown' });
  await settle();
  expect(applied).toEqual(['b']);
  expect(appliedHeld.machine?.getState().activeId).toBe('b');
  expect(movingInput.getAttribute('aria-activedescendant')).toBe('b');
  fireEvent.keyDown(movingInput, { key: 'ArrowDown' });
  await settle();
  expect(applied).toEqual(['b', 'c']);
  expect(appliedHeld.machine?.getState().activeId).toBe('c');
});
