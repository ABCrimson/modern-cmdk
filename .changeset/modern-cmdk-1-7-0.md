---
"modern-cmdk": minor
---

The palette's lifecycle, ids and telemetry are specified and tested: the open state is idempotent, one machine lives per mount through React StrictMode and `<Activity>`, `dispose()` is terminal, an `id` on an item or group is its registration id, and the machine reports telemetry itself. Production bundles drop the development-only code. Some of these are visible changes at rest; each one is listed under its heading, the deprecations and the 2.0 notes at the end.

**Open state and Command.Dialog**

- `OPEN` while open and `CLOSE` while closed no longer emit `openChange` or call `onOpenChange`, so a controlled `Command.Dialog` gets no echo at mount or on a redundant close (CE-48, ARCH-18, CE-117, DGX-CD-5).
- One Escape in `Command.Dialog` calls `onOpenChange(false)` once: Radix owns Escape inside the dialog, and the keydown handler skips an Escape that is already default-prevented (CE-118, RA-34).
- A controlled `Command.Dialog` follows its `open` prop: a parent that keeps `open={true}` keeps the dialog open after Escape or an outside click (RA-35, DG-20).
- A controlled `Command.Dialog` reports the palette's own open and close requests (a selection that closes, `CLOSE`, `OPEN` or `TOGGLE` from a shortcut or `send`) once through `onOpenChange` and keeps the `open` you pass (D109).
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
