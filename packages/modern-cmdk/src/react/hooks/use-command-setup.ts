// packages/modern-cmdk/src/react/hooks/use-command-setup.ts
// Shared setup hook — deduplicates machine init, context creation, keyboard handler,
// and the suspend/resume lifecycle between <Command> and <Command.Dialog>
// Isolated declarations: explicit return types on all exports

import type { CommandMachine, CommandState } from 'modern-cmdk';
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
 * @param machineFactory - Called exactly once (first render) to create the machine. Subsequent
 *   renders skip it via the ref guard. Its options must not reference the machine, or the
 *   registry's hold on the created search engine keeps the machine alive.
 * @param label - Accessible label for the command palette (included in stable context).
 */
export function useCommandSetup(
  machineFactory: () => CommandMachine,
  label: string,
): UseCommandSetupReturn {
  // The one render-time ref write: a null-guarded initializer, which react.dev/reference/react/useRef
  // sanctions because the result is always the same and the condition runs only during initialization
  const machineRef = useRef<CommandMachine | null>(null);
  if (machineRef.current === null) {
    machineRef.current = machineFactory();
    machineRef.current.suspend?.();
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
