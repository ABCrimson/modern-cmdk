// packages/modern-cmdk/src/react/hooks/use-command-setup.ts
// Shared setup hook — deduplicates machine init, context creation, keyboard handler,
// the latest-props options object, and the suspend/resume lifecycle between <Command> and <Command.Dialog>
// Isolated declarations: explicit return types on all exports

import type { CommandMachine, CommandMachineOptions, CommandState, ItemId } from 'modern-cmdk';
import { createCommandMachine } from 'modern-cmdk';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CommandStableContextValue, CommandStateContextValue } from '../context.js';
import { useCommand } from './use-command.js';
import { createKeydownHandler } from './use-keyboard.js';

// Module-scoped declaration: no @types/node needed, nothing global leaks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };

/** The props the machine reads once, at construction, as values to compare; `INIT_ONLY` names them in order. */
const initOnlyValues = (o: CommandMachineOptions): unknown[] => [
  o.shortcutAction,
  o.frecency?.enabled,
  o.frecency?.storage,
  o.search,
  o.searchEngine,
  typeof o.filter === 'function',
];
const INIT_ONLY = ['shortcutAction', 'frecency', 'frecency', 'search', 'searchEngine', 'filter'];

export interface UseCommandSetupReturn {
  readonly machine: CommandMachine;
  readonly state: CommandState;
  readonly isPending: boolean;
  readonly listId: string;
  readonly inputId: string;
  readonly handleKeyDown: (e: KeyboardEvent) => void;
  readonly stableContextValue: CommandStableContextValue;
  readonly stateContextValue: CommandStateContextValue;
}

/**
 * What the deduped callbacks remember: the last value each forwarded to the consumer, whether the root is live
 * (its layout effect is set up: mounted and not hidden by an `<Activity>`), and the search queries the caller owns
 * that the machine has not processed yet, oldest first. While the root is not live, `activeId` holds the active
 * item the root had when it stopped being live.
 */
interface Forwarded {
  search: string;
  activeId: ItemId | null;
  open: boolean;
  live: boolean;
  owned: string[];
}

/** The deduped members of `Forwarded` and the callback each one forwards to. */
type Deduped = 'search' | 'activeId' | 'open';
type Callback = 'onSearchChange' | 'onActiveChange' | 'onOpenChange';

/**
 * Calls `upsert` for each entry of `after` that is new or a different object than the entry of the same id in
 * `before`, and `remove` for each entry of `before` whose id `after` lacks.
 */
function diffById<T extends { readonly id: string }>(
  before: readonly T[] | undefined,
  after: readonly T[] | undefined,
  upsert: (entry: T) => void,
  remove: (entry: T) => void,
): void {
  if (before === after) return;
  const old = new Map(before?.map((entry) => [entry.id, entry]));
  for (const entry of after ?? []) {
    if (old.get(entry.id) !== entry) upsert(entry);
    old.delete(entry.id);
  }
  for (const entry of old.values()) remove(entry);
}

/**
 * The options object the machine keeps for its whole life: the first render's props, with the callbacks
 * replaced by trampolines over `latest.current` and `activeId`, `loop`, `disabledItems` and `filter` replaced by
 * getters over it, so a prop change after mount reaches them. The engine kind (a custom scorer or the default)
 * is chosen once from the first render's `filter`: a value of the other kind keeps the first render's filter,
 * while `false` and `undefined` share the default engine and switch freely. `onSelect` forwards
 * every call; the others forward a value only when it differs from the last one forwarded (a controlled
 * `activeId` reports every candidate: the caller may have refused the last one), and nothing while the root is
 * not live: a hidden or unmounted root's machine still processes the events its children send as they unmount, and
 * those changes are not choices to report. A module-level function, so no
 * closure here sees the machine: the core's FinalizationRegistry holds this object through the search engine's
 * scorer, and a reference to the machine would keep it alive.
 */
function createLiveOptions(
  latest: { readonly current: CommandMachineOptions },
  fwd: Forwarded,
): CommandMachineOptions {
  const dedupe =
    (key: Deduped, name: Callback) =>
    (value: unknown): void => {
      if (!fwd.live) return;
      if (key === 'search' && fwd.owned[0] === value) {
        fwd.owned.shift();
        fwd[key] = value as never;
        return;
      }
      if (value === fwd[key] && (key !== 'activeId' || latest.current.activeId === undefined))
        return;
      fwd[key] = value as never;
      (latest.current[name] as ((value: unknown) => void) | undefined)?.(value);
    };
  const first = latest.current;
  const options: CommandMachineOptions = {
    ...first,
    get filter(): CommandMachineOptions['filter'] {
      const { filter } = latest.current;
      return (typeof filter === 'function') === (typeof first.filter === 'function')
        ? filter
        : first.filter;
    },
    onSelect: (id: ItemId): void => latest.current.onSelect?.(id),
    onSearchChange: dedupe('search', 'onSearchChange'),
    onActiveChange: dedupe('activeId', 'onActiveChange'),
    onOpenChange: dedupe('open', 'onOpenChange'),
  };
  for (const key of ['activeId', 'loop', 'disabledItems'] as const) {
    Object.defineProperty(options, key, { get: () => latest.current[key], enumerable: true });
  }
  return options;
}

/**
 * Shared setup for Command and Command.Dialog — holds one machine per mount, subscribes via
 * useSyncExternalStore, memoizes context values, and ties the machine's global holds to the
 * component's effects.
 *
 * The machine is created in a null-guarded lazy ref initializer, so StrictMode's second render
 * pass reuses it (a `useState` initializer runs twice and leaks the discarded machine's
 * listeners; react.dev/reference/react/useState). It is suspended at creation: a render React
 * throws away leaves no global listener behind. The layout effect resumes it and its cleanup
 * suspends it again, so StrictMode's replay and an `<Activity>` hide/show (which cleans up and
 * re-creates effects while keeping state; react.dev/reference/react/Activity) keep the same
 * machine with its registrations and query. While the effect is cleaned up (hidden or unmounted) the callbacks
 * `onSearchChange`, `onActiveChange` and `onOpenChange` forward nothing, and an `<Activity>` show puts an uncontrolled
 * root's active item back without a report. The hook never disposes: a suspended machine holds
 * no global reference, and the core's FinalizationRegistry disposes the search engine the
 * machine created once the machine is collected.
 *
 * A change of the `disabledItems` or `activeId` prop calls `machine.refresh()` after the commit's item and group
 * diffs: the machine refilters once over the registry as it then reads, and a controlled `activeId` is mirrored in
 * the state (`null` while that item is not listed or is disabled) without a call to `onActiveChange`.
 *
 * The machine's options object is built once, over a ref that holds the latest props. The ref starts as the
 * first render's props, so a server render (where layout effects never run) reads real props, and a layout
 * effect without dependencies assigns each commit's props, so render writes nothing.
 *
 * @param options - The props that are machine options, from every render. The first render's values initialise
 *   the machine.
 * @param label - Accessible label for the command palette (included in stable context).
 */
export function useCommandSetup(
  options: CommandMachineOptions,
  label: string,
): UseCommandSetupReturn {
  const latest = useRef(options);
  // The first render's props and, in development, the init-only props already warned about
  const [first] = useState(options);
  const [warned] = useState(() => new Set<string>());
  // The last value each deduped callback forwarded; the machine's options object holds it
  const [fwd] = useState<Forwarded>(() => ({
    search: '',
    activeId: null,
    open: false,
    live: false,
    owned: [],
  }));

  // The one render-time ref write: a null-guarded initializer, which react.dev/reference/react/useRef
  // sanctions because the result is always the same and the condition runs only during initialization
  const machineRef = useRef<CommandMachine | null>(null);
  if (machineRef.current === null) {
    // Construction calls no option callback; the memory takes the machine's state once it exists
    const machine = createCommandMachine(createLiveOptions(latest, fwd));
    machine.suspend?.();
    Object.assign(fwd, machine.getState());
    machineRef.current = machine;
  }
  const machine = machineRef.current;

  const { state, isPending, updateSearch, setOptimisticActiveId, filteredIdSet, id } =
    useCommand(machine);

  // `owned` marks a query whose text the caller already holds (a controlled `Command.Input` value): it joins the
  // queue the `onSearchChange` dedupe drops from, in the order the machine processes the events, so the root's
  // `onSearchChange` is not called with the caller's own value, however many changes one frame holds
  const updateOwnedSearch = useCallback(
    (query: string, owned?: boolean): void => {
      if (owned) fwd.owned.push(query);
      updateSearch(query);
    },
    [updateSearch, fwd],
  );

  // Derive list/input IDs from the single useId() in useCommand — coherent with rootId
  const listId = `${id}-list`;
  const inputId = `${id}-input`;

  // Resume in the layout-effect setup, suspend in its cleanup: the layout phase runs before paint, so
  // StrictMode's synchronous replay and an Activity show re-arm the machine before a key can reach it. The
  // cleanup suspends first (that flushes the pending batch while the root is still live, so the consumer hears
  // it), then stops forwarding and takes the machine's active item as the dedupe memory. A hide unmounts the
  // items, which empties the registry and drops the machine's active item; the setup puts the remembered item
  // back (an uncontrolled root: a controlled one mirrors its prop, which the registrations restore) and the dedupe
  // reports nothing for it. StrictMode's replay finds that item still active and sends nothing.
  useLayoutEffect(() => {
    machine.resume?.();
    fwd.live = true;
    if (
      latest.current.activeId === undefined &&
      fwd.activeId !== null &&
      fwd.activeId !== machine.getState().activeId
    )
      machine.send({ type: 'ITEM_ACTIVATE', id: fwd.activeId });
    return (): void => {
      machine.suspend?.();
      fwd.live = false;
      fwd.activeId = machine.getState().activeId;
    };
  }, [machine, fwd]);

  // Every commit: in development, warn about a changed init-only prop; publish the props to the options object, then
  // register what changed. `UPDATE_ITEM` upserts, so it serves a new item and a changed one. StrictMode's replay and
  // a re-render from the machine's own state pass the same arrays, so the diff sends nothing. A change of
  // `disabledItems` or `activeId` is a change of what the machine reads in its refilter, so the effect ends with
  // `machine.refresh()`: one batch slot, queued after the diffs' sends and after the UNREGISTER sends of children
  // unmounted in this commit (their layout cleanups run in the mutation phase, before this effect). Its refilter
  // therefore sees the final registry, and it reports no candidate: the prop is the caller's own change.
  useLayoutEffect(() => {
    // Inline comparison, so a consumer minifier that defines NODE_ENV as "production" folds the branch and drops the
    // warning below; `typeof process` keeps an unbundled browser import (no `process`) from throwing, and there the
    // hook counts as production.
    if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
      const was = initOnlyValues(first);
      const now = initOnlyValues(options);
      INIT_ONLY.forEach((name, i) => {
        if (was[i] === now[i] || warned.has(name)) return;
        warned.add(name);
        // biome-ignore lint/suspicious/noConsole: development-only misuse diagnostic, gated on NODE_ENV
        console.warn(
          `[modern-cmdk] The "${name}" prop is read once, when the component mounts; a later change has no effect. Give the component a new key to apply it.`,
        );
      });
    }
    const previous = latest.current;
    latest.current = options;
    diffById(
      previous.items,
      options.items,
      (item) => machine.send({ type: 'UPDATE_ITEM', item }),
      ({ id }) => machine.send({ type: 'UNREGISTER_ITEM', id }),
    );
    diffById(
      previous.groups,
      options.groups,
      (group) => machine.send({ type: 'REGISTER_GROUP', group }),
      ({ id }) => machine.send({ type: 'UNREGISTER_GROUP', id }),
    );
    if (previous.disabledItems !== options.disabledItems || previous.activeId !== options.activeId)
      machine.refresh?.();
  });

  // Keyboard handler — useMemo (not useCallback) to memoize the factory result
  const handleKeyDown = useMemo(
    () => createKeydownHandler(machine, () => machine.getState()),
    [machine],
  );

  // Stable context — only depends on values that never change after mount
  const stableContextValue = useMemo<CommandStableContextValue>(
    () =>
      ({
        machine,
        rootId: id,
        listId,
        inputId,
        label,
        updateSearch: updateOwnedSearch,
        setOptimisticActiveId,
      }) satisfies CommandStableContextValue,
    [machine, id, listId, inputId, label, updateOwnedSearch, setOptimisticActiveId],
  );

  // State context — changes on every search/navigation
  const stateContextValue = useMemo<CommandStateContextValue>(
    () =>
      ({
        state,
        isPending,
        filteredIdSet,
        visibleIdSet: null,
        virtualPositionMap: null,
      }) satisfies CommandStateContextValue,
    [state, isPending, filteredIdSet],
  );

  return {
    machine,
    state,
    isPending,
    listId,
    inputId,
    handleKeyDown,
    stableContextValue,
    stateContextValue,
  } satisfies UseCommandSetupReturn;
}
