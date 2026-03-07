'use client';

// packages/command-react/src/command.tsx
// <Command.Root> — useTransition for search, React Compiler compatible
// Keyboard navigation is attached to the root element, not called as a hook before context

import type { ReactNode } from 'react';
import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import type { CommandMachineOptions } from '@crimson_dev/command';
import { createCommandMachine } from '@crimson_dev/command';
import type { CommandContextValue } from './context.js';
import { CommandContext } from './context.js';
import { useCommand } from './hooks/use-command.js';
import { createKeydownHandler } from './hooks/use-keyboard.js';
import { CommandActivity } from './activity.js';
import { CommandAsyncItems } from './async-items.js';
import { CommandBadge } from './badge.js';
import { CommandDialog } from './dialog.js';
import { CommandEmpty } from './empty.js';
import { CommandGroup } from './group.js';
import { CommandHighlight } from './highlight.js';
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

function CommandRoot({
  children,
  className,
  label = 'Command palette',
  ...machineOptions
}: CommandRootProps): ReactNode {
  const rootId = useId();
  const listId = `${rootId}-list`;
  const inputId = `${rootId}-input`;
  const rootRef = useRef<HTMLDivElement>(null);

  // Create machine once — stable reference across renders
  const machineRef = useRef<ReturnType<typeof createCommandMachine> | null>(null);
  if (machineRef.current === null) {
    machineRef.current = createCommandMachine(machineOptions);
  }
  const machine = machineRef.current;

  const { state, isPending, updateSearch, setOptimisticActiveId, id } = useCommand(machine);

  // Attach keyboard navigation to the root element — avoids hook-before-context issue
  const handleKeyDown = useCallback(
    createKeydownHandler(machine, () => machine.getState()),
    [machine],
  );

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    // Also listen on document for global keyboard capture
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const contextValue = useMemo<CommandContextValue>(
    () => ({
      machine,
      state,
      isPending,
      updateSearch,
      setOptimisticActiveId,
      rootId: id,
      listId,
      inputId,
      label,
    }),
    [machine, state, isPending, updateSearch, setOptimisticActiveId, id, listId, inputId, label],
  );

  return (
    <CommandContext value={contextValue}>
      <div
        ref={rootRef}
        data-command-root=""
        data-command-state={state.open ? 'open' : 'closed'}
        className={className}
        role="application"
        aria-label={label}
      >
        {children}
      </div>
    </CommandContext>
  );
}

/** Compound component namespace */
export const Command = Object.assign(CommandRoot, {
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
});
