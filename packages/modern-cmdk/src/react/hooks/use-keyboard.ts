// packages/modern-cmdk/src/react/hooks/use-keyboard.ts
// Keyboard navigation: the keydown handler factory, and `handleRootKeyDown`, the React `onKeyDown`
// of the inline root's div and of `Dialog.Content`. It runs the consumer's handler first, then the
// palette's handler for a key whose target lies inside the element's DOM (`contains`, which a
// portal's bubbling through the React tree would otherwise bypass) and, with
// `keyboardScope="combobox"`, only for `Command.Input`.
// Navigation keys dispatch through an object lookup; action keys (Enter, Backspace, Escape)
// through a switch.
// A cancelable Escape inside `Command.Dialog` is Radix's: its capture-phase listener
// default-prevents it first, so the handler leaves it alone (a default-prevented key is never
// handled).
// Isolated declarations: explicit return types on all exports

import type { CommandMachine, CommandState } from 'modern-cmdk';
import type { KeyboardEventHandler, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { dev } from '../env.js';

// Module-scoped declaration: no @types/node needed, and nothing global leaks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };

/** Valid navigation directions */
type NavigationDirection = 'next' | 'prev' | 'first' | 'last';

/** Navigation key to machine direction mapping */
const NAVIGATION_KEYS: Readonly<Record<string, NavigationDirection>> = {
  ArrowDown: 'next',
  ArrowUp: 'prev',
  Home: 'first',
  End: 'last',
};

/**
 * Create a keydown handler for command palette keyboard navigation. It acts on ArrowUp, ArrowDown,
 * Home, End, Enter (with an active item), Backspace (an empty query on a pushed page) and Escape
 * (while the palette is open), and leaves every other key alone, as well as a key an input method
 * composes, one that another handler default-prevented, and Home or End with a modifier (the
 * input's text selection). A branch calls `preventDefault()` exactly when it acts.
 */
export function createKeydownHandler(
  machine: CommandMachine,
  getState: () => CommandState,
): (event: KeyboardEvent) => void {
  return (event: KeyboardEvent): void => {
    // The core's `isImeComposition` (core/keyboard/index.ts) is this predicate: the keydowns that
    // open and close a composition carry `keyCode` 229 while `isComposing` is still false (MDN,
    // keydown event). It is not imported: the react build reaches the core through its public
    // entry only (`deps.neverBundle: ['modern-cmdk']`) and the predicate is not public.
    if (event.isComposing || event.keyCode === 229 || event.defaultPrevented) return;
    const { key } = event;
    const state = getState();

    // Navigation keys: ArrowDown, ArrowUp, Home, End (a modified Home or End is the input's)
    const direction = NAVIGATION_KEYS[key];
    if (direction) {
      if (
        (direction === 'first' || direction === 'last') &&
        (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey)
      ) {
        return;
      }
      event.preventDefault();
      machine.send({ type: 'NAVIGATE', direction });
      return;
    }

    // Action keys
    switch (key) {
      case 'Enter':
        if (state.activeId) {
          event.preventDefault();
          machine.send({ type: 'ITEM_SELECT', id: state.activeId });
        }
        break;
      case 'Backspace':
        // Pop the page when the input is empty
        if (state.search === '' && state.pageStack.length > 0) {
          event.preventDefault();
          machine.send({ type: 'PAGE_POP' });
        }
        break;
      case 'Escape':
        // A palette that is not open has nothing to close: the key stays the page's
        if (state.open) {
          event.preventDefault();
          machine.send({ type: 'CLOSE' });
        }
        break;
    }
  };
}

const INPUT = '[data-command-input]';
const INTERACTIVE = 'button, a[href], input, select, textarea, [contenteditable]';
/** The roots that already warned about a key handled from another interactive element */
const warned = /* @__PURE__ */ new WeakSet<Element>();

/**
 * The `onKeyDown` of a palette's root element: the consumer's `onKeyDown` runs first; then, unless
 * it default-prevented the event or the target lies outside the element's DOM (or, with
 * `keyboardScope="combobox"`, is not `Command.Input`), `handleKeyDown` gets the native event.
 * With the default `'root'` scope, development builds warn once per root when the handler acts on
 * a key from an interactive element other than the input.
 */
export function handleRootKeyDown(
  event: ReactKeyboardEvent<HTMLDivElement>,
  handleKeyDown: (event: KeyboardEvent) => void,
  keyboardScope: 'root' | 'combobox' | undefined,
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>,
): void {
  onKeyDown?.(event);
  // The synthetic event's `isDefaultPrevented()` also counts a `preventDefault()` on an event the
  // browser made non-cancelable
  if (event.isDefaultPrevented()) return;
  const { currentTarget, nativeEvent } = event;
  const target = event.target as Element;
  if (!currentTarget.contains(target)) return;
  if (keyboardScope === 'combobox' && !target.matches(INPUT)) return;
  handleKeyDown(nativeEvent);
  if (
    dev &&
    process.env.NODE_ENV !== 'production' &&
    keyboardScope !== 'combobox' &&
    nativeEvent.defaultPrevented &&
    !target.matches(INPUT) &&
    target.matches(INTERACTIVE) &&
    !warned.has(currentTarget)
  ) {
    warned.add(currentTarget);
    // biome-ignore lint/suspicious/noConsole: development-only misuse diagnostic, gated on NODE_ENV
    console.warn(
      `[modern-cmdk] The palette handled "${event.key}" from a <${target.localName}> ` +
        'inside its root. Pass keyboardScope="combobox" to handle keys from the input only.',
    );
  }
}
