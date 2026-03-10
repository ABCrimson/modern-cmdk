'use client';

// packages/command-react/src/dialog.tsx
// <Command.Dialog> — Radix Dialog.Root + Dialog.Portal + Dialog.Overlay + Dialog.Content
// @starting-style CSS animations, transition-behavior: allow-discrete, inert on background
// Focus trap via Radix built-in focus management
// ES2026: satisfies operator, branded types
// Isolated declarations: explicit return types on all exports

import { Dialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { CommandMachineOptions } from '../core/index.js';
import { createCommandMachine } from '../core/index.js';
import type {
  CommandStableContextValue,
  CommandStateContextValue,
} from './context.js';
import { CommandStableContext, CommandStateContext } from './context.js';
import { useCommand } from './hooks/use-command.js';
import { createKeydownHandler } from './hooks/use-keyboard.js';

export interface CommandDialogProps extends CommandMachineOptions {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly overlayClassName?: string;
  readonly contentClassName?: string;
  readonly label?: string;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  /** Container element for the portal (default: document.body) */
  readonly container?: HTMLElement | null;
}

export function CommandDialog({
  children,
  className,
  overlayClassName,
  contentClassName,
  label = 'Command palette',
  open: controlledOpen,
  onOpenChange,
  container,
  ...machineOptions
}: CommandDialogProps): ReactNode {
  // Ref to avoid stale onOpenChange closure captured at mount time
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  // CRITICAL: useRef for stable machine reference across renders
  const machineRef = useRef<ReturnType<typeof createCommandMachine> | null>(null);
  if (machineRef.current === null) {
    machineRef.current = createCommandMachine({
      ...machineOptions,
      open: controlledOpen ?? false,
      onOpenChange: (open: boolean): void => {
        onOpenChangeRef.current?.(open);
      },
    });
  }
  const machine = machineRef.current;

  const { state, isPending, updateSearch, setOptimisticActiveId, filteredIdSet, id } =
    useCommand(machine);

  // Derive list/input IDs from the single useId() in useCommand — coherent with rootId
  const listId = `${id}-list`;
  const inputId = `${id}-input`;

  // Dispose machine on unmount — nulls ref so Strict Mode remount creates fresh machine
  useEffect(() => {
    return (): void => {
      machineRef.current?.[Symbol.dispose]();
      machineRef.current = null;
    };
    // eslint-disable-next-line -- machine is stable ref, dispose runs on unmount only
  }, []);

  // Keyboard navigation via document listener
  const handleKeyDown = useMemo(
    () => createKeydownHandler(machine, () => machine.getState()),
    [machine],
  );

  useEffect(() => {
    if (!state.open) return;
    document.addEventListener('keydown', handleKeyDown);
    return (): void => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown, state.open]);

  // Sync controlled open prop — useEffect already diffs deps, no ref needed
  useEffect(() => {
    if (controlledOpen !== undefined) {
      machine.send({ type: controlledOpen ? 'OPEN' : 'CLOSE' });
    }
  }, [controlledOpen, machine]);

  // Prevent Radix default focus — auto-focus the command input instead
  const handleOpenAutoFocus = useCallback(
    (e: Event): void => {
      e.preventDefault();
      document.getElementById(inputId)?.focus();
    },
    [inputId],
  );

  // Radix onOpenChange callback — syncs dialog state back to machine
  const handleRadixOpenChange = useCallback(
    (open: boolean): void => {
      machine.send({ type: open ? 'OPEN' : 'CLOSE' });
    },
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

  return (
    <Dialog.Root open={state.open} onOpenChange={handleRadixOpenChange}>
      <Dialog.Portal container={container}>
        {/* Overlay — GPU-composited @starting-style animation */}
        <Dialog.Overlay
          data-command-overlay=""
          data-state={state.open ? 'open' : 'closed'}
          className={overlayClassName}
        />
        {/* Content — focus trap via Radix, @starting-style animation */}
        <Dialog.Content
          data-command-dialog=""
          data-state={state.open ? 'open' : 'closed'}
          className={className}
          aria-label={label}
          onOpenAutoFocus={handleOpenAutoFocus}
        >
          <Dialog.Title className="sr-only">{label}</Dialog.Title>
          <Dialog.Description className="sr-only">Type a command or search...</Dialog.Description>
          <CommandStableContext value={stableContextValue}>
            <CommandStateContext value={stateContextValue}>
              <div data-command-dialog-content="" className={contentClassName}>
                <div data-command-root="" role="search" aria-label={label}>
                  {children}
                </div>
              </div>
            </CommandStateContext>
          </CommandStableContext>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
