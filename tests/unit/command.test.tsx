// tests/unit/command.test.tsx
// React adapter compound component tests — Vitest + happy-dom
// React (experimental channel build), TypeScript, ESNext

import { groupId, itemId } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';
import { act, type ReactNode, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

/**
 * Wait one frame inside act(). The machine's scheduler batches on requestAnimationFrame
 * (setImmediate-backed under happy-dom), not on a microtask. React's async act() yields to
 * setImmediate before it resolves, so the awaited act() before each call has already applied the
 * batch it queued; this frame is a guard that runs after any batch still queued.
 */
function flushFrame(): Promise<void> {
  return act(async () => {
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  });
}

/** Render helper — wraps in act() (whose exit runs the scheduler's frame) and waits one more frame */
async function render(ui: ReactNode): Promise<void> {
  await act(async () => {
    root.render(ui);
  });
  // The act() above ran the scheduler's frame on exit; one more frame as a guard
  await flushFrame();
}

/** Fire a native input event (works in happy-dom) */
async function typeInInput(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
      ?.set as (v: string) => void;
    nativeSet.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  // The act() above ran the scheduler's frame on exit; one more frame as a guard
  await flushFrame();
}

/** Dispatch a keyboard event on the command root (or document fallback) */
async function pressKey(key: string, opts?: KeyboardEventInit): Promise<void> {
  await act(async () => {
    const target = document.querySelector('[data-command-root]') ?? document;
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
  });
  await flushFrame();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Command — React Compound Components', () => {
  // ---- 1. Basic rendering ----

  describe('basic rendering', () => {
    it('should render Input with combobox ARIA role', async () => {
      await render(
        <Command>
          <Command.Input placeholder="Type here..." />
          <Command.List>
            <Command.Item value="alpha">Alpha</Command.Item>
          </Command.List>
        </Command>,
      );

      const input = container.querySelector('input') as HTMLInputElement;
      expect(input).not.toBeNull();
      // Vitest — soft assertions to report all missing ARIA attributes at once
      expect.soft(input.getAttribute('role')).toBe('combobox');
      expect.soft(input.getAttribute('placeholder')).toBe('Type here...');
      expect.soft(input.getAttribute('data-command-input')).toBe('');
      expect.soft(input.getAttribute('autocomplete')).toBe('off');
      expect.soft(input.getAttribute('spellcheck')).toBe('false');
    });

    it('should render Item with option role and data attributes', async () => {
      await render(
        <Command>
          <Command.Input />
          <Command.List>
            <Command.Item value="my-item" forceId="item-1">
              My Item
            </Command.Item>
          </Command.List>
        </Command>,
      );

      const item = container.querySelector('[data-command-item]');
      expect(item).not.toBeNull();
      // Vitest — soft assertions for all item attributes
      expect.soft(item?.getAttribute('role')).toBe('option');
      expect.soft(item?.getAttribute('data-value')).toBe('my-item');
      expect.soft(item?.textContent).toBe('My Item');
    });
  });

  // ---- 3. Data attributes ----

  describe('data attributes', () => {
    it('should set data-command-state on root', async () => {
      await render(
        <Command>
          <Command.Input />
          <Command.List>
            <Command.Item value="one">One</Command.Item>
          </Command.List>
        </Command>,
      );

      const rootEl = container.querySelector('[data-command-root]') as Element;
      // Default open is false
      expect(rootEl.getAttribute('data-command-state')).toBe('closed');
    });
  });

  // ---- 4. Item filtering ----

  describe('item filtering', () => {
    it('StrictMode: the machine keeps registering items and filtering', async () => {
      await render(
        <StrictMode>
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
          </Command>
        </StrictMode>,
      );

      await vi.waitFor(() => {
        expect(container.querySelectorAll('[data-command-item]').length).toBe(2);
      });

      await typeInInput(container.querySelector('input') as HTMLInputElement, 'app');
      await vi.waitFor(() => {
        const items = container.querySelectorAll('[data-command-item]');
        expect(items.length).toBe(1);
        expect(items[0]?.textContent).toBe('Apple');
      });
    });
  });

  // ---- 7. Disabled items ----

  describe('disabled items', () => {
    /** One enabled and one disabled item; both match the query "item". */
    function list(onEnabled: () => void = vi.fn(), onDisabled: () => void = vi.fn()): ReactNode {
      return (
        <>
          <Command.Input />
          <Command.List>
            <Command.Item value="item enabled" forceId="enabled" onSelect={onEnabled}>
              Enabled
            </Command.Item>
            <Command.Item
              value="item disabled"
              forceId="disabled-item"
              disabled
              onSelect={onDisabled}
            >
              Disabled
            </Command.Item>
          </Command.List>
        </>
      );
    }

    async function click(el: Element): Promise<void> {
      await act(async () => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await flushFrame();
    }

    it('should render disabled item with aria-disabled and data-disabled at rest', async () => {
      await render(<Command>{list()}</Command>);

      const disabled = container.querySelector('#disabled-item');
      expect(disabled).not.toBeNull();
      expect(disabled?.getAttribute('role')).toBe('option');
      expect(disabled?.getAttribute('aria-disabled')).toBe('true');
      expect(disabled?.hasAttribute('data-disabled')).toBe(true);
      // The enabled sibling carries neither
      const enabled = container.querySelector('#enabled');
      expect(enabled?.hasAttribute('aria-disabled')).toBe(false);
      expect(enabled?.hasAttribute('data-disabled')).toBe(false);
    });

    it('should keep rendering the disabled item, with aria-disabled, under a query', async () => {
      await render(<Command>{list()}</Command>);
      await typeInInput(container.querySelector('input') as HTMLInputElement, 'item');

      const disabled = container.querySelector('#disabled-item');
      expect(disabled).not.toBeNull();
      expect(disabled?.getAttribute('aria-disabled')).toBe('true');
      expect(disabled?.hasAttribute('data-disabled')).toBe(true);
    });

    it('should not render the disabled item at rest or under a query with disabledItems="hide"', async () => {
      await render(<Command disabledItems="hide">{list()}</Command>);
      expect(container.querySelector('#enabled')).not.toBeNull();
      expect(container.querySelector('#disabled-item')).toBeNull();

      await typeInInput(container.querySelector('input') as HTMLInputElement, 'item');
      expect(container.querySelector('#enabled')).not.toBeNull();
      expect(container.querySelector('#disabled-item')).toBeNull();
    });

    it('should render the disabled item with filter={false} under a query that matches nothing', async () => {
      await render(<Command filter={false}>{list()}</Command>);
      await typeInInput(container.querySelector('input') as HTMLInputElement, 'zzz');
      const disabled = container.querySelector('#disabled-item');
      expect(disabled?.getAttribute('aria-disabled')).toBe('true');
      expect(disabled?.hasAttribute('data-disabled')).toBe(true);
    });

    it('should not render the disabled item with filter={false} and disabledItems="hide"', async () => {
      await render(
        <Command filter={false} disabledItems="hide">
          {list()}
        </Command>,
      );
      expect(container.querySelector('#enabled')).not.toBeNull();
      expect(container.querySelector('#disabled-item')).toBeNull();
      await typeInInput(container.querySelector('input') as HTMLInputElement, 'zzz');
      expect(container.querySelector('#enabled')).not.toBeNull();
      expect(container.querySelector('#disabled-item')).toBeNull();
    });

    describe.each([
      ['show (default)', undefined, true],
      ['hide', 'hide', false],
    ] as const)(
      'a group that holds only disabled items, disabledItems %s',
      (_name, option, rendered) => {
        it('renders the group, its heading and its items only when the items are listed', async () => {
          await render(
            <Command {...(option !== undefined && { disabledItems: option })}>
              <Command.Input />
              <Command.List>
                <Command.Group heading="Locked" forceId="locked-group">
                  <Command.Item value="locked one" forceId="locked-one" disabled>
                    Locked one
                  </Command.Item>
                </Command.Group>
                <Command.Item value="free" forceId="free">
                  Free
                </Command.Item>
              </Command.List>
            </Command>,
          );
          // A group without a listed item stays in the tree (its children keep their identity) with display: none
          const shown = (selector: string): boolean => {
            const element = container.querySelector(selector);
            return (
              element !== null &&
              element.closest<HTMLElement>('[data-command-group]')?.style.display !== 'none'
            );
          };
          expect(shown('[data-command-group]')).toBe(rendered);
          expect(shown('[data-command-group-heading]')).toBe(rendered);
          expect(container.querySelector('#locked-one') !== null).toBe(rendered);
          expect(container.querySelector('#free')).not.toBeNull();
        });
      },
    );

    it('should not fire onSelect on a disabled item click', async () => {
      const onEnabled = vi.fn();
      const onDisabled = vi.fn();
      const onSelect = vi.fn();
      await render(<Command onSelect={onSelect}>{list(onEnabled, onDisabled)}</Command>);

      await click(container.querySelector('#disabled-item') as Element);
      expect(onDisabled).not.toHaveBeenCalled();
      expect(onSelect).not.toHaveBeenCalled();

      // Control: the same click on the enabled item selects it
      await click(container.querySelector('#enabled') as Element);
      expect(onEnabled).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it('should leave nothing active and select nothing on Enter when every item is disabled', async () => {
      const onDisabled = vi.fn();
      await render(
        <Command>
          <Command.Input />
          <Command.List>
            <Command.Item value="only" forceId="only" disabled onSelect={onDisabled}>
              Only
            </Command.Item>
          </Command.List>
        </Command>,
      );

      const only = container.querySelector('#only');
      expect(only?.getAttribute('aria-disabled')).toBe('true');
      expect(only?.hasAttribute('data-active')).toBe(false);
      await pressKey('Enter');
      await click(only as Element);
      expect(onDisabled).not.toHaveBeenCalled();
    });
  });

  // ---- 8. Group rendering ----

  describe('group rendering', () => {
    it('should render group items container with data-command-group-items', async () => {
      await render(
        <Command
          items={[{ id: itemId('x'), value: 'X', groupId: groupId('g1') }]}
          groups={[{ id: groupId('g1'), heading: 'Group One' }]}
        >
          <Command.Input />
          <Command.List>
            <Command.Group heading="Group One" forceId="g1">
              <div>Static content</div>
            </Command.Group>
          </Command.List>
        </Command>,
      );

      await vi.waitFor(() => {
        const groupItems = container.querySelector('[data-command-group-items]');
        expect(groupItems).not.toBeNull();
      });
    });
  });

  // ---- 10. Loading state ----

  describe('loading state', () => {
    it('should show Loading when loading override is true', async () => {
      await render(
        <Command>
          <Command.Input />
          <Command.List>
            <Command.Loading loading>Loading items...</Command.Loading>
          </Command.List>
        </Command>,
      );

      const loading = container.querySelector('[data-command-loading]');
      expect(loading).not.toBeNull();
      // Vitest — soft assertions for loading state attributes
      expect.soft(loading?.textContent).toBe('Loading items...');
      // React renders boolean aria-busy as "true" string
      expect.soft(loading?.hasAttribute('aria-busy')).toBe(true);
      expect.soft(loading?.getAttribute('role')).toBe('status');
    });

    it('should hide Loading when loading is false', async () => {
      await render(
        <Command>
          <Command.Input />
          <Command.List>
            <Command.Loading loading={false}>Should not show</Command.Loading>
          </Command.List>
        </Command>,
      );

      expect(container.querySelector('[data-command-loading]')).toBeNull();
    });
  });

  // ---- 12. Page navigation ----

  describe('page navigation', () => {
    it('should render only the active page', async () => {
      await render(
        <Command>
          <Command.Input />
          <Command.List>
            <Command.Page id="root">
              <Command.Item value="home" forceId="home">
                Home
              </Command.Item>
            </Command.Page>
            <Command.Page id="settings">
              <Command.Item value="profile" forceId="profile">
                Profile
              </Command.Item>
            </Command.Page>
          </Command.List>
        </Command>,
      );

      // Default page is "root"
      const rootPage = container.querySelector('[data-command-page-id="root"]');
      expect(rootPage).not.toBeNull();

      const settingsPage = container.querySelector('[data-command-page-id="settings"]');
      expect(settingsPage).toBeNull();
    });
  });

  // ---- 13. Highlight component ----

  describe('Highlight component', () => {
    it('should render mark elements for match ranges', async () => {
      await render(
        <Command.Highlight text="Application" ranges={[[0, 3]]} highlightClassName="hl" />,
      );

      const marks = container.querySelectorAll('mark');
      expect(marks.length).toBe(1);
      expect(marks[0]?.textContent).toBe('App');
      expect(marks[0]?.className).toBe('hl');
      expect(marks[0]?.getAttribute('data-command-highlight')).toBe('');
    });

    it('should render plain text when ranges is empty', async () => {
      await render(<Command.Highlight text="Hello World" ranges={[]} />);

      expect(container.querySelectorAll('mark').length).toBe(0);
      expect(container.textContent).toBe('Hello World');
    });

    it('should handle multiple disjoint ranges', async () => {
      await render(
        <Command.Highlight
          text="Hello World"
          ranges={[
            [0, 2],
            [6, 11],
          ]}
        />,
      );

      const marks = container.querySelectorAll('mark');
      expect(marks.length).toBe(2);
      expect(marks[0]?.textContent).toBe('He');
      expect(marks[1]?.textContent).toBe('World');
    });
  });

  // ---- 14. Shortcut component ----

  describe('Shortcut component', () => {
    it('should render kbd element with data-command-shortcut', async () => {
      await render(<Command.Shortcut>Ctrl+K</Command.Shortcut>);

      const kbd = container.querySelector('kbd');
      expect(kbd).not.toBeNull();
      expect(kbd?.getAttribute('data-command-shortcut')).toBe('');
      expect(kbd?.textContent).toBe('Ctrl+K');
    });

    it('CMD-9: Command.Shortcut renders Shift+K off macOS and ⇧K on macOS', async () => {
      await render(<Command.Shortcut shortcut="Shift+K" />);
      expect(container.querySelector('kbd')?.textContent).toBe('Shift+K');

      vi.stubGlobal('navigator', { platform: 'MacIntel' });
      try {
        await render(<Command.Shortcut key="mac" shortcut="Shift+K" />);
        expect(container.querySelector('kbd')?.textContent).toBe('⇧K');
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  // ---- 15. Badge component ----

  describe('Badge component', () => {
    it('should render badge span with data-command-badge', async () => {
      await render(<Command.Badge className="tag">New</Command.Badge>);

      const badge = container.querySelector('[data-command-badge]');
      expect(badge).not.toBeNull();
      expect(badge?.tagName).toBe('SPAN');
      expect(badge?.textContent).toBe('New');
      expect(badge?.className).toBe('tag');
    });
  });
});

describe('Command — item updates keep their position (ARCH-20)', () => {
  function three(b: { value?: string; disabled?: boolean; forceId?: string } = {}): ReactNode {
    return (
      <Command>
        <Command.Input />
        <Command.List>
          <Command.Item value="a" forceId="a">
            A
          </Command.Item>
          <Command.Item
            value={b.value ?? 'b'}
            forceId={b.forceId ?? 'b'}
            disabled={b.disabled ?? false}
          >
            B
          </Command.Item>
          <Command.Item value="c" forceId="c">
            C
          </Command.Item>
        </Command.List>
      </Command>
    );
  }
  const isActive = (id: string): boolean | undefined =>
    container.querySelector(`#${id}`)?.hasAttribute('data-active');

  it('toggling disabled on the middle item keeps it between its neighbours in navigation', async () => {
    await render(three());
    await render(three({ disabled: true }));
    await render(three({ disabled: false }));
    await vi.waitFor(() => {
      expect(isActive('a')).toBe(true);
    });
    await pressKey('ArrowDown');
    await vi.waitFor(() => {
      expect(isActive('b')).toBe(true);
    });
    await pressKey('ArrowDown');
    await vi.waitFor(() => {
      expect(isActive('c')).toBe(true);
    });
  });

  it('ARCH-20: an item that a rerender disables is skipped by ArrowDown (the machine applies the UPDATE_ITEM)', async () => {
    await render(three());
    await render(three({ disabled: true }));
    await vi.waitFor(() => {
      expect(container.querySelector('#b')?.getAttribute('aria-disabled')).toBe('true');
    });
    await pressKey('ArrowDown');
    await vi.waitFor(() => {
      expect(isActive('c')).toBe(true);
    });
    expect(isActive('b')).toBe(false);
  });

  it('ARCH-20, CE-49: changing the shortcut prop re-binds it: the old key stops firing, the new one fires', async () => {
    const onSelect = vi.fn();
    const withShortcut = (shortcut: string): ReactNode => (
      <Command>
        <Command.Input />
        <Command.List>
          <Command.Item value="a" forceId="a" shortcut={shortcut} onSelect={onSelect}>
            A
          </Command.Item>
        </Command.List>
      </Command>
    );
    await render(withShortcut('Ctrl+K'));
    await render(withShortcut('Ctrl+J'));
    await pressKey('k', { ctrlKey: true });
    expect(onSelect).not.toHaveBeenCalled();
    await pressKey('j', { ctrlKey: true });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('changing the value of the middle item keeps it between its neighbours in navigation', async () => {
    await render(three());
    await render(three({ value: 'b2' }));
    await vi.waitFor(() => {
      expect(container.querySelector('#b')?.getAttribute('data-value')).toBe('b2');
    });
    await pressKey('ArrowDown');
    await vi.waitFor(() => {
      expect(isActive('b')).toBe(true);
    });
  });

  it('an id change unregisters the old id and registers the new one', async () => {
    await render(three());
    await render(three({ forceId: 'b2' }));
    await vi.waitFor(() => {
      expect(container.querySelector('#b')).toBeNull();
      expect(container.querySelectorAll('[data-command-item]').length).toBe(3);
    });
    // The new id is a new registration: it is appended, so a -> c -> b2
    await pressKey('ArrowDown');
    await pressKey('ArrowDown');
    await vi.waitFor(() => {
      expect(isActive('b2')).toBe(true);
    });
  });

  it('unmounting an item unregisters it', async () => {
    await render(three());
    await render(
      <Command>
        <Command.Input />
        <Command.List>
          <Command.Item value="a" forceId="a">
            A
          </Command.Item>
          <Command.Item value="c" forceId="c">
            C
          </Command.Item>
        </Command.List>
      </Command>,
    );
    await vi.waitFor(() => {
      expect(container.querySelectorAll('[data-command-item]').length).toBe(2);
    });
    await pressKey('ArrowDown');
    await vi.waitFor(() => {
      expect(isActive('c')).toBe(true);
    });
  });
});

describe('Command.Group heading counts only the group own items (CE-50)', () => {
  function palette(groupProps: { forceId?: string }): ReactNode {
    return (
      <Command>
        <Command.Input />
        <Command.List>
          <Command.Item value="loose apple" forceId="loose">
            Loose apple
          </Command.Item>
          <Command.Group heading="Fruit" {...groupProps}>
            <Command.Item value="banana" forceId="banana">
              Banana
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    );
  }
  // The heading of a group that is shown: a group without a match stays in the tree with display: none
  const heading = (): Element | null => {
    const element = container.querySelector('[data-command-group-heading]');
    return element?.closest<HTMLElement>('[data-command-group]')?.style.display === 'none'
      ? null
      : element;
  };
  const search = async (query: string): Promise<void> => {
    await typeInInput(container.querySelector('input') as HTMLInputElement, query);
  };

  it('CE-50: a group with forceId="__ungrouped" renders no heading while only ungrouped items outside it match', async () => {
    await render(palette({ forceId: '__ungrouped' }));
    await search('apple');
    await vi.waitFor(() => {
      expect(container.querySelector('#loose')).not.toBeNull();
      expect(container.querySelector('#banana')).toBeNull();
    });
    expect(heading()).toBeNull();
  });

  it('CE-50: a group with forceId="__ungrouped" renders its heading when one of its own items matches', async () => {
    await render(palette({ forceId: '__ungrouped' }));
    await search('banana');
    await vi.waitFor(() => {
      expect(container.querySelector('#banana')).not.toBeNull();
    });
    expect(heading()?.textContent).toBe('Fruit');
  });

  it('CE-50: an ordinary group still shows its heading only while its own items match', async () => {
    await render(palette({ forceId: 'fruit' }));
    await search('apple');
    await vi.waitFor(() => {
      expect(container.querySelector('#banana')).toBeNull();
    });
    expect(heading()).toBeNull();
    await search('banana');
    await vi.waitFor(() => {
      expect(container.querySelector('#banana')).not.toBeNull();
    });
    expect(heading()?.textContent).toBe('Fruit');
  });
});
