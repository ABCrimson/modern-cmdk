'use client';

// packages/command-react/src/hooks/use-keyboard.ts
// Keyboard navigation — event handler factory, attached to root element
// Isolated declarations: explicit return types on all exports
// Uses object lookup (ES2026 style) instead of switch for cleaner dispatch

import type { CommandMachine, CommandState } from '../../core/index.js';

/** Valid navigation directions */
type NavigationDirection = 'next' | 'prev' | 'first' | 'last';

/** Navigation key to machine direction mapping */
const NAVIGATION_KEYS: Readonly<Record<string, NavigationDirection>> = {
  ArrowDown: 'next',
  ArrowUp: 'prev',
  Home: 'first',
  End: 'last',
};

/** Create a keydown handler for command palette keyboard navigation */
export function createKeydownHandler(
  machine: CommandMachine,
  getState: () => CommandState,
): (event: KeyboardEvent) => void {
  return (event: KeyboardEvent): void => {
    const { key } = event;
    const state = getState();

    // Navigation keys — ArrowDown/Up/Home/End
    const direction = NAVIGATION_KEYS[key];
    if (direction) {
      event.preventDefault();
      machine.send({ type: 'NAVIGATE', direction });
      return;
    }

    // Action keys
    switch (key) {
      case 'Enter': {
        event.preventDefault();
        const { activeId } = state;
        if (activeId) {
          machine.send({ type: 'ITEM_SELECT', id: activeId });
        }
        break;
      }
      case 'Backspace':
        // Pop page when input is empty and backspace is pressed
        if (state.search === '' && state.pageStack.length > 0) {
          event.preventDefault();
          machine.send({ type: 'PAGE_POP' });
        }
        break;
      case 'Escape':
        event.preventDefault();
        machine.send({ type: 'CLOSE' });
        break;
    }
  };
}
