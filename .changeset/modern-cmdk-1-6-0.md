---
"modern-cmdk": minor
---

The machine does what its documentation says: disabled items stay listed but can no longer be activated or selected, a custom `filter` that returns 0 or less excludes the item, shortcut conflicts are reported, frecency is saved and restored, and a batch of registry events commits one refilter, and every batch at most one `stateChange`. Some of these are visible changes at rest; each one is listed under its heading.

**Disabled items**

- Disabled items are rendered with `aria-disabled` and `data-disabled`, and are skipped in navigation, activation and selection under every query, not only for the empty one (D78; CE-05, ARCH-13, U-10). The new core option `disabledItems: 'hide'` drops them from `filteredIds` in every branch, including the ids a self-indexing `search` engine returns; the default `'show'` keeps them listed.
- Visible differences at rest against 1.5.0, all consequences of listing disabled items: a `Command.Group` that holds only disabled items is shown; `Command.Empty` no longer appears when only disabled items match; `filteredCount`, the results announcement and the virtualization threshold (more than 100 matches on, 50 or fewer off) count disabled items. Use `disabledItems: 'hide'` for the 1.5.0 rendering at the empty query; it also hides disabled items under a typed query, where 1.5.0 listed them.

**Search**

- A custom `filter` that returns `0` or a negative number now excludes the item, as `false` does (ARCH-14). Results from a pluggable `search` engine, including `createSearchEngine({ scorer })`, are used in their order, except that frecency, when enabled, re-ranks them by score plus bonus and `disabledItems: 'hide'` drops disabled items; the engine is not called for an empty query or with `filter: false`.
- The word-boundary tier scores in the open range (0.65, 0.7), by contiguity (`0.03 * squares / qLen^2`) and coverage (`0.02 * qLen / tLen`) on top of 0.65, where every hit scored a flat 0.7; the cover backtracks, and a separator in the query no longer hangs the scorer (CE-35, P19, CE-36, TUB-34). A query over 512 characters skips the word-boundary tier and falls to the fuzzy tier.
- Incremental filtering (re-scoring only the previous matches when the lowercased query extends the previous one) runs with the default scorer only, and compares lowercased queries (CE-37, P06, CE-88, TUB-19, TUB-20). A custom scorer, and a `filter` function, rescan every item on every non-empty query. `SearchEngine.remove()` deletes from the incremental cache in place (P40).
- `SearchResult.matches` are half-open ranges into the original `item.value`, also where lowercasing changes its length (`'İ'`) (P20). A match through `keywords` only reports `matches: []`; when the value matched as well, the value's own ranges stay (D92).
- The scheduler no longer gates on `navigator.scheduling.isInputPending` or `scheduler.yield()`: a batch always runs whole, and the `flush()` of a `createScheduler()` scheduler applies every update pending when it is called (the machine has no `flush()`) (ARCH-44, DAE-76, SPEC-32, CE-34, TUB-13).

**Keyboard shortcuts**

- A disabled item's shortcut is not bound at all: it no longer calls `onSelect` or swallows its key, which stays free for the page and for other items (CE-09). Enabling the item, through `UPDATE_ITEM`, binds it.
- New option `shortcutAction: 'select'` dispatches `ITEM_SELECT` for the item, so the disabled guard, frecency, the `select` event and `options.onSelect` apply; the default `'direct'` stays through 1.x and calls the item's `onSelect` (ARCH-15, ARCH-16).
- The shortcut of an item delivered by `ITEMS_LOADED` is bound (ARCH-16): core items loaded asynchronously had none.
- Conflicts are reported (CE-08, DAE-32, CE-04). The registry keeps a stack of bindings per normalized key: the later binding wins the keydown, disposing it restores the earlier one, `getConflicts()` lists the keys with two or more bindings, and `getBindings()` returns a snapshot of the winning binding of each key. `unregister(key)` removes every binding of the key.
- `unregisterByItem(itemId, keep?)` takes an optional shortcut to keep: re-binding an item's shortcut replaces its binding in place, so a label-only update no longer moves it to the top of the stack (CE-108).

**Machine**

- One refilter and at most one `stateChange` per scheduler batch for registry events (REGISTER, UNREGISTER, UPDATE, `ITEMS_LOADED`, `REGISTER_GROUP`, `UNREGISTER_GROUP`): the machine refilters once at the end of the batch (CE-20, ARCH-24, P05, RA-49). A `SEARCH_CHANGE` still filters when it runs. A `NAVIGATE` or `ITEM_ACTIVATE` that follows a registry event in the same batch refilters first, so navigation reads current ids. The emit order changed: `onOpenChange`, `onSearchChange` and the `openChange` event run while the batch handles its events, before the batch's `stateChange`. An active item survives an `UNREGISTER_ITEM` and `REGISTER_ITEM` of the same id in one batch.
- New event `UPDATE_ITEM` upserts an item in place; `useRegisterItem` sends it, instead of re-registering, when an item's props change (ARCH-20, CE-49).
- `groupedIds` keys follow group priority, lower first; `filteredIds` and navigation are unchanged and React renders groups in JSX order (TUB-06). `Command.Group` counts only its own items for whether it shows (CE-50).
- `UNGROUPED_GROUP_ID` (`'__ungrouped'`) is a public export of the core entry (CE-50).
- The machine reads `loop` and `open` from the exported `DEFAULT_MACHINE_OPTIONS` (CE-72).
- Frecency hydration at an empty query, or with `filter: false`, does nothing: no refilter and no `stateChange` (CE-109).

**Events**

- A throwing `TypedEmitter` listener no longer skips the listeners after it: the error is rethrown from a microtask, as the scheduler does for a failing update, and `emit()` no longer throws synchronously (CE-75). This is a public behaviour change for code that relied on the exception reaching the `emit()` caller.

**Frecency**

- `FrecencyEngine` saves 1000 ms after the last selection (a trailing debounce), when the page becomes hidden (`visibilitychange`) and on `pagehide`, besides `flush()` and dispose; before, it saved only on `flush()` and dispose, and a page reload runs neither (CE-01, CE-15, DG-62, SEC-02, DG-08). It disposes a storage it created only after every save settled.
- `load()` merges into what the engine holds: frequencies add and the later `lastUsed` wins.
- A save waits for the in-flight `load()`, so a selection made before the stored history arrives no longer overwrites it (CE-114); a load that fails leaves the stored history untouched: the engine writes nothing after it (D96).
- A storage passed in `frecency.storage` is the caller's to dispose; the engine disposes only the storage it created (D95). Under React StrictMode the development double-mount no longer leaves `<Command>` with a disposed storage (CE-115).
- The machine handles its frecency load: it re-ranks once the data is hydrated (for a non-empty query with the filter on, the one case frecency re-ranks) and reports a failed load through `console.warn` (CE-14, SEC-27).
- `createCommandMachine()` returns `CommandMachine & AsyncDisposable`: `await using` or `[Symbol.asyncDispose]()` awaits the pending frecency save, then disposes like `[Symbol.dispose]()`; the `CommandMachine` interface is unchanged (CE-02).
- `IdbFrecencyStorage` validates every persisted row (a dropped row is counted in a `console.warn`), reads the v1 payload and the v2 `{ version: 2, records }` envelope and still writes v1; a second `storeName` in an existing database is created instead of failing with `NotFoundError` (SEC-26, CE-60, SEC-35).
- `Symbol.dispose` and `Symbol.asyncDispose` fall back to `Symbol.for('Symbol.dispose')` and `Symbol.for('Symbol.asyncDispose')` where the browser lacks them, before any core class evaluates (CE-30).

**Types**

- `TypedEmitter<T extends object>` accepts an interface as its event map, not only a type alias (TUB-05).

**Styles**

- `user-select` carries its `-webkit-user-select` twin: Safari has no unprefixed support at the 18.4 floor (RA-76).
- The scroll-driven wiring, `scroll-timeline` on the list, the fade edges and the scroll progress bar, sits inside `@supports (animation-timeline: scroll())` (RA-77). `scroll-driven-animations` is supported from Safari 26 and Firefox 159 (Chrome 115; web-features 3.45.0-dev-20261110231328-ed6bd69, published 2026-11-10). At the Safari 18.4 and Firefox 131 floor the effects do not run: the fade edges and the progress bar stay static.

**Size**

- The size budget rises (D90): core 7.4 kB (was 6.5 kB), `modern-cmdk/react` adapter 5.7 kB (was 5.6 kB), core + React 10.85 kB (was 10.1 kB); `modern-cmdk/react/dialog` stays 1.5 kB. Measured at `8c4feee` with size-limit 14.3.0, gzip, recorded in `benchmarks/size-history/1.6.0.json`: core 7321 B (1.5.0: 6399 B), adapter only 5610 B (5539 B), `modern-cmdk/react/dialog` 1422 B (1422 B), `CommandSeparator` only 4884 B (4812 B), core + React 10764 B (10003 B), `styles.css` 3986 B (3959 B). The roadmap restores the 6.5 kB core row in 2.0 by moving `IdbFrecencyStorage` to a `modern-cmdk/frecency` subpath (ARCH-64, `docs/plans/2026-10-31-roadmap-1.3-to-2.0.md`).

**Browser floor**

- The JavaScript of the core and React entries needs Chrome and Edge 122, Firefox 131 and Safari 18.4 (the same numbers on Android and iOS), from `tests/unit/browser-floor.json`: web-features 3.45.0-dev-20261110231328-ed6bd69, published 2026-11-10; the binding feature is `iterator-methods`. A test checks the built entries against that list (CE-29).

**Codemod bin (deprecated)**

- The bundled codemod (`dist/codemod`, the deprecated `modern-cmdk` bin) carries the `data-attrs` fixes of `modern-cmdk-codemod` 1.0.1: attribute names match case-insensitively, with the rewrite writing the lowercase `data-command-*` name (DA-11); Tailwind `group-`, `peer-` and `in-` data variants, with their `-has-` and `not-` forms, are reported and left unchanged: on cmdk elements, instead of being rewritten to `group-data-active:` (DA-12), and in the class lists of other elements of a file that references cmdk, where they went unreported (DA-13). The element's own `data-[selected=true]:` is still rewritten. The submodule discovery fix (SEC-56) does not apply to the bin, because that program applies no `.gitignore`. The bundled codemod is 3153027 B installed (1.5.0: 3150372 B).
