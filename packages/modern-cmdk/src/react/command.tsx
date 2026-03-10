'use client';

// packages/command-react/src/command.tsx
// <Command.Root> — useTransition for search, React Compiler compatible
// Keyboard navigation is attached to the root element, not called as a hook before context
// ES2026: satisfies operator, branded types
// Isolated declarations: explicit return types on all exports

import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { CommandMachineOptions } from '../core/index.js';
import { createCommandMachine } from '../core/index.js';
import { CommandActivity } from './activity.js';
import { CommandAsyncItems } from './async-items.js';
import { CommandBadge } from './badge.js';
import type {
  CommandStableContextValue,
  CommandStateContextValue,
} from './context.js';
import { CommandStableContext, CommandStateContext } from './context.js';
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
  const rootRef = useRef<HTMLDivElement>(null);

  // Create machine once — stable reference across renders
  const machineRef = useRef<ReturnType<typeof createCommandMachine> | null>(null);
  if (machineRef.current === null) {
    machineRef.current = createCommandMachine(machineOptions);
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
    // eslint-disable-next-line -- machine is stable ref, dispose runs on unmount only
  }, []);

  // Attach keyboard navigation to the root element — avoids hook-before-context issue
  // useMemo (not useCallback) — we memoize the factory result, not a function reference
  const handleKeyDown = useMemo(
    () => createKeydownHandler(machine, () => machine.getState()),
    [machine],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return (): void => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

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
