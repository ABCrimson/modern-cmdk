// packages/modern-cmdk/src/react/input.tsx
// <Command.Input> — urgent local input value, stable callbacks, ARIA combobox role
// The machine applies SEARCH_CHANGE on its scheduler tick (rAF in browsers), so machine state lags
// the DOM. The controlled value therefore lives in local state set inside the change event (an urgent
// discrete-event update); machine state only overwrites it for changes that did not originate here (reconciled on every machine tick).
// React 19: use() for context, ref as prop (no forwardRef)
// Isolated declarations: explicit return types on all exports

import type { ComponentPropsWithRef, ReactNode } from 'react';
import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useStableContext, useStateContext } from './context.js';

export interface CommandInputProps
  extends Omit<ComponentPropsWithRef<'input'>, 'value' | 'onChange' | 'type' | 'role'> {
  readonly onValueChange?: (value: string) => void;
}

/** Combobox input that drives the command palette search state. */
export function CommandInput({
  ref,
  placeholder = 'Search...',
  onValueChange,
  ...props
}: CommandInputProps): ReactNode {
  const stable = useStableContext('Command.Input');
  const stateCtx = useStateContext('Command.Input');

  // The machine's own store, not the root's merged state: that object also changes identity on optimistic
  // active-item renders, which are not machine ticks and carry a stale search.
  const machineState = useSyncExternalStore(
    stable.machine.subscribe,
    stable.machine.getState,
    stable.machine.getState,
  );
  const [draft, setDraft] = useState<string>(machineState.search);
  // Queries typed here that the machine has not processed yet, oldest first
  const inFlight = useRef<string[]>([]);

  // Every machine tick (a new state object from the machine's own store) has processed every query sent before it, so the queue
  // is reconciled on each tick, even one whose search is unchanged (type then Backspace in one frame).
  // An echo of something typed here is already in the draft; anything else (external SEARCH_CHANGE,
  // reset) replaces it.
  useLayoutEffect(() => {
    const { search } = machineState;
    const echoed = inFlight.current.lastIndexOf(search);
    if (echoed !== -1) {
      inFlight.current.splice(0, echoed + 1);
    } else {
      inFlight.current = [];
      setDraft(search);
    }
  }, [machineState]);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      const { value } = event.target;
      inFlight.current.push(value);
      setDraft(value);
      stable.updateSearch(value);
      onValueChange?.(value);
    },
    [stable.updateSearch, onValueChange],
  );

  return (
    <input
      ref={ref}
      data-command-input=""
      type="text"
      role="combobox"
      aria-expanded={true}
      aria-controls={stable.listId}
      aria-activedescendant={stateCtx.state.activeId ?? undefined}
      aria-autocomplete="list"
      aria-label={stable.label}
      id={stable.inputId}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      placeholder={placeholder}
      value={draft}
      onChange={handleChange}
      {...props}
    />
  );
}
