// packages/modern-cmdk/src/react/hooks/use-keyboard.ts
// Keyboard navigation — keydown handler factory; Command.Root and Command.Dialog attach it to document
// Isolated declarations: explicit return types on all exports
// Navigation keys dispatch through an object lookup; action keys (Enter/Backspace/Escape) through a switch
// Escape inside Command.Dialog belongs to Radix's DismissableLayer, which handles the capture-phase keydown first
// and calls preventDefault: the handler leaves an Escape that is already default-prevented alone

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
        // Already handled (Radix's dismissable layer closes the dialog through onOpenChange): close nothing twice
        if (event.defaultPrevented) break;
        event.preventDefault();
        machine.send({ type: 'CLOSE' });
        break;
    }
  };
}
