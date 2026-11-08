// packages/modern-cmdk/src/react/hooks/use-command-setup.ts
// Shared setup hook — deduplicates machine init, context creation, keyboard handler,
// the latest-props options object, and the suspend/resume lifecycle between <Command> and <Command.Dialog>
// Isolated declarations: explicit return types on all exports

import type { CommandMachine, CommandMachineOptions, CommandState, ItemId } from 'modern-cmdk';
import { createCommandMachine } from 'modern-cmdk';
import { useLayoutEffect, useMemo, useRef } from 'react';
import type { CommandStableContextValue, CommandStateContextValue } from '../context.js';
import { useCommand } from './use-command.js';
import { createKeydownHandler } from './use-keyboard.js';

export interface UseCommandSetupReturn {
  readonly machine: CommandMachine;
  readonly state: CommandState;
  readonly isPending: boolean;
  readonly listId: string;
  readonly inputId: string;
  readonly handleKeyDown: (e: KeyboardEvent) => void;
  readonly stableContextValue: CommandStableContextValue;
  readonly stateContextValue: CommandStateContextValue;
}

/** The last value each deduped callback forwarded to the consumer. */
interface Forwarded {
  search: string;
  activeId: unknown;
  open: boolean;
}

type Callback = 'onSearchChange' | 'onActiveChange' | 'onOpenChange';

/**
 * The options object the machine keeps for its whole life: the first render's props, with the callbacks
 * replaced by trampolines over `latest.current`, so a prop change after mount reaches them. `onSelect` forwards
 * every call; the others forward a value only when it differs from the last one forwarded (a controlled
 * `activeId` reports every candidate: the caller may have refused the last one). A module-level function, so no
 * closure here sees the machine: the core's FinalizationRegistry holds this object through the search engine's
 * scorer, and a reference to the machine would keep it alive.
 */
function createLiveOptions(
  latest: { readonly current: CommandMachineOptions },
  fwd: Forwarded,
): CommandMachineOptions {
  const dedupe =
    (key: keyof Forwarded, name: Callback) =>
    (value: unknown): void => {
      if (value === fwd[key] && (key !== 'activeId' || latest.current.activeId === undefined))
        return;
      fwd[key] = value as never;
      (latest.current[name] as ((value: unknown) => void) | undefined)?.(value);
    };
  return {
    ...latest.current,
    onSelect: (id: ItemId): void => latest.current.onSelect?.(id),
    onSearchChange: dedupe('search', 'onSearchChange'),
    onActiveChange: dedupe('activeId', 'onActiveChange'),
    onOpenChange: dedupe('open', 'onOpenChange'),
  };
}

/**
 * Shared setup for Command and Command.Dialog — holds one machine per mount, subscribes via
 * useSyncExternalStore, memoizes context values, and ties the machine's global holds to the
 * component's effects.
 *
 * The machine is created in a null-guarded lazy ref initializer, so StrictMode's second render
 * pass reuses it (a `useState` initializer runs twice and leaks the discarded machine's
 * listeners; react.dev/reference/react/useState). It is suspended at creation: a render React
 * throws away leaves no global listener behind. The layout effect resumes it and its cleanup
 * suspends it again, so StrictMode's replay and an `<Activity>` hide/show (which cleans up and
 * re-creates effects while keeping state; react.dev/reference/react/Activity) keep the same
 * machine with its registrations and query. The hook never disposes: a suspended machine holds
 * no global reference, and the core's FinalizationRegistry disposes the search engine the
 * machine created once the machine is collected.
 *
 * The machine's options object is built once, over a ref that holds the latest props. The ref starts as the
 * first render's props, so a server render (where layout effects never run) reads real props, and a layout
 * effect without dependencies assigns each commit's props, so render writes nothing.
 *
 * @param options - The props that are machine options, from every render. The first render's values initialise
 *   the machine.
 * @param label - Accessible label for the command palette (included in stable context).
 */
export function useCommandSetup(
  options: CommandMachineOptions,
  label: string,
): UseCommandSetupReturn {
  const latest = useRef(options);

  // The one render-time ref write: a null-guarded initializer, which react.dev/reference/react/useRef
  // sanctions because the result is always the same and the condition runs only during initialization
  const machineRef = useRef<CommandMachine | null>(null);
  if (machineRef.current === null) {
    // Construction calls no option callback; the memory takes the machine's state once it exists
    const fwd: Forwarded = { search: '', activeId: null, open: false };
    const machine = createCommandMachine(createLiveOptions(latest, fwd));
    machine.suspend?.();
    Object.assign(fwd, machine.getState());
    machineRef.current = machine;
  }
  const machine = machineRef.current;

  const { state, isPending, updateSearch, setOptimisticActiveId, filteredIdSet, id } =
    useCommand(machine);

  // Derive list/input IDs from the single useId() in useCommand — coherent with rootId
  const listId = `${id}-list`;
  const inputId = `${id}-input`;

  // Resume in the layout-effect setup, suspend in its cleanup: the layout phase runs before paint, so
  // StrictMode's synchronous replay and an Activity show re-arm the machine before a key can reach it
  useLayoutEffect(() => {
    machine.resume?.();
    return (): void => {
      machine.suspend?.();
    };
  }, [machine]);

  // Every commit: publish the props to the options object
  useLayoutEffect(() => {
    latest.current = options;
  });

  // Keyboard handler — useMemo (not useCallback) to memoize the factory result
  const handleKeyDown = useMemo(
    () => createKeydownHandler(machine, () => machine.getState()),
    [machine],
  );

  // Stable context — only depends on values that never change after mount
  const stableContextValue = useMemo<CommandStableContextValue>(
    () =>
      ({
        machine,
        rootId: id,
        listId,
        inputId,
        label,
        updateSearch,
        setOptimisticActiveId,
      }) satisfies CommandStableContextValue,
    [machine, id, listId, inputId, label, updateSearch, setOptimisticActiveId],
  );

  // State context — changes on every search/navigation
  const stateContextValue = useMemo<CommandStateContextValue>(
    () =>
      ({
        state,
        isPending,
        filteredIdSet,
        visibleIdSet: null,
        virtualPositionMap: null,
      }) satisfies CommandStateContextValue,
    [state, isPending, filteredIdSet],
  );

  return {
    machine,
    state,
    isPending,
    listId,
    inputId,
    handleKeyDown,
    stableContextValue,
    stateContextValue,
  } satisfies UseCommandSetupReturn;
}
