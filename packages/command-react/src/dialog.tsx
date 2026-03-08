'use client';

// packages/command-react/src/dialog.tsx
// <Command.Dialog> — Radix Dialog.Root + Dialog.Portal + Dialog.Overlay + Dialog.Content
// @starting-style CSS animations, transition-behavior: allow-discrete, inert on background
// Focus trap via Radix built-in focus management
// ES2026: satisfies operator, branded types
// Isolated declarations: explicit return types on all exports

import type { CommandMachineOptions } from '@crimson_dev/command';
import { createCommandMachine } from '@crimson_dev/command';
import { Dialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
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

  const { state, isPending, updateSearch, setOptimisticActiveId, id } = useCommand(machine);

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

  // Sync controlled open prop with machine state
  useEffect(() => {
    if (controlledOpen !== undefined) {
      if (controlledOpen && !state.open) {
        machine.send({ type: 'OPEN' });
      } else if (!controlledOpen && state.open) {
        machine.send({ type: 'CLOSE' });
      }
    }
  }, [controlledOpen, state.open, machine]);

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
        rootId: id,
        listId,
        inputId,
        label,
      }) satisfies CommandContextValue,
    [machine, state, isPending, updateSearch, setOptimisticActiveId, id, listId, inputId, label],
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
            // Prevent Radix default focus — we manage focus on the input
            e.preventDefault();
          }}
        >
          <Dialog.Title className="sr-only">{label}</Dialog.Title>
          <Dialog.Description className="sr-only">Type a command or search...</Dialog.Description>
          <CommandContext value={contextValue}>
            <div data-command-dialog-content="" className={contentClassName}>
              <div data-command-root="" role="application" aria-label={label}>
                {children}
              </div>
            </div>
          </CommandContext>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
