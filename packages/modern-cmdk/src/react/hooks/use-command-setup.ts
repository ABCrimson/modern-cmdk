'use client';

// packages/command-react/src/hooks/use-command-setup.ts
// Shared setup hook — deduplicates machine init, context creation, keyboard handler,
// and disposal between <Command> and <Command.Dialog>
// Isolated declarations: explicit return types on all exports

import { useEffect, useMemo, useRef } from 'react';
import type { CommandMachine, CommandState } from '../../core/index.js';
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
 * Shared setup for Command and Command.Dialog — creates machine once,
 * subscribes via useSyncExternalStore, memoizes context values, and
 * registers disposal on unmount.
 *
 * @param machineFactory - Called exactly once (first render) to create the machine.
 *   Subsequent renders skip it via ref guard.
 * @param label - Accessible label for the command palette (included in stable context).
 */
export function useCommandSetup(
  machineFactory: () => CommandMachine,
  label: string,
): UseCommandSetupReturn {
  // Create machine once — stable reference across renders
  const machineRef = useRef<CommandMachine | null>(null);
  if (machineRef.current === null) {
    machineRef.current = machineFactory();
  }
  const machine = machineRef.current;

  const { state, isPending, updateSearch, setOptimisticActiveId, filteredIdSet, id } =
    useCommand(machine);

  // Derive list/input IDs from the single useId() in useCommand — coherent with rootId
  const listId = `${id}-list`;
  const inputId = `${id}-input`;

  // Dispose machine on unmount — prevents resource leaks (scheduler, emitter, search engine)
  // Nulls the ref so Strict Mode remount creates a fresh machine
  useEffect(() => {
    return (): void => {
      machineRef.current?.[Symbol.dispose]();
      machineRef.current = null;
    };
  }, []);

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
