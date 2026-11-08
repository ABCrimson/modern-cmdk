import type { CommandMachine, CommandState, ParsedShortcut } from 'modern-cmdk';
import { useData, useRouter } from 'vitepress';
import {
  computed,
  inject,
  nextTick,
  onScopeDispose,
  type Ref,
  type ShallowRef,
  shallowRef,
  watch,
} from 'vue';
import { usePageHref } from '../components/palette/href';
import type { PaletteEntry } from '../components/palette/types';

// The engine room of PaletteDemo.vue: it loads the real modern-cmdk core, runs one command machine, turns its
// state into group and row views, drives the hero autoplay and the actions. Everything that touches the
// window, the document or the platform sits behind onMounted's call to `mount()`; nothing here runs during SSR.
// Setup-time code only reads the VitePress router, site data and the injected appearance toggle.

/** The text the copy action writes: the install command of the published package. */
export const INSTALL_COMMAND = 'pnpm add modern-cmdk';

type Core = typeof import('modern-cmdk');

export interface PaletteRowView {
  readonly id: string;
  /** The DOM id of the option; stable per palette (derived from the row's position in the item list). */
  readonly optionId: string;
  readonly entry: PaletteEntry;
  readonly active: boolean;
}

export interface PaletteGroupView {
  readonly key: string;
  readonly headingId: string;
  readonly heading: string;
  /** Position among the visible groups, and the number of visible rows in the groups before it: the
   * component positions the group from these with `translate`. */
  readonly index: number;
  readonly rowsBefore: number;
  readonly rows: readonly PaletteRowView[];
}

export interface UsePaletteOptions {
  readonly mode: 'hero' | 'finder';
  /** Read once, when the engine loads. */
  readonly items: () => readonly PaletteEntry[];
  /** Applied as the first SEARCH_CHANGE when the engine loads (finder mode). */
  readonly initialQuery: () => string | undefined;
  /** The group heading shown above the server-rendered links, so the first row keeps its y through hydration. */
  readonly ssrHeading: () => string;
  /** Unique within the page: Vue's useId(), called by the component. */
  readonly uid: string;
  readonly elements: {
    readonly root: Readonly<Ref<HTMLElement | null>>;
    readonly input: Readonly<Ref<HTMLInputElement | null>>;
    readonly list: Readonly<Ref<HTMLElement | null>>;
  };
}

// Autoplay script (design-final.md §3.5): each word is typed at 90 ms a character as real SEARCH_CHANGE
// events, held 1.2 s, NAVIGATE next, held 1 s, then cleared at 40 ms a character. The three words make
// one cycle; at most two cycles run, then the palette rests on the empty query.
const AUTOPLAY_WORDS = ['frec', 'short', 'dark'] as const;
const AUTOPLAY_CYCLES = 2;
const TYPE_MS = 90;
const HOLD_TYPED_MS = 1200;
const HOLD_NAVIGATED_MS = 1000;
const CLEAR_MS = 40;
const WORD_GAP_MS = 500;
const RECHECK_MS = 250;
const LIVE_DEBOUNCE_MS = 400;
const COPIED_MS = 1600;
const HIGHLIGHT_NAME = 'mc-match';
const ABSOLUTE_URL = /^https?:\/\//i;

interface AutoplayStep {
  readonly wait: number;
  readonly run: () => void;
}

/** Iterator helpers are the one API family the core needs that older engines lack (`.toArray()` in the
 * filter pipeline, packages/modern-cmdk/src/core/machine.ts:131-137). */
function supportsIteratorHelpers(): boolean {
  return (
    typeof Iterator === 'function' &&
    typeof (Iterator.prototype as { toArray?: unknown }).toArray === 'function'
  );
}

/** matchesShortcut (core/keyboard/matcher.ts:11) compares `event.key`, which Option+Shift+letter turns
 * into another character on macOS; the physical key is the fallback when the modifiers agree. */
function matchesChord(core: Core, event: KeyboardEvent, shortcut: ParsedShortcut): boolean {
  if (core.matchesShortcut(event, shortcut)) return true;
  return (
    shortcut.key.length === 1 &&
    shortcut.meta === event.metaKey &&
    shortcut.ctrl === event.ctrlKey &&
    shortcut.shift === event.shiftKey &&
    shortcut.alt === event.altKey &&
    event.code === `Key${shortcut.key.toUpperCase()}`
  );
}

/** A click-shaped event at the centre of `element`, for the appearance transition's reveal origin. */
function syntheticClickAt(element: Element | null): MouseEvent {
  const box = element?.getBoundingClientRect();
  return new MouseEvent('click', {
    clientX: box ? box.left + box.width / 2 : 0,
    clientY: box ? box.top + box.height / 2 : 0,
  });
}

/** What PaletteDemo.vue binds: the refs unwrap in its template (it wraps this object in reactive()). */
export interface PaletteApi {
  readonly headingId: string;
  readonly listId: string;
  readonly ssrHeadingId: string;
  readonly ssrHeading: Readonly<Ref<string>>;
  readonly pageHref: (path: string) => string;
  /** False while the input is the server's read-only one; true from the start of mount, so typing is kept. */
  readonly editable: Readonly<Ref<boolean>>;
  readonly ready: Readonly<Ref<boolean>>;
  readonly query: Readonly<Ref<string>>;
  readonly groups: Readonly<Ref<readonly PaletteGroupView[]>>;
  readonly activeOptionId: Readonly<Ref<string | undefined>>;
  readonly resultCount: Readonly<Ref<number>>;
  /** Rows currently rendered, across all groups. */
  readonly rowCount: Readonly<Ref<number>>;
  readonly showEmpty: Readonly<Ref<boolean>>;
  readonly shownQuery: Readonly<Ref<string>>;
  readonly liveMessage: Readonly<Ref<string>>;
  readonly copiedId: Readonly<Ref<string | null>>;
  readonly shortcutLabels: Readonly<Ref<ReadonlyMap<string, string>>>;
  readonly autoplaying: Readonly<Ref<boolean>>;
  mount(): Promise<void>;
  activate(id: string): void;
  select(id: string, trigger?: Event): void;
  pauseAutoplay(): void;
  onInput(event: Event): void;
  onPanelKeydown(event: KeyboardEvent): void;
  onPanelPointerdown(event: PointerEvent): void;
  onPanelFocusin(event: FocusEvent): void;
  onPanelFocusout(event: FocusEvent): void;
  onPanelPointerenter(): void;
  onPanelPointerleave(): void;
}

export function usePalette(options: UsePaletteOptions): PaletteApi {
  const { uid, elements } = options;
  const router = useRouter();
  const { isDark } = useData();
  const pageHref = usePageHref();
  // VPSwitchAppearance.vue:6-8 (vitepress/dist/client/theme-default/components) injects 'toggle-appearance' and
  // falls back to flipping isDark; this does the same. The theme's Layout.vue (item 8) provides the key,
  // wired to transitionAppearance(event, isDark) from view-transitions.ts, so the palette's dark-mode row
  // plays the same circular reveal as the nav switch. Until it is provided, the fallback flips isDark.
  const toggleAppearance = inject<(event: MouseEvent) => void>('toggle-appearance', () => {
    isDark.value = !isDark.value;
  });

  /** True once the core is loaded, the machine runs and the combobox markup is live. */
  const ready = shallowRef(false);
  /** True from the start of mount() until the core fails to load: the input accepts typing while the core loads. */
  const editable = shallowRef(false);
  const query = shallowRef('');
  const state: ShallowRef<CommandState | null> = shallowRef(null);
  const liveMessage = shallowRef('');
  const copiedId = shallowRef<string | null>(null);
  /** The platform-formatted shortcut text per entry id; empty until mount (formatShortcut reads the platform). */
  const shortcutLabels: ShallowRef<ReadonlyMap<string, string>> = shallowRef(new Map());
  const autoplaying = shallowRef(false);

  let core: Core | null = null;
  let machine: CommandMachine | null = null;
  let subscription: Disposable | null = null;
  let disposed = false;
  let byId = new Map<string, PaletteEntry>();
  let indexById = new Map<string, number>();
  let shortcuts: { readonly entry: PaletteEntry; readonly parsed: ParsedShortcut }[] = [];
  let paintedHighlight = false;
  let liveTimer: ReturnType<typeof setTimeout> | undefined;
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  // ---- rows -------------------------------------------------------------------------------------------

  // Rows render from state.groupedIds (core/machine.ts:157), one group per heading text, in the map's
  // order (the group of the best match first).
  const groups = computed<readonly PaletteGroupView[]>(() => {
    const current = state.value;
    if (current === null) return [];
    const views: PaletteGroupView[] = [];
    let rowsBefore = 0;
    for (const ids of current.groupedIds.values()) {
      const rows: PaletteRowView[] = [];
      for (const id of ids) {
        const entry = byId.get(id);
        if (entry === undefined) continue;
        rows.push({
          id,
          optionId: `${uid}-o${indexById.get(id) ?? rows.length}`,
          entry,
          active: id === current.activeId,
        });
      }
      const first = rows[0];
      if (first === undefined) continue;
      views.push({
        key: first.entry.group,
        headingId: `${uid}-g${views.length}`,
        heading: first.entry.group,
        index: views.length,
        rowsBefore,
        rows,
      });
      rowsBefore += rows.length;
    }
    return views;
  });

  /** The row ids in the order the eye reads them. */
  const visualIds = computed<readonly string[]>(() =>
    groups.value.flatMap((group) => group.rows.map((row) => row.id)),
  );

  const activeOptionId = computed<string | undefined>(() => {
    for (const group of groups.value) {
      for (const row of group.rows) if (row.active) return row.optionId;
    }
    return undefined;
  });

  const rowCount = computed(() => groups.value.reduce((sum, group) => sum + group.rows.length, 0));
  const resultCount = computed(() => state.value?.filteredCount ?? 0);
  const showEmpty = computed(
    () =>
      ready.value &&
      state.value !== null &&
      state.value.filteredCount === 0 &&
      state.value.search !== '',
  );
  /** The query the rows were computed for; it trails `query` by one frame (the core batches in rAF). */
  const shownQuery = computed(() => state.value?.search ?? '');

  // ---- engine -----------------------------------------------------------------------------------------

  function applyQuery(value: string): void {
    query.value = value;
    const input = elements.input.value;
    if (input !== null && input.value !== value) input.value = value;
    // SEARCH_CHANGE: core/machine.ts:234. send() batches into the next animation frame (machine.ts:355).
    machine?.send({ type: 'SEARCH_CHANGE', query: value });
    // refilter keeps the previous active row while it still matches (machine.ts:163-166). A palette wants the
    // best match active after every query change, so Enter opens it: NAVIGATE first (machine.ts:184-190) runs
    // in the same batch, after the filter.
    machine?.send({ type: 'NAVIGATE', direction: 'first' });
  }

  /** send() batches into the next animation frame (machine.ts:355, utils/scheduler.ts:85), so state trails the input
   * by one frame. Enter and the arrows must act on the state of the query the visitor sees: when the state is
   * behind, run in the next frame, after the machine's own frame callback (registered first, so it runs first). */
  function whenSettled(run: () => void): void {
    const guarded = (): void => {
      if (!disposed) run();
    };
    if (state.value?.search === query.value) guarded();
    else requestAnimationFrame(guarded);
  }

  /** Arrow keys and the autoplay move the active row. When search ranking interleaves groups, the order the
   * eye reads (grouped) differs from state.filteredIds, which NAVIGATE walks (machine.ts:179-230); then the
   * neighbour in the grouped order is activated with ITEM_ACTIVATE (machine.ts:250) instead. Both wrap,
   * matching the machine's `loop: true`. */
  function move(direction: 'next' | 'prev'): void {
    whenSettled(() => moveNow(direction));
  }

  function moveNow(direction: 'next' | 'prev'): void {
    if (machine === null || state.value === null) return;
    const visual = visualIds.value;
    if (visual.length === 0) return;
    const flat = state.value.filteredIds;
    if (flat.length === visual.length && flat.every((id, index) => id === visual[index])) {
      machine.send({ type: 'NAVIGATE', direction });
      return;
    }
    const from = visual.indexOf(state.value.activeId ?? '');
    const to =
      from === -1
        ? direction === 'next'
          ? 0
          : visual.length - 1
        : (from + (direction === 'next' ? 1 : -1) + visual.length) % visual.length;
    const target = visual[to];
    const id = flat.find((candidate) => candidate === target);
    if (id !== undefined) machine.send({ type: 'ITEM_ACTIVATE', id });
  }

  function activate(id: string): void {
    if (machine === null || state.value === null || state.value.activeId === id) return;
    const known = state.value.filteredIds.find((candidate) => candidate === id);
    if (known !== undefined) machine.send({ type: 'ITEM_ACTIVATE', id: known });
  }

  async function copyInstall(entry: PaletteEntry): Promise<void> {
    // No clipboard (an insecure context, or a denied permission): nothing is claimed and nothing is shown.
    if (typeof navigator === 'undefined' || navigator.clipboard === undefined) return;
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND);
    } catch {
      return;
    }
    if (disposed) return;
    copiedId.value = entry.id;
    liveMessage.value = 'Copied';
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      copiedId.value = null;
    }, COPIED_MS);
  }

  /** The rendered option of an entry, if it is in the current result list. */
  function optionElement(entryId: string): HTMLElement | undefined {
    const options = elements.list.value?.querySelectorAll<HTMLElement>('[role="option"]');
    return options === undefined
      ? undefined
      : [...options].find((option) => option.dataset.mcEntry === entryId);
  }

  function perform(entry: PaletteEntry, trigger: Event | undefined): void {
    if (entry.action === 'copy-install') {
      void copyInstall(entry);
      return;
    }
    if (entry.action === 'toggle-dark') {
      const origin =
        trigger instanceof MouseEvent
          ? trigger
          : syntheticClickAt(
              optionElement(entry.id) ??
                elements.list.value?.querySelector('[role="option"][aria-selected="true"]') ??
                elements.root.value,
            );
      toggleAppearance(origin);
      return;
    }
    const href = entry.href;
    if (href === undefined) return;
    if (ABSOLUTE_URL.test(href)) {
      window.open(href, '_blank', 'noopener');
      return;
    }
    void router.go(pageHref(href));
  }

  /** Selecting records the choice with the machine (ITEM_SELECT, machine.ts:239: frecency counts it and the
   * rows re-rank) and runs the row's action directly, inside the user's gesture: the clipboard and window.open
   * both want one, and the machine would only call back a frame later. */
  function select(id: string, trigger?: Event): void {
    const entry = byId.get(id);
    if (entry === undefined || machine === null || core === null) return;
    machine.send({ type: 'ITEM_SELECT', id: core.itemId(id) });
    perform(entry, trigger);
  }

  // ---- matched characters ----------------------------------------------------------------------------

  // CSS Custom Highlight API (MDN "Baseline 2025", design-final.md §5): the ranges come from
  // scoreItem(query, item).matches (core/search/default-scorer.ts:29). Scoring a copy of the item without
  // keywords keeps the ranges on the visible label. No `CSS.highlights`: nothing is painted, nothing breaks.
  function paintMatches(): void {
    if (
      core === null ||
      typeof CSS === 'undefined' ||
      !('highlights' in CSS) ||
      typeof Highlight === 'undefined'
    )
      return;
    const search = shownQuery.value;
    const ranges: Range[] = [];
    const list = elements.list.value;
    if (search !== '' && list !== null) {
      for (const option of list.querySelectorAll<HTMLElement>('[role="option"]')) {
        const entry = byId.get(option.dataset.mcEntry ?? '');
        const text = option.querySelector('[data-mc="palette-label"]')?.firstChild;
        if (entry === undefined || !(text instanceof Text)) continue;
        const scored = core.scoreItem(search, { id: core.itemId(entry.id), value: entry.label });
        for (const [start, end] of scored?.matches ?? []) {
          if (start >= text.length) continue;
          const range = new Range();
          range.setStart(text, start);
          range.setEnd(text, Math.min(end, text.length));
          ranges.push(range);
        }
      }
    }
    if (ranges.length === 0) {
      if (paintedHighlight) CSS.highlights.delete(HIGHLIGHT_NAME);
      paintedHighlight = false;
      return;
    }
    CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges));
    paintedHighlight = true;
  }

  watch(state, paintMatches, { flush: 'post' });

  // ---- live region ------------------------------------------------------------------------------------

  /** "{n} results" 400 ms after the visitor stops typing. Only visitor input calls this: the autoplay stays silent. */
  function announceResultsSoon(): void {
    clearTimeout(liveTimer);
    liveMessage.value = '';
    liveTimer = setTimeout(() => {
      const count = state.value?.filteredCount ?? 0;
      liveMessage.value = count === 1 ? '1 result' : `${count} results`;
    }, LIVE_DEBOUNCE_MS);
  }

  // ---- autoplay ---------------------------------------------------------------------------------------

  let script: readonly AutoplayStep[] = [];
  let cursor = 0;
  let stepTimer: ReturnType<typeof setTimeout> | undefined;
  let inView = false;
  let interacted = false;
  let started = false;
  let hoverHold = false;
  let focusHold = false;
  let observer: IntersectionObserver | null = null;

  function buildScript(): AutoplayStep[] {
    const steps: AutoplayStep[] = [];
    for (let cycle = 0; cycle < AUTOPLAY_CYCLES; cycle++) {
      for (const word of AUTOPLAY_WORDS) {
        for (let length = 1; length <= word.length; length++) {
          steps.push({
            wait: length === 1 ? WORD_GAP_MS : TYPE_MS,
            run: () => applyQuery(word.slice(0, length)),
          });
        }
        steps.push({ wait: HOLD_TYPED_MS, run: () => move('next') });
        for (let length = word.length - 1; length >= 0; length--) {
          steps.push({
            wait: length === word.length - 1 ? HOLD_NAVIGATED_MS : CLEAR_MS,
            run: () => applyQuery(word.slice(0, length)),
          });
        }
      }
    }
    return steps;
  }

  function armStep(delay: number): void {
    clearTimeout(stepTimer);
    stepTimer = setTimeout(tick, delay);
  }

  function tick(): void {
    stepTimer = undefined;
    if (!autoplaying.value || disposed) return;
    // Off-screen: stop the timer; the IntersectionObserver callback resumes it. A hidden tab, or a hover or
    // focus on the Pause button, holds the script and looks again shortly. (A visibilitychange listener on
    // the document is not allowed here, so the hidden tab is polled.)
    if (!inView) return;
    if (document.hidden || hoverHold || focusHold) {
      armStep(RECHECK_MS);
      return;
    }
    const step = script[cursor];
    if (step === undefined) {
      autoplaying.value = false;
      return;
    }
    step.run();
    cursor++;
    const next = script[cursor];
    if (next === undefined) {
      autoplaying.value = false;
      return;
    }
    armStep(next.wait);
  }

  function startAutoplay(): void {
    if (started || interacted || options.mode !== 'hero') return;
    started = true;
    script = buildScript();
    cursor = 0;
    autoplaying.value = true;
    const first = script[0];
    if (first !== undefined) armStep(first.wait);
  }

  function onIntersect(entries: IntersectionObserverEntry[]): void {
    const latest = entries.at(-1);
    if (latest === undefined) return;
    inView = latest.isIntersecting && latest.intersectionRatio >= 0.5;
    if (!inView || interacted) return;
    if (started) {
      if (autoplaying.value && stepTimer === undefined) armStep(RECHECK_MS);
    } else {
      startAutoplay();
    }
  }

  /** The first pointerdown, focusin or keydown inside the panel ends the autoplay for the session and clears
   * the scripted query (WCAG 2.2.2). The Pause button is exempt so a visitor can reach and press it. */
  function interrupt(): void {
    if (interacted) return;
    interacted = true;
    const wasRunning = autoplaying.value;
    autoplaying.value = false;
    clearTimeout(stepTimer);
    stepTimer = undefined;
    observer?.disconnect();
    observer = null;
    if (wasRunning && query.value !== '') applyQuery('');
  }

  function isPauseButton(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest('[data-mc="palette-pause"]') !== null;
  }

  /** The Pause demo button: stop for good and hand focus to the input, since the button leaves the footer. */
  function pauseAutoplay(): void {
    interrupt();
    focusHold = false;
    void nextTick().then(() => elements.input.value?.focus({ preventScroll: true }));
  }

  // ---- events the component wires to the panel --------------------------------------------------------

  function onPanelPointerdown(event: PointerEvent): void {
    if (!isPauseButton(event.target)) interrupt();
  }

  function onPanelFocusin(event: FocusEvent): void {
    if (isPauseButton(event.target)) focusHold = true;
    else interrupt();
  }

  function onPanelFocusout(event: FocusEvent): void {
    if (isPauseButton(event.target)) focusHold = false;
  }

  function onPanelPointerenter(): void {
    hoverHold = true;
  }

  function onPanelPointerleave(): void {
    hoverHold = false;
  }

  function onInput(event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    // Before the core loads there is no machine: keep the text, mount() replays it as the first SEARCH_CHANGE.
    if (machine === null) {
      query.value = event.target.value;
      return;
    }
    applyQuery(event.target.value);
    announceResultsSoon();
  }

  /** One handler on the panel root: the palette registers no global listener, so Alt+Shift+C and Alt+Shift+D
   * work only while focus is inside the panel, and Mod+K is left alone for the VitePress search. */
  function onPanelKeydown(event: KeyboardEvent): void {
    if (!ready.value || core === null) return;
    if (!isPauseButton(event.target)) interrupt();
    if (event.defaultPrevented) return;
    for (const { entry, parsed } of shortcuts) {
      if (matchesChord(core, event, parsed)) {
        event.preventDefault();
        select(entry.id, event);
        return;
      }
    }
    const input = elements.input.value;
    if (event.target !== input || event.isComposing) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move('next');
        break;
      case 'ArrowUp':
        event.preventDefault();
        move('prev');
        break;
      case 'Enter': {
        event.preventDefault();
        whenSettled(() => {
          const activeId = state.value?.activeId;
          if (activeId != null) select(activeId, event);
        });
        break;
      }
      case 'Escape':
        // Escape clears the query; a second Escape (empty query) leaves the input.
        if (query.value !== '') {
          event.preventDefault();
          applyQuery('');
          announceResultsSoon();
        } else {
          input?.blur();
        }
        break;
    }
  }

  /** Keeps the active row inside the list's own scrollbox without scrolling the page. */
  function keepActiveRowVisible(): void {
    const list = elements.list.value;
    const row = list?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
    const scroller = list;
    if (!row || !scroller) return;
    // Rows are placed with `translate`, which offsetTop ignores: measure with the boxes.
    const top =
      row.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    const bottom = top + row.offsetHeight;
    if (state.value?.activeId === visualIds.value[0]) scroller.scrollTop = 0;
    else if (top < scroller.scrollTop) scroller.scrollTop = top;
    else if (bottom > scroller.scrollTop + scroller.clientHeight)
      scroller.scrollTop = bottom - scroller.clientHeight;
  }

  watch(activeOptionId, () => keepActiveRowVisible(), { flush: 'post' });

  // ---- mount ------------------------------------------------------------------------------------------

  /** Called from onMounted. Loads the core on demand (its own chunk), builds the machine and swaps the server
   * markup for the combobox. Any failure leaves the server-rendered link list in place: a working navigation block. */
  async function mount(): Promise<void> {
    if (!supportsIteratorHelpers()) return;
    // Typing is accepted while the core loads and replayed as the first SEARCH_CHANGE once the machine exists.
    editable.value = true;
    try {
      core = await import('modern-cmdk');
    } catch {
      // The server link list stays; the input goes back to read-only and drops what was typed.
      editable.value = false;
      query.value = '';
      return;
    }
    if (disposed) return;

    const entries = options.items();
    byId = new Map(entries.map((entry) => [entry.id, entry]));
    indexById = new Map(entries.map((entry, index) => [entry.id, index]));
    const labels = new Map<string, string>();
    shortcuts = [];
    for (const entry of entries) {
      if (entry.shortcut === undefined) continue;
      const parsed = core.parseShortcut(entry.shortcut);
      shortcuts.push({ entry, parsed });
      labels.set(entry.id, core.formatShortcut(parsed));
    }

    // createCommandMachine: core/machine.ts:58. `frecency.enabled` builds the engine on the default memory
    // storage (core/frecency/index.ts:74): nothing persists and IndexedDB is never touched. `loop: true` is
    // core/types.ts:190. Groups are not registered; groupedIds follows filteredIds (machine.ts:157-160): item-list order on the empty query, rank order otherwise.
    const loaded = core;
    machine = loaded.createCommandMachine({
      items: entries.map((entry) => ({
        id: loaded.itemId(entry.id),
        value: entry.label,
        groupId: loaded.groupId(entry.group),
        ...(entry.keywords === undefined ? {} : { keywords: entry.keywords }),
      })),
      frecency: { enabled: true },
      loop: true,
    });
    state.value = machine.getState();
    // subscribeState: core/machine.ts:366. The listener is dropped, then the machine disposed
    // ([Symbol.dispose], machine.ts:386), in onScopeDispose below.
    subscription = machine.subscribeState((next) => {
      state.value = next;
    });

    const input = elements.input.value;
    const root = elements.root.value;
    const hadFocus =
      root !== null && document.activeElement !== null && root.contains(document.activeElement);
    const typedBeforeHydration = input?.value ?? query.value;
    shortcutLabels.value = labels;
    ready.value = true;

    // Replay what was typed before the engine loaded (or the finder's initial query) as the first SEARCH_CHANGE.
    const first =
      typedBeforeHydration !== '' ? typedBeforeHydration : (options.initialQuery() ?? '');
    if (first !== '') {
      applyQuery(first);
      // Text the visitor typed while the core loaded is announced like any typing; the finder's prefill and the autoplay stay silent.
      if (typedBeforeHydration !== '') announceResultsSoon();
    }

    await nextTick();
    if (disposed) return;
    // The server link list is gone; a focused link would have dropped focus to the body.
    if (hadFocus) elements.input.value?.focus({ preventScroll: true });

    if (
      options.mode === 'hero' &&
      first === '' &&
      typeof IntersectionObserver === 'function' &&
      matchMedia('(prefers-reduced-motion: no-preference)').matches
    ) {
      observer = new IntersectionObserver(onIntersect, { threshold: [0, 0.5, 1] });
      if (root !== null) observer.observe(root);
    }
  }

  onScopeDispose(() => {
    disposed = true;
    clearTimeout(stepTimer);
    clearTimeout(liveTimer);
    clearTimeout(copiedTimer);
    observer?.disconnect();
    observer = null;
    if (paintedHighlight && typeof CSS !== 'undefined' && 'highlights' in CSS)
      CSS.highlights.delete(HIGHLIGHT_NAME);
    subscription?.[Symbol.dispose]();
    subscription = null;
    machine?.[Symbol.dispose]();
    machine = null;
  });

  return {
    headingId: `${uid}-h`,
    listId: `${uid}-list`,
    ssrHeadingId: `${uid}-ssr-h`,
    ssrHeading: computed(() => options.ssrHeading()),
    pageHref,
    editable,
    ready,
    query,
    groups,
    activeOptionId,
    resultCount,
    rowCount,
    showEmpty,
    shownQuery,
    liveMessage,
    copiedId,
    shortcutLabels,
    autoplaying,
    mount,
    activate,
    select,
    pauseAutoplay,
    onInput,
    onPanelKeydown,
    onPanelPointerdown,
    onPanelFocusin,
    onPanelFocusout,
    onPanelPointerenter,
    onPanelPointerleave,
  };
}
