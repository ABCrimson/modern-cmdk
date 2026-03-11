'use client';

// packages/command-react/src/command.tsx
// <Command.Root> — compound component root, delegates setup to useCommandSetup
// Keyboard navigation is attached to document — always active (not dialog-gated)
// ES2026: satisfies operator, branded types
// Isolated declarations: explicit return types on all exports

import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import type { CommandMachineOptions } from '../core/index.js';
import { createCommandMachine } from '../core/index.js';
import { CommandActivity } from './activity.js';
import { CommandAsyncItems } from './async-items.js';
import { CommandBadge } from './badge.js';
import { CommandStableContext, CommandStateContext } from './context.js';
import { CommandDialog } from './dialog.js';
import { CommandEmpty } from './empty.js';
import { CommandGroup } from './group.js';
import { CommandHighlight } from './highlight.js';
import { useCommandSetup } from './hooks/use-command-setup.js';
import { CommandInput } from './input.js';
import { CommandItem } from './item.js';
import { CommandList } from './list.js';
import { CommandLoading } from './loading.js';
import { CommandPage } from './page.js';
import { CommandSeparator } from './separator.js';
import { CommandShortcut } from './shortcut.js';

export interface CommandRootProps extends CommandMachineOptions {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly label?: string;
}

/** Root compound component that provides the command state machine context to all children. */
function CommandRoot({
  children,
  className,
  label = 'Command palette',
  ...machineOptions
}: CommandRootProps): ReactNode {
  const rootRef = useRef<HTMLDivElement>(null);

  const { state, handleKeyDown, stableContextValue, stateContextValue } = useCommandSetup(
    () => createCommandMachine(machineOptions),
    label,
  );

  // Scoped keyboard listener — only handles events originating within the command root
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const scopedHandler = (e: KeyboardEvent): void => {
      // Only intercept keys when focus is within the command root element
      if (root.contains(e.target as Node)) {
        handleKeyDown(e);
      }
    };
    document.addEventListener('keydown', scopedHandler);
    return (): void => {
      document.removeEventListener('keydown', scopedHandler);
    };
  }, [handleKeyDown]);

  return (
    <CommandStableContext value={stableContextValue}>
      <CommandStateContext value={stateContextValue}>
        <div
          ref={rootRef}
          data-command-root=""
          data-command-state={state.open ? 'open' : 'closed'}
          className={className}
          role="search"
          aria-label={label}
        >
          {children}
        </div>
      </CommandStateContext>
    </CommandStableContext>
  );
}

/** Compound component namespace */
export const Command: typeof CommandRoot & {
  readonly Input: typeof CommandInput;
  readonly List: typeof CommandList;
  readonly Item: typeof CommandItem;
  readonly Group: typeof CommandGroup;
  readonly Empty: typeof CommandEmpty;
  readonly Loading: typeof CommandLoading;
  readonly Separator: typeof CommandSeparator;
  readonly Dialog: typeof CommandDialog;
  readonly Highlight: typeof CommandHighlight;
  readonly Shortcut: typeof CommandShortcut;
  readonly Badge: typeof CommandBadge;
  readonly Page: typeof CommandPage;
  readonly AsyncItems: typeof CommandAsyncItems;
  readonly Activity: typeof CommandActivity;
} = Object.assign(CommandRoot, {
  Input: CommandInput,
  List: CommandList,
  Item: CommandItem,
  Group: CommandGroup,
  Empty: CommandEmpty,
  Loading: CommandLoading,
  Separator: CommandSeparator,
  Dialog: CommandDialog,
  Highlight: CommandHighlight,
  Shortcut: CommandShortcut,
  Badge: CommandBadge,
  Page: CommandPage,
  AsyncItems: CommandAsyncItems,
  Activity: CommandActivity,
} as const);
