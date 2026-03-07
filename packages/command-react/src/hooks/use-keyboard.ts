'use client';

// packages/command-react/src/hooks/use-keyboard.ts
// Keyboard navigation — event handler attached to root element, not global document

import type { CommandMachine, CommandState } from '@crimson_dev/command';

/** Create a keydown handler for command palette keyboard navigation */
export function createKeydownHandler(
  machine: CommandMachine,
  getState: () => CommandState,
): (event: KeyboardEvent) => void {
  return (event: KeyboardEvent): void => {
    const state = getState();

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        machine.send({ type: 'NAVIGATE', direction: 'next' });
        break;
      case 'ArrowUp':
        event.preventDefault();
        machine.send({ type: 'NAVIGATE', direction: 'prev' });
        break;
      case 'Home':
        event.preventDefault();
        machine.send({ type: 'NAVIGATE', direction: 'first' });
        break;
      case 'End':
        event.preventDefault();
        machine.send({ type: 'NAVIGATE', direction: 'last' });
        break;
      case 'Enter': {
        event.preventDefault();
        const activeId = state.activeId;
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
