// packages/modern-cmdk/src/react/dialog.tsx
// <Command.Dialog> — Radix Dialog.Root + Dialog.Portal + Dialog.Overlay + Dialog.Content
// The dialog is modal (Radix's default): while it is open Radix hides the rest of the page from
// assistive technology with aria-hidden on the content's siblings (hideOthers), traps focus in the
// content and locks scroll (RemoveScroll)
// styles.css declares @starting-style entries for the overlay and the content; they are inert
// until DT-19
// Isolated declarations: explicit return types on all exports

import type { CommandMachineOptions } from 'modern-cmdk';
import { Dialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CommandStableContext, CommandStateContext } from './context.js';
import { useCommandSetup } from './hooks/use-command-setup.js';

export interface CommandDialogProps extends CommandMachineOptions {
  readonly children?: ReactNode | undefined;
  readonly className?: string | undefined;
  readonly overlayClassName?: string | undefined;
  readonly contentClassName?: string | undefined;
  readonly label?: string | undefined;
  /**
   * Controlled open state. When defined, the dialog is open exactly while it is `true`: a request to open or close
   * calls `onOpenChange` and changes nothing else, so the parent decides, and a parent that keeps `open={true}`
   * keeps the dialog open. Leave it `undefined` and the dialog starts closed: nothing the component renders or binds
   * opens it (no trigger, no open shortcut), so pass `open`.
   */
  readonly open?: boolean | undefined;
  /**
   * Called with the next open state. For a controlled dialog it reports each request once: the user's (Escape, a
   * click outside, the overlay) and the palette's own (an item selection that closes it, `CLOSE`, `OPEN` or
   * `TOGGLE` from a shortcut or a consumer's `send`). A dialog that drops its `open` prop after mount is uncontrolled
   * and reports each change of its open state. A change of the `open` prop does not call it.
   */
  readonly onOpenChange?: ((open: boolean) => void) | undefined;
  /** Accessible description for screen readers (default: 'Type a command or search...') */
  readonly description?: string | undefined;
  /** Container element for the portal (default: document.body) */
  readonly container?: HTMLElement | null | undefined;
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
  // The machine reads `open` once, at construction, and the effect below makes it follow the prop afterwards, so
  // the setup gets the first render's value on every render: its init-only warning for `open` stays silent here.
  const [initialOpen] = useState(controlledOpen ?? false);
  // The open state the effect below last asked the machine for. The machine applies a request on its next batch (a
  // frame in a browser), so when `open` changes again before then it still reports the earlier request: a report equal
  // to the marker is the machine following the prop and is not forwarded. Every report clears the marker.
  const followed = useRef<boolean | undefined>(undefined);
  // The machine reports every change of its open state. An uncontrolled dialog hands that report to the consumer. A dialog
  // mounted without `open` never opens (RA-85, DG-21); one that drops its `open` prop after mount is uncontrolled and
  // reaches this path (CE-118). A
  // controlled dialog hands it over only when it differs from `open` and is not the machine following the prop: the
  // machine's own request (a selection that closes, CLOSE, OPEN, TOGGLE) is reported once, while the machine following
  // the prop (the effect below) and the put-back of a state the parent refused report nothing. Radix's request goes
  // through handleRadixOpenChange.
  const { machine, state, handleKeyDown, stableContextValue, stateContextValue } = useCommandSetup(
    {
      ...machineOptions,
      open: initialOpen,
      onOpenChange:
        controlledOpen === undefined
          ? onOpenChange
          : (next: boolean): void => {
              const following = next === followed.current;
              followed.current = undefined;
              if (next !== controlledOpen && !following) onOpenChange?.(next);
            },
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

  // A controlled dialog's machine follows the prop. Each committed machine state is a dependency, so that a state the
  // prop did not ask for is put back after it is reported, also when another request lands in the put-back frame and
  // the batch ends where it began; sending the state the machine already has changes nothing.
  useEffect(() => {
    if (controlledOpen !== undefined && controlledOpen !== state.open) {
      followed.current = controlledOpen;
      machine.send({ type: controlledOpen ? 'OPEN' : 'CLOSE' });
    }
  }, [controlledOpen, state, machine]);

  // Prevent Radix default focus — auto-focus the command input instead. The lookup starts at the dialog content, so
  // a portal container inside a shadow root finds the input (document.getElementById does not pierce a shadow root).
  const handleOpenAutoFocus = useCallback((e: Event): void => {
    e.preventDefault();
    contentRef.current?.querySelector<HTMLElement>('[data-command-input]')?.focus();
  }, []);

  // Radix reports the user's request to open or close the dialog. A controlled dialog hands it to the consumer and
  // waits for the prop; an uncontrolled one applies it, and the machine reports the change. Radix asks only to close an
  // open dialog, so this branch serves a dialog that dropped its `open` prop (CE-118); a dialog mounted without `open`
  // never opens (RA-85, DG-21).
  const handleRadixOpenChange = useCallback(
    (next: boolean): void => {
      if (controlledOpen !== undefined) onOpenChange?.(next);
      else machine.send({ type: next ? 'OPEN' : 'CLOSE' });
    },
    [controlledOpen, onOpenChange, machine],
  );

  // The registry's root for shortcutScope 'root': the inner root div, set while it is mounted
  const rootRef = useCallback(
    (root: HTMLDivElement): (() => void) => {
      machine.getKeyboardRegistry().setRoot(root);
      return (): void => machine.getKeyboardRegistry().setRoot(null);
    },
    [machine],
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
                <div data-command-root="" ref={rootRef} role="search" aria-label={label}>
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
