'use client';

// packages/command-react/src/dialog.tsx
// <Command.Dialog> — Radix Dialog.Root + Dialog.Portal + Dialog.Overlay + Dialog.Content
// @starting-style CSS animations, transition-behavior: allow-discrete, inert on background
// Focus trap via Radix built-in focus management
// ES2026: satisfies operator, branded types
// Isolated declarations: explicit return types on all exports

import { Dialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import type { CommandMachineOptions } from '../core/index.js';
import { createCommandMachine } from '../core/index.js';
import type { CommandContextValue, CommandRootId } from './context.js';
import { CommandContext } from './context.js';
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
  const rootId = useId() as CommandRootId;
  const listId = `${rootId}-list`;
  const inputId = `${rootId}-input`;

  // CRITICAL: useRef for stable machine reference across renders
  const machineRef = useRef<ReturnType<typeof createCommandMachine> | null>(null);
  if (machineRef.current === null) {
    machineRef.current = createCommandMachine({
      ...machineOptions,
      open: controlledOpen ?? machineOptions.open ?? false,
      onOpenChange: (open: boolean): void => {
        machineOptions.onOpenChange?.(open);
        onOpenChange?.(open);
      },
    });
  }
  const machine = machineRef.current;

  const { state, isPending, updateSearch, setOptimisticActiveId, filteredIdSet, id } =
    useCommand(machine);

  // Dispose machine on unmount — nulls ref so Strict Mode remount creates fresh machine
  useEffect(() => {
    return (): void => {
      machineRef.current?.[Symbol.dispose]();
      machineRef.current = null;
    };
    // eslint-disable-next-line -- machine is stable ref, dispose runs on unmount only
  }, []);

  // Keyboard navigation via document listener
  const handleKeyDown = useCallback(
    createKeydownHandler(machine, () => machine.getState()),
    [],
  );

  useEffect(() => {
    if (!state.open) return;
    document.addEventListener('keydown', handleKeyDown);
    return (): void => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown, state.open]);

  // Sync controlled open prop — only send if machine state doesn't match
  // Uses ref to avoid state.open in deps (prevents render loops)
  const prevControlledOpen = useRef(controlledOpen);
  useEffect(() => {
    if (controlledOpen !== undefined && controlledOpen !== prevControlledOpen.current) {
      prevControlledOpen.current = controlledOpen;
      machine.send({ type: controlledOpen ? 'OPEN' : 'CLOSE' });
    }
  }, [controlledOpen, machine]);

  // Radix onOpenChange callback — syncs dialog state back to machine
  const handleRadixOpenChange = useCallback(
    (open: boolean): void => {
      machine.send({ type: open ? 'OPEN' : 'CLOSE' });
    },
    [machine],
  );

  const contextValue = useMemo<CommandContextValue>(
    () =>
      ({
        machine,
        state,
        isPending,
        updateSearch,
        setOptimisticActiveId,
        filteredIdSet,
        rootId: id,
        listId,
        inputId,
        label,
      }) satisfies CommandContextValue,
    [
      machine,
      state,
      isPending,
      updateSearch,
      setOptimisticActiveId,
      filteredIdSet,
      id,
      listId,
      inputId,
      label,
    ],
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
          onOpenAutoFocus={(e: Event): void => {
            // Prevent Radix default focus — we auto-focus the input below
            e.preventDefault();
            // Auto-focus the input when dialog opens
            const input = document.getElementById(inputId);
            input?.focus();
          }}
        >
          <Dialog.Title className="sr-only">{label}</Dialog.Title>
          <Dialog.Description className="sr-only">Type a command or search...</Dialog.Description>
          <CommandContext value={contextValue}>
            <div data-command-dialog-content="" className={contentClassName}>
              <div data-command-root="" role="search" aria-label={label}>
                {children}
              </div>
            </div>
          </CommandContext>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
