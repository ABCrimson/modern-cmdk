# modern-cmdk

## 1.7.1

### Patch Changes

- [#74](https://github.com/ABCrimson/modern-cmdk/pull/74) [`8afb0c6`](https://github.com/ABCrimson/modern-cmdk/commit/8afb0c6939df68abe58289781b4e325d72c29a20) Thanks [@ABCrimson](https://github.com/ABCrimson)! - Hovering over `Command`, its parts and their props in your editor now shows a description in more places, and three messages are reworded: the error for a part used outside the palette, the frecency save warning and the deprecated bin's warning. The npm page, the package description, the homepage and the keywords are rewritten, and the deprecated `modern-cmdk` bin's `--help` lists the transforms in the order to run them. Nothing changes in how the palette behaves.
  
  **Changed**
  
  - Hovering `ItemId` or `GroupId` shows its description; it used to show nothing.
  - Hovering `Command` shows what it is and lists its parts (`Command.Input`, `Command.List`, `Command.Item` and the rest) in place of a note about bundlers.
  - `value`, `keywords`, `disabled` and `shortcut` on `Command.Item` have a description, and so do the props of `Command.Dialog`, `Command.List`, `Command.Input` and most of the other parts; what `useCommand` returns; the options and rows of `useVirtualizer`; `TelemetryMiddleware`; and the machine's `getState`, `send`, `getRegistry` and `getKeyboardRegistry`.
  - The error for a part used outside the palette now names both `<Command>` and `<Command.Dialog>`.
  - The frecency save warning reads `[modern-cmdk] frecency save failed:`, like the load warning.
  - The `modern-cmdk` bin's deprecation warning says that the bin is deprecated and points to `npx modern-cmdk-codemod`, without naming a version.
  - The `modern-cmdk` bin is built from the source of `modern-cmdk-codemod`, so its `--help` numbers the four transforms in run order (`should-filter`, `forward-ref`, `data-attrs`, `import-rewrite`), lists the options in the order of the `modern-cmdk-codemod` README table, and says once that `--dry-run` prints a unified diff of every file that would change. Its unknown-transform error lists the transforms in the same order.
  - The `description` field is the same one-sentence summary the README opens with, instead of a slogan that claimed more than anyone can measure.
  - The `homepage` field points to the documentation site instead of the repository's README.
  - The `keywords` list grows from 7 to 18 terms (`combobox`, `wai-aria`, `fuzzy-search`, `frecency`, `keyboard-shortcuts` and others), so the package turns up for what it does.
  - The README opens with the project image and a one-line install, then a Quick start, a short feature list with a docs link for each, a dialog sample, a core sample that needs no React, the entry points and their options, the migration path from cmdk, the sizes with the record they come from, and the requirements (now including the TypeScript floor).
  
  **Fixed**
  
  - The Quick start binds its shortcut: the key goes on the `Command.Item` through `shortcut`, and `Command.Shortcut` only displays it. The old sample put `Command.Shortcut` inside items that had no `shortcut`, so Mod+C and Mod+V never fired.
  - The dialog sample matches the key with `matchesShortcut(event, parseShortcut('Mod+K'))`, so it works with Caps Lock on, and removes its listener through an `AbortController`. The old sample compared `event.key` to a lowercase `k`.
  - The codemod example runs `should-filter` first, matching the order the text gives.
  - The size table keeps the 1.7.0 record's gzip figures, says what was measured, and drops the release candidate's tarball totals and the commit hashes from the prose.
  - The README no longer carries a repository-internal ledger id or a promise about a future version, and it links cmdk to its repository.
  
  A test of yours that matches the old error or warning text needs the new text.

## 1.7.0

### Minor Changes

- [#70](https://github.com/ABCrimson/modern-cmdk/pull/70) [`87d68a5`](https://github.com/ABCrimson/modern-cmdk/commit/87d68a5f2d69c1bf244b5693320589676c121f45) Thanks [@ABCrimson](https://github.com/ABCrimson)! - The palette's lifecycle, ids and telemetry are specified and tested: the open state is idempotent, one machine lives per mount through React StrictMode and `<Activity>`, `dispose()` is terminal, an `id` on an item or group is its registration id, and the machine reports telemetry itself. Production bundles drop the development-only code. Some of these are visible changes at rest; each one is listed under its heading, the deprecations and the 2.0 notes at the end.
  
  **Open state and Command.Dialog**
  
  - `OPEN` while open and `CLOSE` while closed no longer emit `openChange` or call `onOpenChange`, so a controlled `Command.Dialog` gets no echo at mount or on a redundant close (CE-48, ARCH-18, CE-117, DGX-CD-5).
  - One Escape in `Command.Dialog` calls `onOpenChange(false)` once: Radix owns Escape inside the dialog, and the keydown handler skips an Escape that is already default-prevented (CE-118, RA-34).
  - A controlled `Command.Dialog` follows its `open` prop: a parent that keeps `open={true}` keeps the dialog open after Escape or an outside click (RA-35, DG-20).
  - A controlled `Command.Dialog` reports the palette's own open and close requests (a selection that closes, `CLOSE`, `OPEN` or `TOGGLE` from a shortcut or `send`) once through `onOpenChange` and keeps the `open` you pass (D109).
  - A controlled `Command.Dialog` whose parent closes it before the machine has followed its opening stays closed and reports nothing, and a refused close is put back even when a second request lands in the put-back frame (RA-80, RA-81).
  - `Command.Dialog` focuses its input when the portal container is inside a shadow root (RA-X3).
  
  **Lifecycle: StrictMode, Activity, dispose**
  
  - `<Command>` and `Command.Dialog` keep one machine per mount through React StrictMode and `<Activity>`: the query, registrations and item shortcuts survive, and input typed before the first re-render reaches the live machine (RA-03, ARCH-19, CE-124).
  - `<Command>` keeps its active item across an `<Activity>` hide and show, and reports nothing while hidden or after unmount (D106).
  - `dispose()` is terminal: a disposed machine refuses every later event and a batch that a listener disposes stops without committing; `suspend()` and `resume()` are the pause (D107, CE-113, CE-78, CE-107). A machine used again after dispose, which 1.6 tolerated, does nothing.
  - A throw in the frecency hydration refilter surfaces as an uncaught exception, like one in a `send()` batch (CE-110).
  
  **Props read after mount**
  
  - Callbacks and `loop`, `filter`, `disabledItems`, `items` and `groups` given to `<Command>` and `Command.Dialog` take effect after mount; `onSearchChange` and `onActiveChange` fire only on a change (RA-04, RA-21, ARCH-17).
  - A `disabledItems` change re-registers nothing: an item removed in the same render stays removed (I-1).
  - A `filter` prop change refilters the current query, so swapping the filter under a typed query updates the results without another keystroke (M-1).
  - Changing `open` on a plain `<Command>` warns in development that it is read once.
  
  **Active item and input**
  
  - A controlled `activeId` is the active item while that id is listed and enabled, and `activeId={null}` leaves no active item; every candidate the palette would choose is reported through `onActiveChange`, repeats included (ARCH-29, D106).
  - Hovering a `Command.Item` activates it directly: no render shows the previous item after the hovered one, and `Command.Loading` (an `aria-live` region) no longer mounts for a render on every pointer move (RA-16, ARCH-27, P27, RA-23). `useCommand().isPending` is always `false` and `setOptimisticActiveId(id)` activates `id`; both are deprecated and removed in 2.0.
  - A controlled `Command.Input` `value` is not echoed through the root's `onSearchChange`.
  - `useCommandState` with a selector that returns a fresh object no longer loops to "Maximum update depth exceeded" (RA-36).
  
  **Search engine and production builds**
  
  - The machine disposes only a search engine it created; one you pass is yours to dispose (D103).
  - A production build (`process.env.NODE_ENV` defined as `"production"`) drops modern-cmdk's development-only code: the search engine's leak warning, the init-only prop warnings and the devtools bridge's registry code no longer ship to production bundles, and they stay on in a development build without a `process` global such as Vite's dev server (PERF-15).
  - `modern-cmdk-search-wasm`: its development-only warnings (the TypeScript-scorer fallback, a failed worker request, the main-thread fallback) no longer ship to production bundles (PERF-15).
  - The `Command` namespace object is marked pure, so a bundle that imports only individual components (for example `CommandSeparator`) no longer carries the whole adapter (D116).
  
  **Item and group ids, AsyncItems**
  
  - `Command.Item`, `Command.Group`, `useRegisterItem` and `useRegisterGroup` take an `id` prop or option that sets the registration id (and, on Item and Group, the DOM id); `forceId` is a deprecated alias, removed in 2.0, and `id` wins when both are given (a development warning names the conflict) (D29).
  - A consumer `id` on `Command.Item` or `Command.Group`, which was only a DOM id in 1.6, is now the registration id: `onActiveChange`, `activeId` and the registry report it, and two items with the same consumer `id` collide. On Group, `forceId` alone sets no DOM id; on Item it does (D29).
  - `Command.AsyncItems` keeps one registration per id: each resolved batch replaces the previous one in the registry and the search index, unmounting removes it, and a `Command.Item id={item.id}` rendered for a loaded item is the same entry, with its own `onSelect` and keywords; a development warning fires once for a `Command.Item` inside AsyncItems whose `value` matches a loaded item but which passes no `id` (ARCH-12, RA-18, DGX-ASYNC-4, CE-120).
  - AsyncItems: a promise swap outside a transition re-suspends, and the old batch leaves the registry while the new one loads; wrap the swap in `startTransition` to keep the old results registered and on screen until the new batch resolves (DGX-ASYNC-4).
  - AsyncItems: a `Command.Item id={item.id}` that the render prop stops rendering removes that loaded entry from the registry, even while its batch is still loaded (ARCH-12).
  - AsyncItems: loaded ids must be unique across `Command.AsyncItems` sources in one palette: a new batch in one source removes an id that another source still holds (RA-18, DGX-ASYNC-4).
  - A registered item reads its latest `data` through a getter, so a custom filter sees new data without a re-registration (RA-39).
  - A search engine that copies items when it indexes keeps the `data` it copied; re-index it to see new `data` (RA-39).
  
  **Item props, groups and separators**
  
  - `Command.Item` takes `propsMerge?: 'override' | 'compose'`: `'override'` (the 1.x default) keeps today's spread order; `'compose'` runs your `onClick`/`onPointerMove` first and then selects or activates unless the event is default-prevented, merges your `style` under the virtual position, and keeps the `id`, `role` and `aria-*` the item manages; the default becomes `'compose'` in 2.0 (RA-13).
  - `propsMerge="compose"`: the `aria-selected`, `aria-disabled` and `aria-keyshortcuts` the item manages, and the `data-*` attributes it sets, win over the consumer's even when the item sets no value; a consumer `onPointerMove` that calls `preventDefault()` blocks hover activation (RA-13).
  - `Command.Group` renders one element tree and hides a group without a match with `display: none`, so its children stay mounted across a match/no-match toggle; the hidden group element and its heading stay in the DOM (RA-05).
  - A hidden `Command.Group` now carries the consumer's props, `className` and `ref`, `role="group"` and `data-command-group` (before, it was a bare `div` and the ref was not attached): `[data-command-group]` selectors count hidden groups, the ref holds the element while hidden, and a consumer `display` is overridden with `none` while hidden (RA-05).
  - `Command.Separator` takes `alwaysRender?: boolean`, default `true` in 1.x: with `alwaysRender={false}` it renders nothing while the search is non-empty (cmdk's rule); the default becomes `false` in 2.0 (RA-45, D101).
  
  **Shortcuts and server rendering**
  
  - `parseShortcut(shortcut, platform?)` and `formatShortcut(parsed, platform?)` take an optional `ShortcutPlatform` (`'mac' | 'other'`, exported as a type), and the platform is detected when the function is called, not when the module loads (CE-13).
  - `Command.Shortcut` renders the neutral (`'other'`) text on the server and in the hydration pass and the detected platform's text on the client, so hydration under macOS no longer mismatches (RA-19).
  - Server HTML and the hydration pass list the items and groups that register in effects: an item or group the registry does not hold yet renders under an empty query, and `Command.Empty` and the list's live-region text render only after hydration (RP-31).
  - RP-31 puts every item in the server HTML (nothing virtualizes on the server: 10,000 items give about 1.1 MB of HTML and settle after hydration in about 118 ms against 99 ms in 1.6, headless Chromium, N=5), and a group without items shows its heading in the server HTML until hydration hides it (RP-31).
  
  **Lists, virtualization and refs**
  
  - `Command.List` keeps one element tree across the 100-match virtualization threshold, so crossing it no longer unmounts and re-registers every item; `--command-list-height` keeps its last non-virtual value while the list is virtual (CE-123, RA-78).
  - In a virtualized list the active row scrolls only when it is not fully in view, with `nearest` alignment, and an active row under the pointer is not scrolled to; `useVirtualizer().scrollToIndex(index, align?)` takes `'start'` (the default, unchanged) or `'nearest'` (CE-119).
  - The active-row scroll skips a row under the pointer in non-virtual lists too (no `scrollIntoView` for a hovered row), and a keyboard step onto the row under a resting pointer leaves it where it is, even when it is partly outside the view (CE-119).
  - `Command.List` forwards a changing `ref` prop (a new inline callback re-attaches) and honours a callback ref's returned cleanup; `Command.Item`, `Command.List` and `useRegisterItem` write no refs while rendering (RA-58).
  - `CommandPageProps.id` is typed `string`; `CommandPageId` is a deprecated `string` alias, removed in 2.0 (RA-62).
  - Every optional React prop and hook option accepts an explicit `undefined` under `exactOptionalPropertyTypes` (ARCH-30); the `useCommandDevtools` options follow with C3.
  
  **Telemetry**
  
  - `createCommandMachine` takes a `telemetry` option (`CommandTelemetryHooks`), and `<Command>` and `<Command.Dialog>` take it as a prop. The machine calls the hooks once per batch, at its end, after its own state reports (`onSearchChange`, `onActiveChange`, `onOpenChange`, the `stateChange` subscribers), in the order open, search, selects, close:
    - `onPaletteOpen` and `onPaletteClose` report transitions of the committed open state from a closed start. A batch that opens and closes again reports nothing.
    - A machine created with `open: true` reports one `onPaletteOpen` at its first commit (for a React root, its first item registration or input; with neither, its first event). A palette unmounted while open reports no close: a `Command.Dialog` rendered as `{show && <Command.Dialog open>}` reports an open at each mount and no close. A plain `<Command>` starts closed unless its `open` prop is true.
    - `onSearchComplete(query, resultCount, durationMs)` fires once per batch in which a `SEARCH_CHANGE` changed the committed query. It carries the filtered count the batch ends with and the milliseconds from the batch's first `SEARCH_CHANGE`. A controlled `Command.Input` re-sending the committed query (at an `<Activity>` show, at a dialog open, twice under StrictMode) reports nothing; one that mounts with a value other than the committed query reports that change once.
    - `onItemSelected(itemId, query, position)` fires for each select of an enabled item. `position` is the index in the filtered list the batch ends with, or -1.
    - A hook that throws loses only the later telemetry calls of its batch, never a state report.
    - The React roots forward the latest prop without a remount.
    - `createTelemetryMiddleware` keeps its signature and is the standalone helper for callers that drive the hooks themselves; the machine does not use it. (CE-18, ARCH-32; D112, D113, D114)
  - Known edges of the telemetry option:
    - A controlled `Command.Dialog` whose parent refuses a close the palette itself made (a `CLOSE` or `TOGGLE` send) reports a close and then a new open, because the machine's state closes and is put back; a refused Escape or outside click reports nothing.
    - `onItemSelected`'s position is read from the filtered list the batch ends with, so a filter change later in the same batch moves it.
    - Telemetry follows the machine, not the root's visibility: a hidden `<Activity>` root's machine still reports a consumer's own sends to it (D114).
    - A hook that flushes the machine synchronously (for example `suspend()`) runs a nested batch inside the report: an open that batch reports restamps the session, so the outer batch's close reports a shorter duration.
    - A hook that throws is rethrown on its own microtask, so a refilter's error in the same commit still reaches the scheduler's rethrow (D112).
  - Telemetry durations use the monotonic clock. The open-to-close duration and `onSearch`'s duration are `performance.now()` differences, so a wall-clock step no longer yields a negative or wrong duration. `TelemetryMiddleware.onSearch`'s `startTime` is documented as a `performance.now()` reading. (CE-74, SEC-47)
  - Deprecation: through 1.x, a `startTime` from `Date.now()` (any value above 1e12) is still measured against `Date.now()`, as the 1.x docs describe. This compatibility branch is removed in 2.0, where `startTime` must be a `performance.now()` reading. (CE-74, LD-05; G-56)
  - The telemetry header and JSDoc describe the wiring that exists. The "open->select latency" and "zero overhead" claims are gone, and both examples report the result count instead of the raw query. With no `telemetry` option the machine calls no hook. It still reads `performance.now()` once at a batch's first `SEARCH_CHANGE` and once at the end of a batch whose committed open state turned open; a duration is read at a batch's end only for a hook that is set. (CE-19, CE-92, SEC-47)
  
  **Devtools**
  
  - `useCommandDevtools` publishes on `globalThis.__MODERN_CMDK_DEVTOOLS__` and dispatches a `modern-cmdk-devtools` event. `globalThis.__CRIMSON_COMMAND_DEVTOOLS__` (the same Map) and the `crimson-command-devtools` event (the same `detail`) stay as deprecated aliases through 1.x and are removed in 2.0. Unmount removes the label from the registry under both names. (D30, SEC-32)
  - `useCommandDevtools(label, { redactQuery: true })` publishes the query's length instead of the query, in the registry and in both events, and a change of the flag after mount takes effect. The default is `false` in 1.x and becomes `true` in 2.0 (D101). The hook and its effect ship in every build. In production the effect returns at once: where `process.env.NODE_ENV` is `'production'`, and where no bundler replaced it and no `process` global exists. A production bundle drops the registry code. (SEC-32)
  - `useCommandDevtools` dispatches one event per name for each state change, carrying the new state. It no longer fires twice (first with the previous state) or resubscribes on every change. (RA-48)
  - `useCommandDevtools`'s options accept `redactQuery: undefined` under `exactOptionalPropertyTypes`. (ARCH-30, C3's share)
  
  **New API**
  
  - minor: `CommandMachine.suspend()` and `resume()` release and re-take the machine's global holds without ending it (D102).
  - minor: `CommandMachine.refresh()` refilters with the current options (`activeId`, `disabledItems`, `filter`) and reports no candidate; the React root calls it when those props change (D106).
  - minor: the `searchEngine` option names the search engine, and `search` is deprecated (ARCH-29, D103).
  - minor: a controlled `activeId` option on the machine and on `<Command>` (ARCH-29).
  - minor: `Command.Input` takes a controlled `value` (ARCH-29).
  - minor: the `<Command>` root forwards div props and its `ref` (RA-32).
  - minor: `CommandStableContextValue['updateSearch']` takes an optional `owned` flag: a query the caller already holds (a controlled `Command.Input` value) is not reported back through the root's `onSearchChange`.
  
  **Deprecations**
  
  Each is deprecated in 1.7.0 and removed in 2.0.
  
  - `forceId` on `Command.Item`, `Command.Group`, `useRegisterItem` and `useRegisterGroup`: use `id` (D29).
  - `useCommand().isPending` and `setOptimisticActiveId`: `isPending` is constant `false`, so read `state.loading` for the machine's loading state; send `ITEM_ACTIVATE` through the machine instead of `setOptimisticActiveId(id)` (D104).
  - The `search` option of `createCommandMachine`: use `searchEngine`, which wins when both are set (D103).
  - The devtools global `globalThis.__CRIMSON_COMMAND_DEVTOOLS__` and the `crimson-command-devtools` event: use `globalThis.__MODERN_CMDK_DEVTOOLS__` and the `modern-cmdk-devtools` event.
  - `CommandPageId`: use `string`.
  
  **Planned for 2.0**
  
  - `createTelemetryMiddleware`'s `onSearch` stops accepting a `Date.now()` `startTime` (a value above 1e12); `startTime` must be a `performance.now()` reading (G-56, D114, D117).
  - `Command.Item`'s `onSelect` stays `() => void` through 1.x; receiving the item value is a 2.0 change (D66, ARCH-62).
  - The defaults `propsMerge: 'override'`, `Command.Separator`'s `alwaysRender: true` and `useCommandDevtools`'s `redactQuery: false` change to `'compose'`, `false` and `true` (D101; `propsMerge`: RA-13, the 2.0 roadmap's behaviour-defaults row).
  - After a search change the active item is kept while it is still listed and enabled, else the first enabled item of the ranked list becomes active; whether a changed query makes the top-ranked match active, as cmdk does, is ARCH-65 (2.0).
  
  **Size**
  
  - The size budget rises (D99, D115): core 7.84 kB (was 7.4 kB), `modern-cmdk/react` adapter 6.59 kB (was 5.7 kB), `modern-cmdk/react/dialog` 2.2 kB (was 1.5 kB), core + React 12.13 kB (was 10.85 kB); the `CommandSeparator`-only row falls to 390 B (was 5 kB). Measured at `a7838c9` with size-limit 14.3.0, gzip, recorded in `benchmarks/size-history/1.7.0.json`: core 7742 B (1.6.0: 7321 B), adapter only 6491 B (5610 B), `modern-cmdk/react/dialog` 2104 B (1422 B), `CommandSeparator` only 293 B (4884 B), core + React 12038 B (10764 B), `styles.css` 3986 B (3986 B). The 1.7.0 rows measure the production bundle, `process.env.NODE_ENV` defined as `"production"` in `.size-limit.mjs`, which is what a consumer bundler produces (D105); the 1.6.0 rows did not apply the define. The rows rise with the fixes of this release (the latest-props callbacks, live getters and items diff of the root, the `id` registration, `Command.AsyncItems`, `propsMerge`, the single List tree, the telemetry option) and the `CommandSeparator` row falls because the `Command` namespace object is marked pure (D116).
  
  **Documentation**
  
  - The package README no longer claims React Compiler compatibility and names `Command.Activity` in its component diagram (RM-12, RM-13).

## 1.6.0

### Minor Changes

- [#68](https://github.com/ABCrimson/modern-cmdk/pull/68) [`001da19`](https://github.com/ABCrimson/modern-cmdk/commit/001da196f623f57527c590753ae619460cb931cc) Thanks [@ABCrimson](https://github.com/ABCrimson)! - The machine does what its documentation says: disabled items stay listed but can no longer be activated or selected, a custom `filter` that returns 0 or less excludes the item, shortcut conflicts are reported, frecency is saved and restored, and a batch of registry events commits one refilter, and every batch at most one `stateChange`. Some of these are visible changes at rest; each one is listed under its heading.
  
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
  - The scroll-driven wiring, `scroll-timeline` on the list, the fade edges and the scroll progress bar, sits inside `@supports (animation-timeline: scroll())` (RA-77). `scroll-driven-animations` is supported from Safari 26 and Firefox 159 (Chrome 115; web-features 3.45.0-dev-20261103105955-64427e2, published 2026-11-03). At the Safari 18.4 and Firefox 131 floor the effects do not run: the fade edges and the progress bar stay static.
  
  **Size**
  
  - The size budget rises (D90): core 7.4 kB (was 6.5 kB), `modern-cmdk/react` adapter 5.7 kB (was 5.6 kB), core + React 10.85 kB (was 10.1 kB); `modern-cmdk/react/dialog` stays 1.5 kB. Measured at `8c4feee` with size-limit 14.3.0, gzip, recorded in `benchmarks/size-history/1.6.0.json`: core 7321 B (1.5.0: 6399 B), adapter only 5610 B (5539 B), `modern-cmdk/react/dialog` 1422 B (1422 B), `CommandSeparator` only 4884 B (4812 B), core + React 10764 B (10003 B), `styles.css` 3986 B (3959 B). The roadmap restores the 6.5 kB core row in 2.0 by moving `IdbFrecencyStorage` to a `modern-cmdk/frecency` subpath (ARCH-64, `docs/plans/2026-10-31-roadmap-1.3-to-2.0.md`).
  
  **Browser floor**
  
  - The JavaScript of the core and React entries needs Chrome and Edge 122, Firefox 131 and Safari 18.4 (the same numbers on Android and iOS), from `tests/unit/browser-floor.json`: web-features 3.45.0-dev-20261103105955-64427e2, published 2026-11-03; the binding feature is `iterator-methods`. A test checks the built entries against that list (CE-29).
  
  **Codemod bin (deprecated)**
  
  - The bundled codemod (`dist/codemod`, the deprecated `modern-cmdk` bin) carries the `data-attrs` fixes of `modern-cmdk-codemod` 1.0.1: attribute names match case-insensitively, with the rewrite writing the lowercase `data-command-*` name (DA-11); Tailwind `group-`, `peer-` and `in-` data variants, with their `-has-` and `not-` forms, are reported and left unchanged: on cmdk elements, instead of being rewritten to `group-data-active:` (DA-12), and in the class lists of other elements of a file that references cmdk, where they went unreported (DA-13). The element's own `data-[selected=true]:` is still rewritten. The submodule discovery fix (SEC-56) does not apply to the bin, because that program applies no `.gitignore`. The bundled codemod is 3153027 B installed (1.5.0: 3150372 B).

## 1.5.0

### Minor Changes

- [#63](https://github.com/ABCrimson/modern-cmdk/pull/63) [`d3fc521`](https://github.com/ABCrimson/modern-cmdk/commit/d3fc5215db095ca0b24575465a089d3326f7295a) Thanks [@ABCrimson](https://github.com/ABCrimson)! - Migration tools you can trust, on the modern-cmdk side: the `modern-cmdk` bin is deprecated in favour of the new `modern-cmdk-codemod` package and keeps its 1.x behaviour, the bundled codemod gets the transform and CLI fixes, and the React adapter gains the loading state and an error boundary you can reset.
  
  **Codemod bin (deprecated)**
  
  - `npx modern-cmdk` writes one line to stderr before it runs, and leaves `modern-cmdk` in 2.0: `warning: the modern-cmdk bin is deprecated and leaves in modern-cmdk 2.0; use npx modern-cmdk-codemod (strict by default). This bin runs the bundled codemod with the 1.x lenient exit codes unless --strict is given.` Run `npx modern-cmdk-codemod` instead (Node >= 26.4.0; the changeset of that package has the details). The bin makes no network request and starts no other process.
  - The bin runs the same transforms as `modern-cmdk-codemod`, so every transform and CLI fix that package's changeset lists as new in 1.5.0 is in the bundled codemod too, and it keeps 1.4's behaviour where it can: the 1.x exit codes (lenient unless argv carries `--strict`), 1.4's excludes (of the ten directories `modern-cmdk-codemod` skips, it skips only `node_modules`, `dist`, `build` and `.next`, applies no `.gitignore` and, as in 1.4, leaves out files and directories whose names start with a dot unless a pattern segment starts with that dot or a directory argument names that directory; a directory argument now covers only the ten script and stylesheet extensions listed in that package's changeset) and no git check. The default `--concurrency` is min(8, available cores) (1.4: 8), and above 1 files are transformed on worker threads; results print in input order as before.
  - A dry run (`--dry-run`) now also prints a unified diff of every file that would change, and each transform reports every site it cannot migrate (`<path>: <message>` on stderr, counted in the summary, no change to the exit code) instead of guessing.
  - Differences from 1.4 under the bin, each pinned by a test (accepted under LD-05 by D65 as consequences of dropping globby 16, W1-02 a302e98): `-v` or `--version` beside both positionals prints the version and runs nothing (1.4 warned "unknown option -v ignored" and ran); `--force` and `--lenient` are known options and no longer warn as unknown; an explicit pattern through a symlinked directory (such as src/link/*.ts) still reaches it, as globby 16 did (the test labelled 'roadmap call :236'); `**` and a directory argument no longer descend a symlinked directory below them (the directory argument may itself name one: `./src/link` still reaches the files the link points to), and a symlinked file is no longer matched, where globby 16 followed both (the roadmap call :236 tests 'a symlinked directory is not descended by **' and 'a symlinked file is not a file for discovery'); on Windows a pattern matches file names case-insensitively where globby 16 matched case-sensitively; a file an explicit pattern matches that is not a script or stylesheet is skipped, not a parse error, so `--strict` no longer exits 1 for it.
  - A directory argument such as `app/[slug]` is matched as a literal directory, as in 1.4 (bug fix: restores 1.4 matching of a directory argument such as app/[slug] (globby 16 expandDirectories; files.ts discoverFiles, dirs split)).
  - `THIRD-PARTY-NOTICES.md` ships in the tarball: it lists the packages bundled into `dist/codemod` with their licences (generated by `scripts/third-party-notices.ts` and checked against what the built dist generates).
  
  **Core and React**
  
  - `FrecencyOptions.enabled` is optional (additive, a type change only). Its default is still `false`; the flip to `true` is a 2.0 break.
  - `state.loading` follows `Command.AsyncItems`: a pending `AsyncItems` sends the new `LOADING` event and the state clears when it settles. Before, nothing set `state.loading`, so `Command.Loading` never showed from it and the list's `aria-busy` stayed false. `Command.Empty` also stays hidden while an `AsyncItems` source is pending (it already returned null while `state.loading` was true; before 1.5 that flag was never true, so Empty showed during the load).
  - `CommandErrorBoundary` gains `resetKeys` (compared with `Object.is` per entry; a change of length counts; it acts only while an error persists), a public `reset`, and `fallback(error, reset)`. Additive: a `fallback` that ignores its second argument works as before.
  - `'use client'` is written once per `modern-cmdk/react` chunk, by the build banner (no observable change), and `modern-cmdk/react`'s devtools hook keeps its own dev check instead of importing the core's, so `dist/react` carries no copy of the core.
  
  **Sizes**
  
  Recorded in `benchmarks/size-history/1.5.0.json` (committed in `4498a0f`, measured at `d5ce6ff` with size-limit 14.3.0), gzip for the JS and CSS entries: core 6399 B (1.4.0: 6355 B), `modern-cmdk/react` adapter only 5539 B (5403 B), `modern-cmdk/react/dialog` 1422 B (1425 B), `CommandSeparator` only 4812 B, core + React 10003 B (9830 B), `styles.css` 3959 B (3959 B). The adapter grew by 136 B.
  
  The packed `modern-cmdk@1.5` release candidate against `modern-cmdk@1.4`: unpacked 3315632 B against 3473079 B, tarball 962822 B (22 entries) against 992157 B (16 entries). The codemod part is 3150372 B (3325793 B in 1.4), including the 897 B shim `dist/codemod/bin.mjs`. The runtime part is 165260 B against 147286 B in 1.4: 152384 B without the 12876 B `THIRD-PARTY-NOTICES.md`.
  
  **Bug fixes (from the findings ledger, each label as recorded)**
  
  The codemod rows are listed once, under `modern-cmdk-codemod` (the bin runs the same code); the scaffolder rows under `create-modern-cmdk`. The rest:
  
  *React*
  
  - `ARCH-59`: state.loading is written only as false (core/machine.ts:309; core/types.ts:207 declares it); Command.Loading renders only when `loadingOverride ?? (state.loading || isPending)` is true (loading.tsx:25-27) and the list's aria-busy mirrors state.loading (list.tsx:163). Without the `loading` prop, `<Command.Loading>` never renders and aria-busy is never true, even while AsyncItems suspends. Found by the W6-07 verifier (wf_c8b7f936-32e), 2026-11-04. (1.4.0 behaviour; fixed by the LOADING event above)
  
  *VS Code snippets* (the extension is private and is published neither to npm nor to the VS Code Marketplace (install it from source); its snippets are type-checked against this package's dist by `pnpm check:snippets`)
  
  - `RP-13`: 6 of 15 VS Code snippets do not compile against the shipped modern-cmdk/react API.
  - `CV-13`: cmd-frecency passes storage as a string ('indexeddb'/'memory'), but the option requires a FrecencyStorage object.
  - `CV-14`: cmd-async uses a nonexistent `load` prop on Command.AsyncItems and omits the required render-function children.
  - `CV-15`: cmd-hook calls useCommand({items}) and destructures `send`; useCommand takes a CommandMachine and returns no send.
  - `CV-16`: cmd-wasm imports createWasmScorer from 'modern-cmdk/wasm' (neither exists) and passes a nonexistent `scorer` prop.
  - `CV-17`: cmd-component-ref passes ref to `<Command>`, but CommandRootProps has no ref and the root uses an internal rootRef.
  - `CV-29`: cmd-machine declares `using machine` at scope top level, so the machine and its subscription are disposed when the module or function finishes evaluating.
  - `CV-30`: The cmd-dialog snippet produces a dialog that can never open.
  - `CV-55`: The cmd-action snippet never calls dispatch and never renders state, so isPending is always false and Command.Loading never shows.
  - `CV-56`: The cmd-optimistic snippet destructures addOptimistic but never calls it, so the optimistic update path is never exercised.
  - `CV-76`: The cmd-optimistic snippet's onSelect calls addOptimistic(item) on an item already in the list, so the reducer appends a duplicate: selecting 'a' renders two Command.Items with the same key, React warns about the duplicate key and the same value registers twice (the wave-1 judge).
  - `CV-77`: snippets.json is contributed to both typescriptreact and javascriptreact, but cmd-component-ref (type CommandRootProps, an annotated parameter), cmd-use, cmd-optimistic and cmd-action contain TypeScript-only syntax: expanded in a .jsx file they are syntax errors, and scripts/check-snippets.ts compiles every snippet as .tsx only, so the gate cannot see it (the wave-1 judge).
  
  *Documentation* (the docs site; changes no package)
  
  - `DG-132`: The worker-engine sample's effect cleanup only sets disposed = true: an engine that resolves after the cleanup (React StrictMode's mount, unmount and remount; a fast route change) is never disposed and its Worker keeps running, and even an engine that resolved before the cleanup is never disposed. The main-thread sample disposes the engine the cleanup can see (:52) but an engine that resolves after the cleanup is likewise leaked, because the sample assigns it and only skips setEngine. Both engines expose Symbol.dispose and Symbol.asyncDispose (packages/command-search-wasm/src/worker-engine.ts:348-358, :403-407). Filed by the wave-7c ledger judge (wf_79bba486-bfa) on d0c3da7.
  
  *Repository tooling* (changes no package)
  
  - `DT-67`: The pre-push size job was gated by glob `packages/*/src/**/*.{ts,tsx}`; lefthook's glob needs a directory between src/ and `**/`, so a push whose only source changes sat directly under a package's src (cli.ts, files.ts) printed 'size (skip) no matching push files' and never ran size-limit: the pushes of 2b36297 and cdc05f2 did, and CI run 41998415732's Bundle Size job caught the 93,739 B over-budget instead. Probed with lefthook run pre-push --job size --file `<path>`: files.ts skipped, codemod/bin.ts ran.
  - `DT-68`: W4-02's bare-import allow-list (2ed5818) decided whether a dynamic import() or require()/__require() match sat inside a string or comment by the text before it on the same line: a call was skipped when that text held an odd count of any one quote character or any //, so a real bare import after a URL string or after an apostrophe in another quote type on the same line was never reported, and template literals and block comments were not understood at all. The test file's header also under-described what the file covers. Found by the wave-4 opus-verifier of W4-02 (two minors).
  - `DT-69`: consumer-smoke.ts's step timeout killed only the direct child (child.kill('SIGKILL')) and resolved on 'close', so on POSIX a grandchild that inherited the pipes (a bundler or dev server left by a consumer app's build) held the step open until its own exit: under WSL a step with a 1.5 s timeout ran 30071 ms, until the grandchild's timer ended, and in CI such a step runs to the job's own timeout. The same flaw was fixed in template-smoke.ts by W4-04 (197919f); its worker and verifier named this file as the remaining site.
  - `DT-70`: Regression in a6cf620 (W4-04b, filed under DT-69): killTree switched to process.kill(-pid, 'SIGKILL') on POSIX and ignored ESRCH, but the `next start` server spawned in main was not detached, so the group kill hit ESRCH (no such process group), the error was swallowed and the server survived, keeping the port bound and the script's event loop alive after the Next scenario (WSL probe: non-detached child, kill(-pid) -> ESRCH, child alive); before a6cf620 child.kill('SIGKILL') on the direct child did stop it. template-smoke.ts's killTree had the same ESRCH-swallowing shape, latent because its only spawn is detached. Found by the wave-4 ledger judge (opus-verifier) at a6cf620, and confirmed live by CI run 42009255255 on a6cf620: Consumer app (next-webpack) and Consumer app (next-turbopack) ran from 10:17:01Z to the job's 25-minute timeout-minutes and were cancelled inside the consumer-smoke step while Consumer app (vite) passed in 66 s; run 42002360862 on adfa46e, before a6cf620, had passed all three.
  - `DT-71`: The git-spawning suites (codemod-cli, codemod-files, codemod-submodule, create-cli, cli-exec) ran under Vitest 5.1.0's 5 s per-test default although a test makes up to a dozen git spawns, each hundreds of milliseconds on Windows: CI run 42009255255 (a6cf620, windows-2025-vs2026, Node 28) timed out 'SEC-07: a modified tracked file refuses with exit 2, lists the path, names --force, writes nothing' at 5024 ms and then hit EBUSY removing its temp dir while git still ran, failing the matrix, and the wave-5 merged-tree gate on the author's host under the load of two agent runs timed out 'SEC-59: a submodule of a submodule climbs to the outermost superproject' at 6809 ms; both pass when run alone.

## 1.4.0

### Minor Changes

- [#60](https://github.com/ABCrimson/modern-cmdk/pull/60) [`a5f1e71`](https://github.com/ABCrimson/modern-cmdk/commit/a5f1e71dec4aee21fdd5b70797a0bb59adc48e7a) Thanks [@ABCrimson](https://github.com/ABCrimson)! - Package integrity, consumer integration, public record: one copy of the core, a `modern-cmdk/react/dialog` entry, honest package metadata, and corrections for CHANGELOG entries that credited code the packages never had.
  
  **modern-cmdk**
  
  - `modern-cmdk/react` no longer bundles its own copy of the core: it imports `modern-cmdk`, so apps using both entries ship the core once, and core types such as `ItemId` are assignable across entries.
  - Sizes, gzip, measured by size-limit 14.3.0 and recorded in `benchmarks/size-history/1.4.0.json` (committed in `5f1e01e`, measured at `07bfe79`): core 6355 B, `modern-cmdk/react` adapter only 5403 B, core + React 9830 B (1.3.0 measured 16199 B, the sum of 6355 B and a 9844 B React entry that inlined the core), `modern-cmdk/react/dialog` 1425 B, `styles.css` 3959 B. The `modern-cmdk` 1.2.0 entry's "the adapter's own gzipped size (~10.2 KB)" measured a file that inlined the core, so it was not the adapter's own size.
  - New `modern-cmdk/react/dialog` entry exporting `CommandDialog`. `modern-cmdk/react` still imports `radix-ui` in 1.x, so install `radix-ui` whenever you use the React entry. It is a required peer (`>=1.4.0 <2.0.0`); `react` and `react-dom` stay optional peers. This applies to core-only installs too: `npm install modern-cmdk` (npm 7+) and pnpm now also install `radix-ui` and, through its required peers, `react` and `react-dom`, even if you never import `modern-cmdk/react`; package managers with strict peers warn instead. `radix-ui` becomes optional again when the barrel drops `Command.Dialog` in 2.0.
  - `exports` gains `./package.json` and drops the duplicate `import` conditions; no import resolves differently.
  - `sideEffects` lists only `styles.css`.
  - `modern-cmdk` declares no `engines` field. The codemod bin and `create-modern-cmdk` are supported on Node >=26.4.0 (`create-modern-cmdk` declares it in `engines`; the codemod no longer does, from 1.4.0, D14). `npx modern-cmdk --help` states the same floor.
  - The codemod ships no unreachable `.d.mts` declarations.
  
  **create-modern-cmdk**
  
  - The tarball holds only the bin: no `index.d.mts` (with its dangling `sourceMappingURL`) and no source map. The manifest gains `homepage`, `bugs` and `keywords`.
  
  **Licence**
  
  - The `LICENSE` file of every package names Albert Badalov as the holder.
  
  **Documentation**
  
  - The installation page has the peer table and the `radix-ui` requirement, and the measured TypeScript floor: 5.6 with `"lib": ["ESNext", "DOM"]`. 5.5.4 fails with `Cannot find name 'IteratorObject'`; 5.6.2, 5.7.3, 5.8.3, 5.9.3 and 6.0.3 pass, with the method written out.
  - The npm README is the canonical README; the repository README points to it. Sizes in the docs cite the record above.
  - Every fenced `ts` and `tsx` sample in the docs site and in the root, `modern-cmdk` and `create-modern-cmdk` READMEs is type-checked against the built package in CI, apart from five deliberate fragments.
  
  **Errata**
  
  History stays as written; these entries claim code the packages do not have, or mislabel what they have.
  
  - `modern-cmdk` 1.1.3: "`Promise.withResolvers` ... remain" is wrong: the `modern-cmdk` source does not use `Promise.withResolvers` (ES2024). The pre-rename 0.9.0 section's "ES2026 Features (native)" list credits it to the scheduler, which never used it (only the unpublished `command-search-wasm` worker engine does), and lists Iterator Helpers there, which are ES2025.
  - `modern-cmdk` 0.9.0 (carried into the pre-rename history of the package changelog): `TypedEmitter` holds its listeners by strong reference, not through `WeakRef`; item registration does not use `useInsertionEffect`; and there is no `<Offscreen>`. The React adapter uses React's stable `<Activity>`.
  - `modern-cmdk` 1.0.0: "ES2026: Iterator Helpers" is wrong; iterator helpers are ES2025.
  - `modern-cmdk` 1.2.0: see the sizes bullet above for the "~10.2 KB" figure.
  
  The 1.3.0 entry already corrected `RegExp.escape` and `NoInfer<T>`.
  
  `vscode-modern-cmdk` is private; the `vscode-modern-cmdk@1.0.0` on npm was published by accident and is not the VS Code extension. The Dependabot and bug-report labels (`dependencies`, `ci`, `triage`) now exist in the repository. CI gained a package-integrity job (publint, are-the-types-wrong, the tarball file list, the licence audit and an SPDX SBOM), consumer apps built from the packed tarball and a Node 24 install check; none of it changes what the packages do.

## 1.3.0

### Minor Changes

- [#57](https://github.com/ABCrimson/modern-cmdk/pull/57) [`840d18f`](https://github.com/ABCrimson/modern-cmdk/commit/840d18fdf92540ac20c312d1cd3d3f7fa4cc2136) Thanks [@ABCrimson](https://github.com/ABCrimson)! - Only green, honest gates: the CLIs print again, the docs stop claiming what the code does not do, and the default stylesheet's muted text meets WCAG 1.4.3.
  
  **CLIs**
  
  - The codemod bin (`npx modern-cmdk`) and `npm create modern-cmdk` print usage, per-file results, dry-run lists and errors again. This restores the documented output.
  - New `--strict` flag on both CLIs: usage errors exit 2 and file errors exit 1. Without `--strict` the 1.x default exit codes are unchanged for well-formed commands; the exceptions are the malformed options and the `--template <name>` form below.
  - Unknown options are warned about and ignored when the required arguments are present; without them they are a usage error (exit 0). With `--strict` an unknown option always exits 2.
  - A malformed known option (codemod `--concurrency` with no value, `--dry-run=yes`, create `--template` with no value) is now a usage error that writes nothing and exits 0 (2 with `--strict`). 1.2.x ignored the option and ran, so `--dry-run=yes` performed a real write. Because the usage error comes before the run, a codemod call that 1.2.x ran to exit 1 (no matching files, or an unknown transform) exits 0 when it also carries one of these options. Both CLIs print the exact `parseArgs` wording for these errors.
  - `create-modern-cmdk` honours the space form `--template <name>`. An unknown template given that way now exits 1; 1.2.2 silently scaffolded `react-basic`. This is the one case where a default exit code rises (0 to 1).
  - The `react-dialog` template now opens with Mod+K (Cmd+K on macOS, Ctrl+K elsewhere).
  
  **React**
  
  - `Command.Input` no longer drops keystrokes under rapid typing, and `Command.Loading` no longer flashes or announces (`role="status"`, `aria-live`) on every keystroke: search updates no longer run in a transition.
  
  **Styles**
  
  - The default stylesheet's muted text (group headings, shortcuts, the empty state, the placeholder) uses the new `--command-muted-color` token instead of opacity, so it meets WCAG 1.4.3. Override the token to restyle it.
  - The token defaults to `light-dark()`. On a dark theme, set `color-scheme` (for example `color-scheme: dark` on `:root`) or override `--command-muted-color`; otherwise muted text takes the light value and is hard to read on a dark surface.
  
  **Documentation**
  
  - Docs live at https://abcrimson.github.io/modern-cmdk/; the old domain is gone, and the wiki is retired: every page points at the docs site.
  - The README, package READMEs and docs no longer claim `RegExp.escape`, `WeakRef` listeners, exponential decay, sub-millisecond WASM search or other features the code does not have. The repository description no longer claims WASM, GPU, ES2026, TypeScript 6 or benchmark wins. Earlier CHANGELOG entries that list `RegExp.escape` (keyboard parser) and `NoInfer<T>` (callback typing) as shipped features describe code the packages do not have; they stay as release history and this entry corrects them.
  - The README and the docs benchmarks page take their figures from a committed, CPU-stamped results file (`benchmarks/history/2026-11-04-45a9134.json`).
  
  The Playwright e2e default is now Chromium only; Firefox and WebKit run with `E2E_ENGINES=all` until 1.8.0. CI and test tooling changed beyond that; none of it affects the packages.

## 1.2.3

### Patch Changes

- [#52](https://github.com/ABCrimson/modern-cmdk/pull/52) [`e55cce7`](https://github.com/ABCrimson/modern-cmdk/commit/e55cce780aaab5a3da922432a0918b6c54614e25) Thanks [@ABCrimson](https://github.com/ABCrimson)! - `useCommandDevtools` no longer throws `ReferenceError: __DEV__ is not defined` in published builds. Development-only code (the devtools bridge and the search-engine leak detector) is now gated on `process.env.NODE_ENV`, with a safe production fallback when no bundler replaces it; the leak detector stays off during SSR.

- [#42](https://github.com/ABCrimson/modern-cmdk/pull/42) [`541a5d7`](https://github.com/ABCrimson/modern-cmdk/commit/541a5d7e961ff36bcc5aa68329f0dd6f5e617368) Thanks [@ABCrimson](https://github.com/ABCrimson)! - Republish built with the current toolchain (TypeScript 7.1, tsdown 0.23.5 with oxc declaration emit). The `core` and `react` entry points are runtime- and type-identical to the previous build apart from comments; the bundled codemod CLI (`dist/codemod/cli.mjs`) picks up newer versions of its bundled dependencies (glob matching and file-walking helpers).

## 1.2.2

### Patch Changes

- [`05d3b74`](https://github.com/ABCrimson/modern-cmdk/commit/05d3b74868419c5076452bcdf23d9b7bc6a3fabd) Thanks [@ABCrimson](https://github.com/ABCrimson)! - Evergreen dependency refresh: bump runtime dependency `idb-keyval` to 6.3.0; rebuild with TypeScript 7.0.2, tsdown 0.23.0-rc.0, and React 19.3 canary 20260826 toolchain.

- docs: refresh npm README + modernized toolchain — disclose the sole runtime dependency (`idb-keyval`, lazy-loaded only for IndexedDB frecency persistence), note ESM-only + `engines.node >= 26.4.0` and the unpublished/experimental WASM engine, and correct the virtualization threshold to `virtualizeThreshold` (default 100).

## 1.2.1

### Patch Changes

- **docs: documentation accuracy pass** — Corrected the codemod CLI usage everywhere to its real positional form `npx modern-cmdk <transform> <glob>` (one transform per run; only `--dry-run` and `--concurrency=N` are accepted). The previous `migrate` / `--transform` / `--verbose` / `--extensions` / `--ignore` forms never matched the implementation. Replaced the inaccurate `sideEffects: false` claim with the actual scoped array (`./dist/react/styles.css`, `./dist/react/index.mjs`), and clarified that the optional `modern-cmdk-search-wasm` engine is experimental and not yet published to npm. No code, API, or behavior changes — republished so the corrected README ships to npm.

- **docs: repository docs** — The root README packages table was corrected (`vscode-command` to `vscode-modern-cmdk`, the unpublished WASM package flagged), `CONTRIBUTING.md`'s project-structure tree was rewritten to the merged single-package layout (`packages/modern-cmdk/src/{core,react,codemod}`) and `ARCHITECTURE.md`'s stale `packages/command` and `packages/command-react` paths were fixed. Carried from the root CHANGELOG's 1.2.1 section ([`cf6ede7`](https://github.com/ABCrimson/modern-cmdk/commit/cf6ede7)).

## 1.2.0

### Minor Changes

- **chore: bleeding-edge evergreen upgrade** — Moved the entire toolchain and dependencies to their newest releases: TypeScript 7.0.1-rc (native compiler), React 19.3 canary, radix-ui 1.6.0, Vite 8.1, Vitest 5, Playwright 1.62, Biome 2.5.1, pnpm 11.9, tsdown 0.22.3, and the Rust/WASM crate to edition 2024 + wasm-bindgen 0.2.126. Raised `engines.node` to `>=26.4.0` and bumped the `idb-keyval` runtime dependency to 6.2.5. No public API or behavior changes.

- **chore: size-limit measures own code** — The React adapter budget now externalizes the `react`/`react-dom`/`radix-ui` peers and reports the adapter bundle's gzipped size (~10.2 KB) [corrected 2026-11: that file inlined the core; the adapter alone is 6.5 kB gzip at 1.7.0], so the gate stays stable across peer version bumps.

- **chore: CI and test fixes** — CI actions moved to checkout v7, pnpm/action-setup v6, codeql v4, upload-pages-artifact v5 and deploy-pages v5. Fixed the Vitest 5 benchmark migration (fixture API with `.run()`, `it.sequential` to `it`, oxc transform), radix 1.6 dialog dismissal in the unit tests (a full outside click is dispatched) and the WASM build guard (Node `existsSync` instead of the POSIX `[ -f ]`). CI runs Node 26.4.0 on `ubuntu-26.04`; VitePress moved to 2.0.0-alpha.17; wasm-pack 0.15 builds the crate with wasm-opt feature flags; the React size-limit budget is 12 KB. Carried from the root CHANGELOG's 1.2.0 section ([`bd772ce`](https://github.com/ABCrimson/modern-cmdk/commit/bd772ce)).

- **docs: full accuracy pass** — Corrected every version reference, bundle-size figure, and API example across the README, npm page, and the documentation site to match the upgraded code (including the real `FrecencyEngine`, `KeyboardShortcutRegistry`, and `ParsedShortcut` signatures).

## 1.1.5

### Patch Changes

- **fix(ci): remove `--coverage` from sharded tests** — Vitest coverage thresholds are incompatible with sharding; removed flag to fix CI failures.

- **fix: pre-launch readiness** — Aligned package exports, `engines` field, and docs across `modern-cmdk` and `command-search-wasm`. Fixed bundle size limits in root `package.json` and benchmarks documentation (25 KB -> 25.5 KB for React bundle).

- **docs: comprehensive API reference expansion** — Expanded `apps/docs/api/command.md` with full core engine documentation covering state machine, search engine, frecency, keyboard registry, telemetry, and branded types.

- **test: coverage thresholds** — Coverage thresholds were added to `vitest.config.ts` for CI enforcement ([`394652f`](https://github.com/ABCrimson/modern-cmdk/commit/394652f), carried from the root CHANGELOG's 1.1.5 section).

- **chore: docs and build cleanup** — Fixed `Iterator.range` bug in virtualization guide, aligned tsdown targets across packages, updated README bundle sizes and pnpm version.

## 1.1.4

### Patch Changes

- **fix(ci): resolve all 7 Biome lint/format errors** — Trailing zero in OKLCH value, import ordering (value before type), regex line width wrapping, `useExhaustiveDependencies` dependency extraction, `expect.poll()` chain formatting, `noUncheckedIndexedAccess` narrowing in `objectGroupBy`.

- **chore(ci): modernize all GitHub Actions workflows** — Added explicit `permissions` blocks (principle of least privilege) and `timeout-minutes` to all jobs across ci.yml, benchmarks.yml, codeql.yml, docs.yml, and release.yml. Improved CI summary table with status labels. Added `security-extended` query suite to CodeQL. Optimized build commands in benchmarks and release workflows.

- **chore(deps): enhance Dependabot configuration** — Added dependency groups for TypeScript, Biome, Playwright, and Vitest. Added ignore rules to prevent major version bumps on pinned React pre-releases.

## 1.1.3

### Patch Changes

- **fix(react): virtualization now removes off-screen items from the DOM** — Items check `visibleIdSet` before rendering, reducing DOM nodes from thousands to ~30 in virtualized lists. Latch-based auto-virtualization with hysteresis (more than 100 items enables it, 50 or fewer disables it) prevents race conditions ([`6b340b4`](https://github.com/ABCrimson/modern-cmdk/commit/6b340b4)).

- **fix(core): replace browser-incompatible ES2026 APIs with cross-browser helpers** — Replaced `Temporal.Now.instant()` / `Temporal.Duration` with `Date.now()`, `Math.sumPrecise` with `+=` loops, `Map.groupBy` / `Object.groupBy` with helper functions, `Set.intersection` / `.difference` / `.union` / `.isSubsetOf` with set operation helpers, `Promise.try` with `Promise.resolve().then()`, `String.isWellFormed` / `.toWellFormed` with regex-based surrogate replacement. Iterator Helpers and `using`/`await using` remain (supported in target browsers). [Corrected 2026-11: the source uses neither `Promise.withResolvers` nor `RegExp.escape`.]

- **fix(css): WCAG 2.1 AA contrast compliance** — Updated OKLCH color values in dark mode (`--text-muted: oklch(0.83)`, `--text-secondary: oklch(0.75)`) and light mode (`--text-secondary: oklch(0.38)`, `--text-muted: oklch(0.48)`, `--accent: oklch(0.45)`) to meet 4.5:1 contrast ratio requirements. Re-enabled axe-core color-contrast checks in E2E tests.

- **chore: scroll and lint housekeeping** — `scrollToIndex` uses `behavior: 'instant'` for responsive keyboard navigation ([`022f441`](https://github.com/ABCrimson/modern-cmdk/commit/022f441)), and `Temporal` is removed from the Biome globals list ([`5b42c7b`](https://github.com/ABCrimson/modern-cmdk/commit/5b42c7b)); both carried from the root CHANGELOG's 1.1.3 section.

- **fix(css): RTL support** — Changed `transform-origin: left center` to `transform-origin: inline-start center` for logical property compliance.

- **fix(e2e): test reliability improvements** — Replaced snapshot reads (`getAttribute`) with auto-retrying assertions (`toHaveAttribute`, `expect.poll()`) throughout virtualization, accessibility, and keyboard test suites. Virtualization tests use `?count=2000` instead of being skipped in CI.

> **Version 1.1.2 was never published.** `1.1.2` is absent from the npm `time` and `versions` records of `modern-cmdk` (`npm view modern-cmdk versions --json` lists 1.1.1 then 1.1.3), and no `modern-cmdk@1.1.2` tag exists.

## 1.1.1

Backfilled from the GitHub release body of `modern-cmdk@1.1.1` (published 2026-03-12) and the tag commit [`ff345bf`](https://github.com/ABCrimson/modern-cmdk/commit/ff345bf); no changeset produced this entry.

### Patch Changes

- [`ff345bf`](https://github.com/ABCrimson/modern-cmdk/commit/ff345bf) **fix: resolve CI failures — bundle size limit and E2E build config** — The core bundle-size limit was raised from 6 KB to 6.5 KB (the release body gives the measured size as 6.12 KB gzip), and the CI E2E job's build step now includes the playground, which the `--filter '!playground'` build had excluded.

- **test: E2E and unit-test reliability (listed in the release body, landed after the tag)** — The release body also lists the axe-core `color-contrast` rule disabled, the `aria-expanded` test fixed, `pressSequentially` delays raised to 50 ms, wait-for-empty-state guards, auto-retrying Playwright assertions, disabled items skipped during ArrowDown navigation, virtualization E2E skipped in CI, Chromium-only CI runs, stress-test timeouts raised to 15 s and a sequential E2E build order. Those commits ([`dc9f087`](https://github.com/ABCrimson/modern-cmdk/commit/dc9f087), [`9dbe275`](https://github.com/ABCrimson/modern-cmdk/commit/9dbe275), [`683a8d7`](https://github.com/ABCrimson/modern-cmdk/commit/683a8d7), [`0e017fa`](https://github.com/ABCrimson/modern-cmdk/commit/0e017fa), [`fe4cb8b`](https://github.com/ABCrimson/modern-cmdk/commit/fe4cb8b), [`559c533`](https://github.com/ABCrimson/modern-cmdk/commit/559c533)) were made after the `modern-cmdk@1.1.1` tag and first appear in the `modern-cmdk@1.1.3` tag.

- [`ae956ad`](https://github.com/ABCrimson/modern-cmdk/commit/ae956ad) **docs: head-to-head benchmark comparison** — Added to the docs site.

## 1.1.0

Backfilled from the GitHub release body of `modern-cmdk@1.1.0` (published 2026-03-11) and the tag commit [`061dc07`](https://github.com/ABCrimson/modern-cmdk/commit/061dc07); no changeset produced this entry.

### Minor Changes

- [`061dc07`](https://github.com/ABCrimson/modern-cmdk/commit/061dc07) **feat: v1.1.0 — publish-ready with full modernization and head-to-head benchmarks** — The release body (52 files changed) lists these critical fixes: the codemod CLI extension changed from `.js` to `.mjs` for ESM compatibility; `idb-keyval` is imported lazily and dynamically, so no browser-only code runs at top level (SSR-safe); `radix-ui` moved from a hard dependency to an optional peer dependency.

- High-priority fixes listed in the body: `IS_REACT_ACT_ENVIRONMENT` set in the test setup, stronger performance and accuracy test assertions, a memory-leak test that checks search still works after 100 create/dispose cycles, `declaration: true` restored in `tsconfig.base.json` (required by `isolatedDeclarations`), and JSDoc on all public exports.

- Medium-priority fixes listed in the body: a configurable `description` prop on `Command.Dialog`, an i18n-ready `announceResults` prop on `Command.List` for the `aria-live` text, `FinalizationRegistry` leak detection that warns on undisposed search engines, `FrecencyEngine` dispose flush failures logged instead of silenced, JSDoc on the exported React components and hooks, and tautological test assertions replaced.

- Build: a single unified tsdown array config, to prevent double-build artifact corruption (release body, "Unified build config").

## 1.0.2

### Patch Changes

- [`f5576bb`](https://github.com/ABCrimson/modern-cmdk/commit/f5576bb917e8d254aae20b419ea02dccfbcab7cd) Thanks [@ABCrimson](https://github.com/ABCrimson)! - Performance: split React context to prevent all-item re-renders, O(1) filtered set lookup, single-pass index build, lazy iterators. Fix CSS sideEffects, invalid transform-origin, GPU will-change misuse. Fix broken docs examples and README links.

## 1.0.1

### Patch Changes

- [`f6a9294`](https://github.com/ABCrimson/modern-cmdk/commit/f6a9294d0f868b4848cfad40770f455f3745d56e) Thanks [@ABCrimson](https://github.com/ABCrimson)! - Fix lint issues, O(1) navigate lookup, error-resilient fuzzy scorer, and modernize branding

## 1.0.0

### Major Changes

- [`f00ac85`](https://github.com/ABCrimson/modern-cmdk/commit/f00ac85f23a9823234f507015c423d0aa066a12c) Thanks [@ABCrimson](https://github.com/ABCrimson)! - modern-cmdk 1.0.0 — consolidated package replacing @crimson_dev/command + @crimson_dev/command-react + @crimson_dev/command-codemod.

  ### Import paths

  - `import { createCommandMachine } from 'modern-cmdk'` — core engine
  - `import { Command } from 'modern-cmdk/react'` — React 19 adapter
  - `import 'modern-cmdk/styles.css'` — default styles
  - `npx modern-cmdk <transform> <glob>` — codemods

  ### Highlights

  - Pure TypeScript state machine with zero DOM dependencies
  - 14 React 19 compound components with Radix UI Dialog
  - Built-in fuzzy search with incremental filtering
  - Frecency ranking with time-based decay
  - Keyboard shortcut registry
  - GPU-composited CSS animations
  - Full WAI-ARIA combobox pattern
  - Automatic virtualization at 100+ items
  - Iterator Helpers (ES2025), Explicit Resource Management, newer APIs such as Temporal and `Map.groupBy` [corrected 2026-11: iterator helpers are ES2025 and `Map.groupBy` ES2024; 1.1.3 replaced those APIs with cross-browser helpers]

## Before the rename (@crimson_dev/command)

Before 1.0.0 this library shipped as `@crimson_dev/command`, `@crimson_dev/command-react` and `@crimson_dev/command-codemod`. The `0.10.0` and `0.9.0` sections below are carried verbatim from the repository's former root CHANGELOG; the `v0.1.0` to `v0.8.0` milestones are documented only as GitHub releases (https://github.com/ABCrimson/modern-cmdk/releases), tagged `v0.1.0` to `v0.8.0`.

### [0.10.0] - 2026-03-09

### Changed
- `@crimson_dev/command` — 0.9.0 → 0.10.0 (minor)
- `@crimson_dev/command-react` — 0.9.0 → 1.0.0 (major)
- `@crimson_dev/command-codemod` — 0.9.0 → 0.10.0 (minor)

### Fixed
- Resolved dual React instance issue (pnpm overrides for single canary version)
- Fixed all Biome lint violations across the entire codebase (~60 errors)
- Fixed CI bundle size job (heredoc for multi-line JSON in GITHUB_OUTPUT)
- Fixed changeset release for private WASM package
- Updated lockfile for release version bump

### Improved
- All `!` non-null assertions replaced with safe `as Type` casts
- Explicit return/parameter types on all exports (isolatedDeclarations compliance)
- Optimized search scorer to outperform cmdk on all benchmarks

### [0.9.0] - 2026-03-07

### Added — Core Engine (`@crimson_dev/command`)
- Pure TypeScript state machine with zero DOM dependencies
- Pluggable `SearchEngine` interface with built-in fuzzy scorer
- Incremental filtering — query-append optimization using set difference
- `FrecencyEngine` with time-based decay buckets (hour/day/week/month)
- `MemoryFrecencyStorage` (in-memory) and `IdbFrecencyStorage` (IndexedDB persistence)
- `KeyboardShortcutRegistry` with `RegExp.escape` parser and `Object.groupBy` conflict detection
- `TypedEmitter` with `WeakRef`-based GC-safe listeners
- Batched scheduler with `requestAnimationFrame`, `scheduler.yield()`, `isInputPending()`
- `FinalizationRegistry` dev-only leak detection for search engines
- All classes implement `Disposable` / `AsyncDisposable` for `using` / `await using`
- Branded types (`ItemId`, `GroupId`) for type-safe ID handling

### Added — React Adapter (`@crimson_dev/command-react`)
- 14 compound components: Command, Input, List, Item, Group, Empty, Loading, Separator, Dialog, Highlight, Shortcut, Badge, Page, AsyncItems
- `useSyncExternalStore` for tear-free state subscription
- `useTransition` for non-blocking search updates
- `useOptimistic` for instant active item visual feedback
- `useInsertionEffect` for paint-before-commit item registration
- `use()` hook for Suspense-powered async data loading
- `ref` as prop (React 19 native, no `forwardRef`)
- `"use client"` directive on all components
- Radix UI Dialog with focus trap, portal, overlay
- GPU-composited CSS animations: `@starting-style`, spring `linear()` easing, `scroll-timeline`
- Automatic virtualization when `filteredCount > 100`
- Full WAI-ARIA: combobox pattern, `aria-live`, `forced-colors`, `prefers-reduced-motion`, `prefers-contrast`
- `content-visibility: auto` for off-screen rendering skip
- Activity API (`<Offscreen>`) for state preservation

### Added — WASM Search (`@crimson_dev/command-search-wasm`)
- Rust trigram index compiled to WebAssembly
- `createWasmSearchEngine()` — main thread WASM search
- `createWorkerSearchEngine()` — Web Worker off-main-thread search
- `SharedArrayBuffer` zero-copy score transfer when cross-origin isolated
- Structured clone fallback for non-isolated contexts

### Added — Codemods (`@crimson_dev/command-codemod`)
- `import-rewrite` — `cmdk` to `@crimson_dev/command-react`
- `data-attrs` — `[cmdk-*]` to `[data-command-*]`
- `forward-ref` — Remove `forwardRef` wrappers
- `should-filter` — `shouldFilter` to `filter` prop rename
- CLI with `--dry-run`, `--transform`, file globbing

### ES2026 Features (native)
- Iterator Helpers (`.map`, `.filter`, `.toArray`, `.forEach`, `.some`, `.find`)
- `using` / `await using` for automatic resource cleanup
- `Promise.withResolvers()` for scheduler and worker communication
- `RegExp.escape` for keyboard shortcut parser
- `satisfies` for config validation
- `NoInfer<T>` for callback type inference
- Branded types for type-safe IDs

### Cross-browser helpers (replacing browser-incompatible APIs)
- Set operation helpers (`setIntersection`, `setDifference`, `setUnion`) replace `Set` methods
- `mapGroupBy` / `objectGroupBy` helpers replace `Map.groupBy` / `Object.groupBy`
- `Date.now()` replaces `Temporal.Now.instant()` and `Temporal.Duration`
- `Promise.resolve().then()` replaces `Promise.try()`
- `ensureWellFormed()` replaces `String.isWellFormed()`
- `+=` loops replace `Math.sumPrecise`

### Technical
- TypeScript 6.0.1-rc with `isolatedDeclarations`, `erasableSyntaxOnly`, `verbatimModuleSyntax`
- ESM-only, tree-shakeable, `sideEffects: false`
- Biome 2.4.6 (replaces ESLint + Prettier)
- Vitest 4.1.0-beta.6 with happy-dom
- Playwright 1.59.0-alpha for E2E
- tsdown 0.21.0 for builds
- pnpm 11.0.0-alpha.12 workspace
