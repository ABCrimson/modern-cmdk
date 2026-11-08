// packages/modern-cmdk/src/react/dialog.tsx
// <Command.Dialog> — Radix Dialog.Root + Dialog.Portal + Dialog.Overlay + Dialog.Content
// @starting-style CSS animations, transition-behavior: allow-discrete, background hidden with aria-hidden through Radix hideOthers
// Focus trap via Radix built-in focus management
// Isolated declarations: explicit return types on all exports

import type { CommandMachineOptions } from 'modern-cmdk';
import { Dialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { CommandStableContext, CommandStateContext } from './context.js';
import { useCommandSetup } from './hooks/use-command-setup.js';

export interface CommandDialogProps extends CommandMachineOptions {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly overlayClassName?: string;
  readonly contentClassName?: string;
  readonly label?: string;
  /**
   * Controlled open state. When defined, the dialog is open exactly while it is `true`: a request to close
   * (Escape, a click outside, the overlay) calls `onOpenChange(false)` and changes nothing else, so a parent that
   * keeps `open={true}` keeps the dialog open. Leave it `undefined` for the dialog to own its open state.
   */
  readonly open?: boolean | undefined;
  /**
   * Called with the next open state: for a controlled dialog when the user asks to open or close it, for an
   * uncontrolled one when its open state changes. A change of the `open` prop does not call it.
   */
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
  // The machine reports an open change to the consumer only while the dialog owns its open state; a controlled
  // dialog reports the user's request from Radix instead (handleRadixOpenChange), never the machine's echo of the prop
  const { machine, state, handleKeyDown, stableContextValue, stateContextValue } = useCommandSetup(
    {
      ...machineOptions,
      open: controlledOpen ?? false,
      onOpenChange: controlledOpen === undefined ? onOpenChange : undefined,
    },
    label,
  );

  // One value for Dialog.Root, both data-state attributes and the keydown listener
  const open = controlledOpen ?? state.open;

  const contentRef = useRef<HTMLDivElement>(null);

  // Keyboard listener — only when dialog is open
  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    return (): void => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown, open]);

  // A controlled dialog's machine follows the prop. The machine's state is a dependency so that a state the
  // prop did not ask for is put back; sending the state it already has changes nothing.
  useEffect(() => {
    if (controlledOpen !== undefined && controlledOpen !== state.open) {
      machine.send({ type: controlledOpen ? 'OPEN' : 'CLOSE' });
    }
  }, [controlledOpen, state.open, machine]);

  // Prevent Radix default focus — auto-focus the command input instead. The lookup starts at the dialog content, so
  // a portal container inside a shadow root finds the input (document.getElementById does not pierce a shadow root).
  const handleOpenAutoFocus = useCallback((e: Event): void => {
    e.preventDefault();
    contentRef.current?.querySelector<HTMLElement>('[data-command-input]')?.focus();
  }, []);

  // Radix reports the user's request to open or close the dialog. A controlled dialog hands it to the consumer and
  // waits for the prop; an uncontrolled one applies it, and the machine reports the change.
  const handleRadixOpenChange = useCallback(
    (next: boolean): void => {
      if (controlledOpen !== undefined) onOpenChange?.(next);
      else machine.send({ type: next ? 'OPEN' : 'CLOSE' });
    },
    [controlledOpen, onOpenChange, machine],
  );

  return (
    <Dialog.Root open={open} onOpenChange={handleRadixOpenChange}>
      <Dialog.Portal container={container}>
        {/* Overlay — tint set by data-state; its transition and @starting-style entry are inert until DT-19 */}
        <Dialog.Overlay
          data-command-overlay=""
          data-state={open ? 'open' : 'closed'}
          className={overlayClassName}
        />
        {/* Content — focus trap via Radix; its @starting-style entry is inert until DT-19 */}
        <Dialog.Content
          ref={contentRef}
          data-command-dialog=""
          data-state={open ? 'open' : 'closed'}
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
