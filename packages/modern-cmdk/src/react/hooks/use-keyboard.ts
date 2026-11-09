// packages/modern-cmdk/src/react/hooks/use-keyboard.ts
// Keyboard navigation: the keydown handler factory of Command.Root and Command.Dialog.
// Navigation keys dispatch through an object lookup; action keys (Enter, Backspace, Escape)
// through a switch.
// Escape inside `Command.Dialog` is Radix's: its capture-phase listener default-prevents first, so
// the handler leaves it alone (a default-prevented key is never handled).
// Isolated declarations: explicit return types on all exports

import type { CommandMachine, CommandState } from 'modern-cmdk';

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
      if ((direction === 'first' || direction === 'last') && hasModifier(event)) return;
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

/** True when Shift, Ctrl, Alt or Meta is held */
const hasModifier = (e: KeyboardEvent): boolean => e.shiftKey || e.ctrlKey || e.altKey || e.metaKey;
