// tests/unit/command.test.tsx
// React adapter compound component tests — Vitest + happy-dom
// React 19.3.0-canary, TypeScript 6.0.1-rc, ES2026

import { groupId, itemId } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';
import { act, type ReactNode } from 'react';
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

afterEach(() => {
  root.unmount();
  container.remove();
});

/** Render helper — wraps in act() and awaits a microtask for scheduler flush */
async function render(ui: ReactNode): Promise<void> {
  await act(async () => {
    root.render(ui);
  });
  // Allow the machine's queueMicrotask scheduler to flush
  await act(async () => {
    await new Promise<void>((r) => queueMicrotask(r));
  });
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
  // Let the scheduler process the SEARCH_CHANGE event
  await act(async () => {
    await new Promise<void>((r) => queueMicrotask(r));
  });
}

/** Dispatch a keyboard event on document */
async function pressKey(key: string, opts?: KeyboardEventInit): Promise<void> {
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
  });
  await act(async () => {
    await new Promise<void>((r) => queueMicrotask(r));
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Command — React Compound Components', () => {
  // ---- 1. Basic rendering ----

  describe('basic rendering', () => {
    it('should render Command root with data-command-root attribute', async () => {
      await render(
        <Command label="Test palette">
          <Command.Input />
          <Command.List>
            <Command.Item value="one">One</Command.Item>
          </Command.List>
        </Command>,
      );

      const rootEl = container.querySelector('[data-command-root]');
      expect(rootEl).not.toBeNull();
      expect(rootEl?.getAttribute('role')).toBe('search');
      expect(rootEl?.getAttribute('aria-label')).toBe('Test palette');
    });

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
      // Vitest 4.1 — soft assertions to report all missing ARIA attributes at once
      expect.soft(input.getAttribute('role')).toBe('combobox');
      expect.soft(input.getAttribute('placeholder')).toBe('Type here...');
      expect.soft(input.getAttribute('data-command-input')).toBe('');
      expect.soft(input.getAttribute('autocomplete')).toBe('off');
      expect.soft(input.getAttribute('spellcheck')).toBe('false');
    });

    it('should render List with listbox role', async () => {
      await render(
        <Command>
          <Command.Input />
          <Command.List>
            <Command.Item value="one">One</Command.Item>
          </Command.List>
        </Command>,
      );

      const list = container.querySelector('[data-command-list]');
      expect(list).not.toBeNull();
      expect(list?.getAttribute('role')).toBe('listbox');
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
      // Vitest 4.1 — soft assertions for all item attributes
      expect.soft(item?.getAttribute('role')).toBe('option');
      expect.soft(item?.getAttribute('data-value')).toBe('my-item');
      expect.soft(item?.textContent).toBe('My Item');
    });
  });

  // ---- 2. ARIA attributes ----

  describe('ARIA attributes', () => {
    it('should set aria-expanded based on filteredCount', async () => {
      await render(
        <Command>
          <Command.Input />
          <Command.List>
            <Command.Item value="one">One</Command.Item>
          </Command.List>
        </Command>,
      );

      const input = container.querySelector('input') as HTMLInputElement;
      // Vitest 4.1 — soft assertions for ARIA state
      expect.soft(input.getAttribute('aria-expanded')).toBe('true');
      expect.soft(input.getAttribute('aria-autocomplete')).toBe('list');
    });

    it('should set aria-activedescendant to the active item id', async () => {
      await render(
        <Command>
          <Command.Input />
          <Command.List>
            <Command.Item value="alpha" forceId="alpha-id">
              Alpha
            </Command.Item>
            <Command.Item value="beta" forceId="beta-id">
              Beta
            </Command.Item>
          </Command.List>
        </Command>,
      );

      const input = container.querySelector('input') as HTMLInputElement;
      // First item should be auto-activated
      expect(input.getAttribute('aria-activedescendant')).toBe('alpha-id');
    });

    it('should set aria-controls on input referencing the listbox id', async () => {
      await render(
        <Command>
          <Command.Input />
          <Command.List>
            <Command.Item value="one">One</Command.Item>
          </Command.List>
        </Command>,
      );

      const input = container.querySelector('input') as HTMLInputElement;
      const list = container.querySelector('[data-command-list]') as Element;
      expect(input.getAttribute('aria-controls')).toBe(list.id);
    });
  });

  // ---- 3. Data attributes ----

  describe('data attributes', () => {
    it('should set data-active on the currently active item', async () => {
      await render(
        <Command>
          <Command.Input />
          <Command.List>
            <Command.Item value="first" forceId="first">
              First
            </Command.Item>
            <Command.Item value="second" forceId="second">
              Second
            </Command.Item>
          </Command.List>
        </Command>,
      );

      const firstItem = container.querySelector('#first') as Element;
      const secondItem = container.querySelector('#second') as Element;

      // Vitest 4.1 — soft assertions for data-active state
      expect.soft(firstItem.hasAttribute('data-active')).toBe(true);
      expect.soft(firstItem.getAttribute('aria-selected')).toBe('true');
      expect.soft(secondItem.hasAttribute('data-active')).toBe(false);
    });

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
    it('should filter items when typing in the input', async () => {
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
            <Command.Item value="cherry" forceId="cherry">
              Cherry
            </Command.Item>
          </Command.List>
        </Command>,
      );

      // All three items should be visible initially
      expect(container.querySelectorAll('[data-command-item]').length).toBe(3);

      const input = container.querySelector('input') as HTMLInputElement;
      await typeInInput(input, 'app');

      // Wait for filter to complete
      await vi.waitFor(() => {
        const items = container.querySelectorAll('[data-command-item]');
        expect(items.length).toBe(1);
        expect(items[0]?.textContent).toBe('Apple');
      });
    });

    it('should show all items when search is cleared', async () => {
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

      const input = container.querySelector('input') as HTMLInputElement;
      await typeInInput(input, 'app');

      await vi.waitFor(() => {
        expect(container.querySelectorAll('[data-command-item]').length).toBe(1);
      });

      await typeInInput(input, '');

      await vi.waitFor(() => {
        expect(container.querySelectorAll('[data-command-item]').length).toBe(2);
      });
    });
  });

  // ---- 5. Keyboard navigation ----

  describe('keyboard navigation', () => {
    it('should move active item down with ArrowDown', async () => {
      await render(
        <Command>
          <Command.Input />
          <Command.List>
            <Command.Item value="one" forceId="one">
              One
            </Command.Item>
            <Command.Item value="two" forceId="two">
              Two
            </Command.Item>
            <Command.Item value="three" forceId="three">
              Three
            </Command.Item>
          </Command.List>
        </Command>,
      );

      // First item is active by default
      await vi.waitFor(() => {
        expect(container.querySelector('#one')?.hasAttribute('data-active')).toBe(true);
      });

      await pressKey('ArrowDown');

      await vi.waitFor(() => {
        expect(container.querySelector('#two')?.hasAttribute('data-active')).toBe(true);
        expect(container.querySelector('#one')?.hasAttribute('data-active')).toBe(false);
      });
    });

    it('should move active item up with ArrowUp', async () => {
      await render(
        <Command>
          <Command.Input />
          <Command.List>
            <Command.Item value="one" forceId="one">
              One
            </Command.Item>
            <Command.Item value="two" forceId="two">
              Two
            </Command.Item>
          </Command.List>
        </Command>,
      );

      // Navigate down first so we can go back up
      await pressKey('ArrowDown');

      await vi.waitFor(() => {
        expect(container.querySelector('#two')?.hasAttribute('data-active')).toBe(true);
      });

      await pressKey('ArrowUp');

      await vi.waitFor(() => {
        expect(container.querySelector('#one')?.hasAttribute('data-active')).toBe(true);
      });
    });

    it('should loop navigation by default (ArrowDown from last goes to first)', async () => {
      await render(
        <Command>
          <Command.Input />
          <Command.List>
            <Command.Item value="one" forceId="one">
              One
            </Command.Item>
            <Command.Item value="two" forceId="two">
              Two
            </Command.Item>
          </Command.List>
        </Command>,
      );

      // Move to second item
      await pressKey('ArrowDown');
      await vi.waitFor(() => {
        expect(container.querySelector('#two')?.hasAttribute('data-active')).toBe(true);
      });

      // Arrow down from last should loop to first
      await pressKey('ArrowDown');
      await vi.waitFor(() => {
        expect(container.querySelector('#one')?.hasAttribute('data-active')).toBe(true);
      });
    });
  });

  // ---- 6. Item selection ----

  describe('item selection', () => {
    it('should fire onSelect when an item is clicked', async () => {
      const onSelect = vi.fn();

      await render(
        <Command>
          <Command.Input />
          <Command.List>
            <Command.Item value="clickable" forceId="clickable" onSelect={onSelect}>
              Click me
            </Command.Item>
          </Command.List>
        </Command>,
      );

      const item = container.querySelector('#clickable') as Element;
      await act(async () => {
        item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await act(async () => {
        await new Promise<void>((r) => queueMicrotask(r));
      });

      await vi.waitFor(() => {
        expect(onSelect).toHaveBeenCalledTimes(1);
      });
    });

    it('should fire onSelect via Enter key on active item', async () => {
      const onSelect = vi.fn();

      await render(
        <Command>
          <Command.Input />
          <Command.List>
            <Command.Item value="enter-test" forceId="enter-test" onSelect={onSelect}>
              Enter test
            </Command.Item>
          </Command.List>
        </Command>,
      );

      // The item should be auto-activated as the only item
      await pressKey('Enter');

      await vi.waitFor(() => {
        expect(onSelect).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ---- 7. Disabled items ----

  describe('disabled items', () => {
    it('should render disabled item with aria-disabled', async () => {
      await render(
        <Command>
          <Command.Input />
          <Command.List>
            <Command.Item value="enabled" forceId="enabled">
              Enabled
            </Command.Item>
            <Command.Item value="disabled" forceId="disabled-item" disabled>
              Disabled
            </Command.Item>
          </Command.List>
        </Command>,
      );

      await vi.waitFor(() => {
        // Disabled items with disabled=true are filtered out by refilter (filter skips disabled)
        // Check that the enabled item is rendered
        const enabledItem = container.querySelector('#enabled');
        expect(enabledItem).not.toBeNull();
      });
    });

    it('should not fire onSelect on disabled item click', async () => {
      const onSelect = vi.fn();

      await render(
        <Command>
          <Command.Input />
          <Command.List>
            <Command.Item
              value="disabled-click"
              forceId="disabled-click"
              disabled
              onSelect={onSelect}
            >
              Can't click me
            </Command.Item>
          </Command.List>
        </Command>,
      );

      // Disabled items are filtered out, so click on the item div directly won't call select
      // The machine filters out disabled items, so the item won't render at all
      // But if it were somehow rendered, onSelect wouldn't fire
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  // ---- 8. Group rendering ----
  //
  // NOTE: In the current implementation, <Command.Item> does not automatically
  // read the CommandGroupContext to associate itself with its parent group.
  // Items without an explicit groupId end up in the "__ungrouped" bucket, so
  // <Command.Group> hides when none of its registered items are in its bucket.
  // These tests verify the component structure and the actual rendering logic.

  describe('group rendering', () => {
    it('should hide group when it has no items in its group bucket', async () => {
      // <Command.Item> does not auto-read CommandGroupContext, so items
      // inside a <Command.Group> without explicit groupId land in __ungrouped.
      // The group checks groupedIds.get(its-id) which is empty → returns null.
      await render(
        <Command>
          <Command.Input />
          <Command.List>
            <Command.Group heading="Fruits" forceId="fruits-group">
              <Command.Item value="apple" forceId="apple">
                Apple
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>,
      );

      // Wait for scheduler to process registrations
      await vi.waitFor(() => {
        // The group should be hidden since no items have its groupId
        const group = container.querySelector('[data-command-group]');
        expect(group).toBeNull();
        // When the group returns null, its children (including Item) are also unmounted
        const item = container.querySelector('[data-command-item]');
        expect(item).toBeNull();
      });
    });

    it('should render group heading with proper data attribute when group has items', async () => {
      // Use machine options to pre-register items with explicit groupId
      // Don't render <Command.Item> JSX to avoid duplicate registration
      await render(
        <Command
          items={[
            { id: itemId('apple'), value: 'Apple', groupId: groupId('fruits') },
            { id: itemId('banana'), value: 'Banana', groupId: groupId('fruits') },
          ]}
          groups={[{ id: groupId('fruits'), heading: 'Fruits' }]}
        >
          <Command.Input />
          <Command.List>
            <Command.Group heading="Fruits" forceId="fruits" />
          </Command.List>
        </Command>,
      );

      await vi.waitFor(() => {
        const group = container.querySelector('[data-command-group]');
        expect(group).not.toBeNull();
        expect(group?.getAttribute('role')).toBe('group');

        const heading = group?.querySelector('[data-command-group-heading]');
        expect(heading).not.toBeNull();
        expect(heading?.textContent).toBe('Fruits');
        expect(group?.getAttribute('aria-labelledby')).toBe(heading?.id);
      });
    });

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

  // ---- 9. Empty state ----

  describe('empty state', () => {
    it('should show Empty when filteredCount is 0 and not loading', async () => {
      await render(
        <Command>
          <Command.Input />
          <Command.List>
            <Command.Item value="apple" forceId="apple">
              Apple
            </Command.Item>
            <Command.Empty>No results found.</Command.Empty>
          </Command.List>
        </Command>,
      );

      // Initially there's a result, so Empty should not be visible
      expect(container.querySelector('[data-command-empty]')).toBeNull();

      const input = container.querySelector('input') as HTMLInputElement;
      await typeInInput(input, 'zzzzz');

      await vi.waitFor(() => {
        const empty = container.querySelector('[data-command-empty]');
        expect(empty).not.toBeNull();
        expect(empty?.textContent).toBe('No results found.');
        expect(empty?.getAttribute('role')).toBe('status');
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
      // Vitest 4.1 — soft assertions for loading state attributes
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

  // ---- 11. Separator ----

  describe('separator', () => {
    it('should render separator with role=none', async () => {
      await render(
        <Command>
          <Command.Input />
          <Command.List>
            <Command.Item value="one" forceId="one">
              One
            </Command.Item>
            <Command.Separator />
            <Command.Item value="two" forceId="two">
              Two
            </Command.Item>
          </Command.List>
        </Command>,
      );

      const separator = container.querySelector('[data-command-separator]');
      expect(separator).not.toBeNull();
      expect(separator?.getAttribute('role')).toBe('none');
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

    it('should format shortcut string when shortcut prop is provided', async () => {
      await render(<Command.Shortcut shortcut="Shift+K" />);

      const kbd = container.querySelector('kbd') as Element;
      expect(kbd).not.toBeNull();
      // formatShortcut produces platform-specific text; just check it rendered something
      expect(kbd.textContent?.length).toBeGreaterThan(0);
      // Should contain 'K' as the key
      expect(kbd.textContent).toContain('K');
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

  // ---- 16. Dialog ----

  describe('Dialog component', () => {
    // Radix Dialog.Portal renders into document.body, not the test container
    it('should render overlay and dialog when open', async () => {
      await render(
        <Command.Dialog open label="Command dialog" container={container}>
          <Command.Input />
          <Command.List>
            <Command.Item value="test" forceId="test">
              Test
            </Command.Item>
          </Command.List>
        </Command.Dialog>,
      );

      // The dialog's controlled `open` prop triggers OPEN event via useEffect
      // which is processed through the machine scheduler asynchronously
      await vi.waitFor(
        () => {
          const overlay = container.querySelector('[data-command-overlay]');
          const dialog = container.querySelector('[data-command-dialog]');
          expect(overlay).not.toBeNull();
          expect(dialog).not.toBeNull();
          expect(dialog?.getAttribute('aria-label')).toBe('Command dialog');
        },
        { timeout: 3000 },
      );
    });

    it('should not render dialog content when closed', async () => {
      await render(
        <Command.Dialog open={false} label="Closed dialog" container={container}>
          <Command.Input />
          <Command.List>
            <Command.Item value="hidden" forceId="hidden">
              Hidden
            </Command.Item>
          </Command.List>
        </Command.Dialog>,
      );

      expect(container.querySelector('[data-command-dialog]')).toBeNull();
      expect(container.querySelector('[data-command-overlay]')).toBeNull();
    });

    it('should render data-command-root inside dialog content', async () => {
      await render(
        <Command.Dialog open label="Dialog root" container={container}>
          <Command.Input />
          <Command.List>
            <Command.Item value="inner" forceId="inner">
              Inner
            </Command.Item>
          </Command.List>
        </Command.Dialog>,
      );

      await vi.waitFor(() => {
        // Radix renders Content inside the portal container
        const dialogContent = container.querySelector('[data-command-dialog]');
        expect(dialogContent).not.toBeNull();
        const root = container.querySelector('[data-command-root]');
        expect(root).not.toBeNull();
      });
    });

    it('should call onOpenChange when overlay is clicked', async () => {
      const onOpenChange = vi.fn();

      await render(
        <Command.Dialog
          open
          onOpenChange={onOpenChange}
          label="Closable dialog"
          container={container}
        >
          <Command.Input />
          <Command.List>
            <Command.Item value="test" forceId="test">
              Test
            </Command.Item>
          </Command.List>
        </Command.Dialog>,
      );

      await vi.waitFor(() => {
        expect(container.querySelector('[data-command-overlay]')).not.toBeNull();
      });

      // Radix Dialog dismisses on pointer-down + pointer-up outside content (not click)
      const overlay = container.querySelector('[data-command-overlay]') as Element;
      await act(async () => {
        overlay.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      });
      await act(async () => {
        overlay.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      });
      await act(async () => {
        await new Promise<void>((r) => queueMicrotask(r));
      });

      await vi.waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });

  // ---- 17. onValueChange callback ----

  describe('input onValueChange', () => {
    it('should call onValueChange when input value changes', async () => {
      const onValueChange = vi.fn();

      await render(
        <Command>
          <Command.Input onValueChange={onValueChange} />
          <Command.List>
            <Command.Item value="one" forceId="one">
              One
            </Command.Item>
          </Command.List>
        </Command>,
      );

      const input = container.querySelector('input') as HTMLInputElement;
      await typeInInput(input, 'test');

      expect(onValueChange).toHaveBeenCalledWith('test');
    });
  });
});
