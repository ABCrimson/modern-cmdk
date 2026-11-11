// packages/modern-cmdk/src/react/input.tsx
// <Command.Input> — urgent local input value (or the caller's controlled value), stable callbacks, ARIA combobox role
// The machine applies SEARCH_CHANGE on its scheduler tick (rAF in browsers), so machine state lags
// the DOM. The controlled value therefore lives in local state set inside the change event (an urgent
// discrete-event update); machine state only overwrites it for changes that did not originate here (reconciled on every machine tick).
// A caller that passes `value` owns the text instead: the input shows it, a change only reports through onValueChange,
// and a layout effect queues the prop on the machine without a call to the root's onSearchChange.
// React 19: use() for context, ref as prop (no forwardRef)
// Isolated declarations: explicit return types on all exports

import type { ComponentPropsWithRef, ReactNode } from 'react';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useStableContext, useStateContext } from './context.js';

/** Props of {@link CommandInput}: any attribute of an `input` except `onChange`, `type` and `role`, plus a controlled `value`. */
export interface CommandInputProps
  extends Omit<ComponentPropsWithRef<'input'>, 'onChange' | 'type' | 'role'> {
  /**
   * The search text, controlled by the caller. When defined the input shows it, a change calls `onValueChange`
   * and sends nothing to the machine, and a layout effect sends the prop to the machine as the search query
   * whenever it changes. The root's `onSearchChange` is not called for a query that comes from this prop: a change
   * of a prop the caller owns is not reported back to it, and the user's typing reports through `onValueChange`.
   * Leave it `undefined` for the input to keep its own text and send each change itself.
   */
  readonly value?: string | undefined;
  /**
   * Called with the new text on every change. Controlled (`value` defined): the caller applies it by passing the
   * next `value`; a caller that ignores it keeps the input at its `value`.
   */
  readonly onValueChange?: ((value: string) => void) | undefined;
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

  // The root's state is the machine's own snapshot (`useCommand`), so its identity changes only on a machine tick
  const machineState = stateCtx.state;
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

  // Controlled: the prop is the search text, queued on the machine whenever it changes as a query the caller owns,
  // so the root's onSearchChange hears nothing for it
  useLayoutEffect(() => {
    if (value !== undefined) stable.updateSearch(value, true);
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
