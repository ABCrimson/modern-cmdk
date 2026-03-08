'use client';

// packages/command-react/src/hooks/use-keyboard.ts
// Keyboard navigation — event handler factory, attached to root element
// Isolated declarations: explicit return types on all exports
// Uses object lookup (ES2026 style) instead of switch for cleaner dispatch

import type { CommandMachine, CommandState } from '@crimson_dev/command';

/** Navigation key to machine direction mapping */
const NAVIGATION_KEYS = {
  ArrowDown: 'next',
  ArrowUp: 'prev',
  Home: 'first',
  End: 'last',
} as const satisfies Record<string, string>;

type NavigationKey = keyof typeof NAVIGATION_KEYS;

/** Create a keydown handler for command palette keyboard navigation */
export function createKeydownHandler(
  machine: CommandMachine,
  getState: () => CommandState,
): (event: KeyboardEvent) => void {
  return (event: KeyboardEvent): void => {
    const { key } = event;
    const state = getState();

    // Navigation keys — ArrowDown/Up/Home/End
    if (key in NAVIGATION_KEYS) {
      event.preventDefault();
      machine.send({ type: 'NAVIGATE', direction: NAVIGATION_KEYS[key as NavigationKey] });
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
