'use client';

// packages/command-react/src/command.tsx
// <Command.Root> — useTransition for search, React Compiler compatible
// Keyboard navigation is attached to the root element, not called as a hook before context
// ES2026: satisfies operator, branded types
// Isolated declarations: explicit return types on all exports

import type { CommandMachineOptions } from '@crimson_dev/command';
import { createCommandMachine } from '@crimson_dev/command';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import { CommandActivity } from './activity.js';
import { CommandAsyncItems } from './async-items.js';
import { CommandBadge } from './badge.js';
import type { CommandContextValue, CommandRootId } from './context.js';
import { CommandContext } from './context.js';
import { CommandDialog } from './dialog.js';
import { CommandEmpty } from './empty.js';
import { CommandGroup } from './group.js';
import { CommandHighlight } from './highlight.js';
import { useCommand } from './hooks/use-command.js';
import { createKeydownHandler } from './hooks/use-keyboard.js';
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
  const rootId = useId() as CommandRootId;
  const listId = `${rootId}-list`;
  const inputId = `${rootId}-input`;
  const rootRef = useRef<HTMLDivElement>(null);

  // Create machine once — stable reference across renders
  const machineRef = useRef<ReturnType<typeof createCommandMachine> | null>(null);
  if (machineRef.current === null) {
    machineRef.current = createCommandMachine(machineOptions);
  }
  const machine = machineRef.current;

  const { state, isPending, updateSearch, setOptimisticActiveId, filteredIdSet, id } =
    useCommand(machine);

  // Dispose machine on unmount — prevents resource leaks (scheduler, emitter, search engine)
  // Nulls the ref so Strict Mode remount creates a fresh machine
  useEffect(() => {
    return (): void => {
      machineRef.current?.[Symbol.dispose]();
      machineRef.current = null;
    };
    // eslint-disable-next-line -- machine is stable ref, dispose runs on unmount only
  }, []);

  // Attach keyboard navigation to the root element — avoids hook-before-context issue
  const handleKeyDown = useCallback(
    createKeydownHandler(machine, () => machine.getState()),
    [],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return (): void => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

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
    <CommandContext value={contextValue}>
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
    </CommandContext>
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
