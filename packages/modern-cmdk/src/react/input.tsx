// packages/modern-cmdk/src/react/input.tsx
// <Command.Input> — urgent local input value (or the caller's controlled value), stable callbacks, ARIA combobox role
// The machine applies SEARCH_CHANGE on its scheduler tick (rAF in browsers), so machine state lags
// the DOM. The controlled value therefore lives in local state set inside the change event (an urgent
// discrete-event update); machine state only overwrites it for changes that did not originate here (reconciled on every machine tick).
// A caller that passes `value` owns the text instead: the input shows it, a change only reports through onValueChange,
// and a layout effect queues the prop on the machine.
// React 19: use() for context, ref as prop (no forwardRef)
// Isolated declarations: explicit return types on all exports

import type { ComponentPropsWithRef, ReactNode } from 'react';
import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useStableContext, useStateContext } from './context.js';

export interface CommandInputProps
  extends Omit<ComponentPropsWithRef<'input'>, 'onChange' | 'type' | 'role'> {
  /**
   * The search text, controlled by the caller. When defined the input shows it, a change calls `onValueChange`
   * and sends nothing to the machine, and a layout effect sends the prop to the machine as the search query
   * whenever it changes. Leave it `undefined` for the input to keep its own text and send each change itself.
   */
  readonly value?: string | undefined;
  /**
   * Called with the new text on every change. Controlled (`value` defined): the caller applies it by passing the
   * next `value`; a caller that ignores it keeps the input at its `value`.
   */
  readonly onValueChange?: (value: string) => void;
}

/** Combobox input that drives the command palette search state. */
export function CommandInput({
  ref,
  placeholder = 'Search...',
  value,
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

  // Controlled: the prop is the search text, queued on the machine whenever it changes
  useLayoutEffect(() => {
    if (value !== undefined) stable.updateSearch(value);
  }, [value, stable.updateSearch]);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      const next = event.target.value;
      if (value === undefined) {
        inFlight.current.push(next);
        setDraft(next);
        stable.updateSearch(next);
      }
      onValueChange?.(next);
    },
    [value, stable.updateSearch, onValueChange],
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
      value={value ?? draft}
      onChange={handleChange}
      {...props}
    />
  );
}
