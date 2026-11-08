// packages/modern-cmdk/src/react/dialog.tsx
// <Command.Dialog> — Radix Dialog.Root + Dialog.Portal + Dialog.Overlay + Dialog.Content
// @starting-style CSS animations, transition-behavior: allow-discrete, background hidden with aria-hidden through Radix hideOthers
// Focus trap via Radix built-in focus management
// Isolated declarations: explicit return types on all exports

import type { CommandMachineOptions } from 'modern-cmdk';
import { Dialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { useCallback, useEffect } from 'react';
import { CommandStableContext, CommandStateContext } from './context.js';
import { useCommandSetup } from './hooks/use-command-setup.js';

export interface CommandDialogProps extends CommandMachineOptions {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly overlayClassName?: string;
  readonly contentClassName?: string;
  readonly label?: string;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  /** Accessible description for screen readers (default: 'Type a command or search...') */
  readonly description?: string;
  /** Container element for the portal (default: document.body) */
  readonly container?: HTMLElement | null;
}

/** Dialog variant that wraps the command palette in a Radix UI Dialog with focus trap and overlay. */
export function CommandDialog({
  children,
  className,
  overlayClassName,
  contentClassName,
  label = 'Command palette',
  description = 'Type a command or search...',
  open: controlledOpen,
  onOpenChange,
  container,
  ...machineOptions
}: CommandDialogProps): ReactNode {
  const { machine, state, handleKeyDown, stableContextValue, stateContextValue, inputId } =
    useCommandSetup({ ...machineOptions, open: controlledOpen ?? false, onOpenChange }, label);

  // Keyboard listener — only when dialog is open
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

  return (
    <Dialog.Root open={state.open} onOpenChange={handleRadixOpenChange}>
      <Dialog.Portal container={container}>
        {/* Overlay — tint set by data-state; its transition and @starting-style entry are inert until DT-19 */}
        <Dialog.Overlay
          data-command-overlay=""
          data-state={state.open ? 'open' : 'closed'}
          className={overlayClassName}
        />
        {/* Content — focus trap via Radix; its @starting-style entry is inert until DT-19 */}
        <Dialog.Content
          data-command-dialog=""
          data-state={state.open ? 'open' : 'closed'}
          className={className}
          aria-label={label}
          onOpenAutoFocus={handleOpenAutoFocus}
        >
          <Dialog.Title className="sr-only">{label}</Dialog.Title>
          <Dialog.Description className="sr-only">{description}</Dialog.Description>
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
