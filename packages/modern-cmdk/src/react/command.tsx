// packages/modern-cmdk/src/react/command.tsx
// <Command> — compound component root, delegates setup to useCommandSetup
// Keyboard navigation is the root div's React `onKeyDown` (handleRootKeyDown): the caller's `onKeyDown`
// runs first and the palette handles only events that originate inside the root's DOM. The caller's
// other div props and ref reach the root element.
// Isolated declarations: explicit return types on all exports

import type { CommandMachineOptions } from 'modern-cmdk';
import type { ComponentPropsWithRef, KeyboardEvent, ReactNode } from 'react';
import { useCallback } from 'react';
import { CommandActivity } from './activity.js';
import { CommandAsyncItems } from './async-items.js';
import { CommandBadge } from './badge.js';
import { CommandStableContext, CommandStateContext } from './context.js';
import { CommandDialog } from './dialog.js';
import { CommandEmpty } from './empty.js';
import { CommandGroup } from './group.js';
import { CommandHighlight } from './highlight.js';
import { useCommandSetup } from './hooks/use-command-setup.js';
import { handleRootKeyDown } from './hooks/use-keyboard.js';
import { CommandInput } from './input.js';
import { CommandItem } from './item.js';
import { CommandList } from './list.js';
import { CommandLoading } from './loading.js';
import { CommandPage } from './page.js';
import { CommandSeparator } from './separator.js';
import { CommandShortcut } from './shortcut.js';

/**
 * The machine options plus every attribute and the `ref` of a `div`, which reach the root element. The
 * caller's `onKeyDown` runs before the palette's own key handling, and a key it default-prevents is left
 * to it. The root's own `data-command-root`, `data-command-state`, `role` and `aria-label` come after
 * the caller's attributes and win; `label` is the accessible name (`aria-label`).
 */
export interface CommandRootProps
  extends CommandMachineOptions,
    Omit<ComponentPropsWithRef<'div'>, keyof CommandMachineOptions | 'children'> {
  readonly children?: ReactNode | undefined;
  readonly className?: string | undefined;
  readonly label?: string | undefined;
  /**
   * Which elements inside the root drive the palette's keys. `'root'` (the default) handles them from
   * any element inside the root; `'combobox'` only from `Command.Input`, so a button, link or field
   * inside the palette keeps its own keys. In development `'root'` warns once when it handles a key
   * from another interactive element.
   */
  readonly keyboardScope?: 'root' | 'combobox' | undefined;
}

/** Root compound component that provides the command state machine context to all children. */
function CommandRoot({
  ref,
  children,
  label = 'Command palette',
  keyboardScope,
  onKeyDown,
  items,
  groups,
  filter,
  open,
  frecency,
  searchEngine,
  search,
  onSelect,
  onActiveChange,
  activeId,
  onOpenChange,
  onSearchChange,
  loop,
  disabledItems,
  shortcutAction,
  shortcutScope,
  shortcutsInEditable,
  virtualizeThreshold,
  telemetry,
  ...divProps
}: CommandRootProps): ReactNode {
  // Every machine option except `label` (the root's own prop): a key CommandMachineOptions gains makes this
  // literal fail to compile until it is destructured above, so it cannot fall into the div spread
  const machineOptions = {
    items,
    groups,
    filter,
    open,
    frecency,
    searchEngine,
    search,
    onSelect,
    onActiveChange,
    activeId,
    onOpenChange,
    onSearchChange,
    loop,
    disabledItems,
    shortcutAction,
    shortcutScope,
    shortcutsInEditable,
    virtualizeThreshold,
    telemetry,
  } satisfies Record<Exclude<keyof CommandMachineOptions, 'label'>, unknown>;

  const { machine, state, handleKeyDown, stableContextValue, stateContextValue } = useCommandSetup(
    machineOptions,
    label,
  );

  // The root element's ref: gives the element to the shortcut registry (the bound of
  // `shortcutScope="root"`) and forwards it to the caller's `ref`. A ref callback may return a
  // cleanup function (node_modules/@types/react/index.d.ts, `RefCallback`, line 176); React then
  // skips the `null` call, so the cleanup clears the registry's root and releases the caller's ref:
  // an object ref gets `null`, a function ref runs its own cleanup or, returning none, is called
  // with `null`.
  const rootRef = useCallback(
    (root: HTMLDivElement): (() => void) => {
      machine.getKeyboardRegistry().setRoot(root);
      const release = typeof ref === 'function' ? ref(root) : undefined;
      if (ref && typeof ref === 'object') ref.current = root;
      return (): void => {
        machine.getKeyboardRegistry().setRoot(null);
        if (typeof release === 'function') release();
        else if (typeof ref === 'function') ref(null);
        else if (ref) ref.current = null;
      };
    },
    [machine, ref],
  );

  return (
    <CommandStableContext value={stableContextValue}>
      <CommandStateContext value={stateContextValue}>
        <div
          {...divProps}
          ref={rootRef}
          onKeyDown={(e: KeyboardEvent<HTMLDivElement>): void =>
            handleRootKeyDown(e, handleKeyDown, keyboardScope, onKeyDown)
          }
          data-command-root=""
          data-command-state={state.open ? 'open' : 'closed'}
          role="search"
          aria-label={label}
        >
          {children}
        </div>
      </CommandStateContext>
    </CommandStableContext>
  );
}

/**
 * Compound component namespace. The `Object.assign` call below carries a pure annotation: its only effect is on
 * `CommandRoot`, which is reachable only through `Command`, so a bundle that imports one part (such as
 * `CommandSeparator`) drops the root and every other component the statics reference.
 */
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
} = /* @__PURE__ */ Object.assign(CommandRoot, {
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
