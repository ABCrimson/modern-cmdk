// tests/unit/cmdk-parity-adapters.tsx
// The two adapters of the cmdk parity suite (tests/unit/cmdk-comparison.test.tsx), the fixture they
// render, and the observation helpers both share.
//
// A parity case describes one palette as data (a `ParityFixture`) and observes it through a
// `ParitySession`. The adapter of each library translates the fixture into that library's
// components and props, and carries that library's attribute vocabulary (`names`). The session
// reads the rendered DOM through those names and returns plain JSON, so a delta-table row can
// store what a library did.
//
// A translation exists only where the library has a prop for the intent: a documented one, or a
// prop the component passes through to its element, as named below:
//   - `root.filter: 'off'`: cmdk `shouldFilter={false}`, modern-cmdk `filter={false}`.
//   - `root.filter` as a function: cmdk `filter(value, search, keywords)`; modern-cmdk
//     `filter(item, query)`, wrapped so the function sees the same arguments.
//   - `root.active`: cmdk `value` and `onValueChange` (the active item's value); modern-cmdk
//     `activeId` and `onActiveChange` (the active item's id). A fixture that uses it gives every
//     item an `id` equal to its value, which modern-cmdk uses as the item id; cmdk overwrites the
//     id, so it keys the active item by value alone.
//   - `list.label`: cmdk `<Command.List label>`. modern-cmdk documents no List label prop: its
//     List spreads the caller's props after its own `aria-label` (src/react/list.tsx), so an
//     `aria-label` passed to `<Command.List>` overrides the root label; that is the translation.
// An intent with no counterpart renders nothing in the other library: cmdk's `forceMount`,
// `vimBindings`, `defaultValue` and `disablePointerSelection` have no modern-cmdk prop, and
// modern-cmdk's item `id` is a plain div attribute in cmdk, which then overwrites it. The case
// records the difference.

import { Command as CmdkCommand } from 'cmdk';
import { type CommandItem as CoreCommandItem, itemId } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

/** What a delta-table row stores: anything `JSON.stringify` keeps. */
export type Json =
  | null
  | boolean
  | number
  | string
  | readonly Json[]
  | { readonly [key: string]: Json };

/** cmdk's filter shape: a score in 0..1, where 0 hides the item. */
export type ScoreFunction = (
  value: string,
  search: string,
  keywords?: readonly string[] | undefined,
) => number;

/** An argument list is recorded as it arrives, so the handler accepts anything. */
export type SelectHandler = (...args: unknown[]) => void;

export interface ItemNode {
  readonly kind: 'item';
  readonly value: string;
  /** The rendered text; defaults to `value`. */
  readonly text?: string;
  readonly keywords?: readonly string[];
  readonly disabled?: boolean;
  readonly onSelect?: SelectHandler;
  /** modern-cmdk: the DOM id. cmdk: spread as a div attribute, then overwritten by its own id. */
  readonly id?: string;
  /** cmdk only: modern-cmdk has no equivalent, and renders the item without it. */
  readonly forceMount?: boolean;
}

export interface GroupNode {
  readonly kind: 'group';
  readonly heading?: string;
  readonly id?: string;
  /** cmdk only. */
  readonly forceMount?: boolean;
  readonly children: readonly ParityNode[];
}

export interface SeparatorNode {
  readonly kind: 'separator';
  readonly alwaysRender?: boolean;
}

export interface EmptyNode {
  readonly kind: 'empty';
  readonly text: string;
}

/** A visible loading indicator: cmdk always renders it; modern-cmdk gets `loading` set. */
export interface LoadingNode {
  readonly kind: 'loading';
  readonly text: string;
}

export type ParityNode = ItemNode | GroupNode | SeparatorNode | EmptyNode | LoadingNode;

export interface RootOptions {
  readonly label?: string;
  readonly loop?: boolean;
  /** `'off'`: the library does no filtering. A function: the library's filter, in cmdk's shape. */
  readonly filter?: 'off' | ScoreFunction;
  /** cmdk only (`vimBindings`). modern-cmdk has no vim bindings, so it renders without. */
  readonly vimBindings?: boolean;
  /** cmdk only (`defaultValue`, the initial active value); modern-cmdk renders without. */
  readonly defaultValue?: string;
  /** cmdk only (`disablePointerSelection`). modern-cmdk has none, so it renders without. */
  readonly disablePointerSelection?: boolean;
  /** The controlled active item; see the header for the per-library props. */
  readonly active?: { readonly value: string; readonly onChange: (key: string) => void };
}

export interface InputOptions {
  readonly placeholder?: string;
  readonly value?: string;
  readonly onValueChange?: (value: string) => void;
}

export interface ListOptions {
  /** cmdk `label`, modern-cmdk `aria-label`. */
  readonly label?: string;
}

export interface DialogOptions {
  readonly open: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly label?: string;
}

export interface ParityFixture {
  readonly root?: RootOptions;
  /** `false` renders no input. */
  readonly input?: InputOptions | false;
  readonly list?: ListOptions;
  readonly children: readonly ParityNode[];
  /** Wraps the palette in the library's Dialog: root options go on the Dialog, the tree inside. */
  readonly dialog?: DialogOptions;
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

export const PART_NAMES = [
  'root',
  'input',
  'list',
  'item',
  'group',
  'groupHeading',
  'groupItems',
  'separator',
  'empty',
  'loading',
  'dialog',
  'overlay',
  'label',
] as const;

export type PartName = (typeof PART_NAMES)[number];

/** A library's attribute vocabulary. A `null` selector is a part the library does not render. */
export interface ParityNames {
  readonly parts: Readonly<Record<PartName, string | null>>;
  /** Selects the active item among the items. */
  readonly activeItem: string;
  /** The custom property `<List>` writes its measured height to. */
  readonly listHeight: string;
  /** The prefixes of the library's own attributes, kept by `dataAttributes`. */
  readonly attributePrefixes: readonly string[];
}

export interface ParityAdapter {
  readonly key: 'cmdk' | 'modernCmdk';
  /** The describe title: the library and its version. */
  readonly name: string;
  readonly names: ParityNames;
  /** The library's `Command` namespace, to observe which components exist. */
  readonly namespace: object;
  readonly render: (fixture: ParityFixture) => ReactNode;
}

// ---------------------------------------------------------------------------
// Prop-map helpers
// ---------------------------------------------------------------------------

/** `{ [key]: value }`, or nothing for undefined (exactOptionalPropertyTypes rejects undefined). */
function when<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return value === undefined ? {} : ({ [key]: value } as { [P in K]: V });
}

// ---------------------------------------------------------------------------
// cmdk 1.1.1
// ---------------------------------------------------------------------------

function renderCmdkNode(node: ParityNode, key: number): ReactNode {
  switch (node.kind) {
    case 'item':
      return (
        <CmdkCommand.Item
          key={key}
          value={node.value}
          {...when('keywords', node.keywords && [...node.keywords])}
          {...when('disabled', node.disabled)}
          {...when('onSelect', node.onSelect)}
          {...when('id', node.id)}
          {...when('forceMount', node.forceMount)}
        >
          {node.text ?? node.value}
        </CmdkCommand.Item>
      );
    case 'group':
      return (
        <CmdkCommand.Group
          key={key}
          {...when('heading', node.heading)}
          {...when('id', node.id)}
          {...when('forceMount', node.forceMount)}
        >
          {node.children.map(renderCmdkNode)}
        </CmdkCommand.Group>
      );
    case 'separator':
      return <CmdkCommand.Separator key={key} {...when('alwaysRender', node.alwaysRender)} />;
    case 'empty':
      return <CmdkCommand.Empty key={key}>{node.text}</CmdkCommand.Empty>;
    case 'loading':
      return <CmdkCommand.Loading key={key}>{node.text}</CmdkCommand.Loading>;
  }
}

function renderCmdk(fixture: ParityFixture): ReactNode {
  const { root, input, list, dialog } = fixture;
  const rootProps = {
    ...when('label', root?.label),
    ...when('loop', root?.loop),
    ...when('vimBindings', root?.vimBindings),
    ...when('defaultValue', root?.defaultValue),
    ...when('disablePointerSelection', root?.disablePointerSelection),
    ...(root?.filter === 'off' ? { shouldFilter: false } : when('filter', root?.filter)),
    ...(root?.active ? { value: root.active.value, onValueChange: root.active.onChange } : {}),
  };
  const body: ReactNode = (
    <>
      {input === false ? null : (
        <CmdkCommand.Input
          {...when('placeholder', input?.placeholder)}
          {...when('value', input?.value)}
          {...when('onValueChange', input?.onValueChange)}
        />
      )}
      <CmdkCommand.List {...when('label', list?.label)}>
        {fixture.children.map(renderCmdkNode)}
      </CmdkCommand.List>
    </>
  );
  if (dialog) {
    return (
      <CmdkCommand.Dialog
        open={dialog.open}
        {...when('onOpenChange', dialog.onOpenChange)}
        {...when('label', dialog.label)}
        {...rootProps}
      >
        {body}
      </CmdkCommand.Dialog>
    );
  }
  return <CmdkCommand {...rootProps}>{body}</CmdkCommand>;
}

export const cmdkAdapter: ParityAdapter = {
  key: 'cmdk',
  name: 'cmdk 1.1.1',
  names: {
    parts: {
      root: '[cmdk-root]',
      input: '[cmdk-input]',
      list: '[cmdk-list]',
      item: '[cmdk-item]',
      group: '[cmdk-group]',
      groupHeading: '[cmdk-group-heading]',
      groupItems: '[cmdk-group-items]',
      separator: '[cmdk-separator]',
      empty: '[cmdk-empty]',
      loading: '[cmdk-loading]',
      dialog: '[cmdk-dialog]',
      overlay: '[cmdk-overlay]',
      label: '[cmdk-label]',
    },
    activeItem: '[cmdk-item][data-selected="true"]',
    listHeight: '--cmdk-list-height',
    attributePrefixes: ['cmdk-', 'data-'],
  },
  namespace: CmdkCommand,
  render: renderCmdk,
};

// ---------------------------------------------------------------------------
// modern-cmdk
// ---------------------------------------------------------------------------

function renderModernNode(node: ParityNode, key: number): ReactNode {
  switch (node.kind) {
    case 'item':
      return (
        <Command.Item
          key={key}
          value={node.value}
          {...when('keywords', node.keywords)}
          {...when('disabled', node.disabled)}
          {...when('onSelect', node.onSelect)}
          {...when('id', node.id)}
        >
          {node.text ?? node.value}
        </Command.Item>
      );
    case 'group':
      return (
        <Command.Group key={key} {...when('heading', node.heading)} {...when('id', node.id)}>
          {node.children.map(renderModernNode)}
        </Command.Group>
      );
    case 'separator':
      return <Command.Separator key={key} {...when('alwaysRender', node.alwaysRender)} />;
    case 'empty':
      return <Command.Empty key={key}>{node.text}</Command.Empty>;
    case 'loading':
      return (
        <Command.Loading key={key} loading>
          {node.text}
        </Command.Loading>
      );
  }
}

/** cmdk's `(value, search, keywords)` score as modern-cmdk's `(item, query)` filter. */
function toModernFilter(
  score: ScoreFunction,
): (item: CoreCommandItem, query: string) => number | false {
  return (item: CoreCommandItem, query: string): number | false =>
    score(item.value, query, item.keywords);
}

function renderModern(fixture: ParityFixture): ReactNode {
  const { root, input, list, dialog } = fixture;
  const active = root?.active;
  const rootProps = {
    ...when('label', root?.label),
    ...when('loop', root?.loop),
    ...(root?.filter === 'off'
      ? { filter: false as const }
      : root?.filter
        ? { filter: toModernFilter(root.filter) }
        : {}),
    ...(active
      ? {
          activeId: itemId(active.value),
          onActiveChange: (id: string | null): void => active.onChange(id ?? ''),
        }
      : {}),
  };
  const body: ReactNode = (
    <>
      {input === false ? null : (
        <Command.Input
          {...when('placeholder', input?.placeholder)}
          {...when('value', input?.value)}
          {...when('onValueChange', input?.onValueChange)}
        />
      )}
      <Command.List {...when('aria-label', list?.label)}>
        {fixture.children.map(renderModernNode)}
      </Command.List>
    </>
  );
  if (dialog) {
    return (
      <Command.Dialog
        open={dialog.open}
        {...when('onOpenChange', dialog.onOpenChange)}
        {...when('label', dialog.label)}
        {...rootProps}
      >
        {body}
      </Command.Dialog>
    );
  }
  return <Command {...rootProps}>{body}</Command>;
}

export const modernCmdkAdapter: ParityAdapter = {
  key: 'modernCmdk',
  name: 'modern-cmdk',
  names: {
    parts: {
      root: '[data-command-root]',
      input: '[data-command-input]',
      list: '[data-command-list]',
      item: '[data-command-item]',
      group: '[data-command-group]',
      groupHeading: '[data-command-group-heading]',
      groupItems: '[data-command-group-items]',
      separator: '[data-command-separator]',
      empty: '[data-command-empty]',
      loading: '[data-command-loading]',
      dialog: '[data-command-dialog]',
      overlay: '[data-command-overlay]',
      label: null,
    },
    activeItem: '[data-command-item][data-active]',
    listHeight: '--command-list-height',
    attributePrefixes: ['data-'],
  },
  namespace: Command,
  render: renderModern,
};

/** Exactly two adapters, cmdk first. */
export const adapters: readonly [ParityAdapter, ParityAdapter] = [cmdkAdapter, modernCmdkAdapter];

// ---------------------------------------------------------------------------
// ResizeObserver stub
// ---------------------------------------------------------------------------

/** The height both libraries' lists measure under the stub. */
export const LIST_HEIGHT = 137.5;

/**
 * happy-dom 21.0.4's ResizeObserver does nothing (`observe()` is a no-op), so no list measures
 * a height. The stub serves both libraries. cmdk's List observes its `[cmdk-list-sizer]` child
 * and, in a requestAnimationFrame, writes `sizer.offsetHeight.toFixed(1)px`. modern-cmdk's List
 * writes `entry.contentRect.height.toFixed(1)px` of the entry its observer receives. So
 * `observe(target)` defines `offsetHeight` on that target instance as `LIST_HEIGHT` and reports
 * one entry for it in a microtask. After `disconnect()` or `unobserve(target)` it reports nothing
 * more for the target. Install it with `vi.stubGlobal('ResizeObserver', ListHeightResizeObserver)`.
 */
export class ListHeightResizeObserver implements ResizeObserver {
  readonly #callback: ResizeObserverCallback;
  readonly #targets = new Set<Element>();

  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback;
  }

  observe(target: Element): void {
    Object.defineProperty(target, 'offsetHeight', { configurable: true, value: LIST_HEIGHT });
    this.#targets.add(target);
    queueMicrotask(() => {
      if (!this.#targets.has(target)) return;
      const entry = { target, contentRect: { height: LIST_HEIGHT } } as ResizeObserverEntry;
      this.#callback([entry], this);
    });
  }

  unobserve(target: Element): void {
    this.#targets.delete(target);
  }

  disconnect(): void {
    this.#targets.clear();
  }
}

// ---------------------------------------------------------------------------
// Frames and mounting
// ---------------------------------------------------------------------------

/**
 * Resolves after the next animation frame. modern-cmdk's machine batches its events with
 * requestAnimationFrame (happy-dom 21.0.4's is setImmediate-backed and FIFO), so a frame queued
 * after a machine event runs after the machine's batch has been applied. cmdk renders inside act()
 * itself, so the extra frame is harmless for it.
 */
const nextFrame = (): Promise<void> => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** nextFrame inside act(): the machine's batch commits its state change, which React renders. */
export const flushFrame = (): Promise<void> => act(async () => await nextFrame());

const nextTask = (): Promise<void> => new Promise<void>((r) => setTimeout(r, 0));

let mounted: { readonly container: HTMLDivElement; readonly root: Root } | undefined;

/** Unmounts the palette `mountParity` rendered, inside act() so React's passive effects flush. */
export async function unmountParity(): Promise<void> {
  if (!mounted) return;
  const { container, root } = mounted;
  mounted = undefined;
  await act(async () => {
    root.unmount();
  });
  container.remove();
}

/** Renders the fixture with the adapter into a fresh container (one palette at a time). */
export async function mountParity(
  adapter: ParityAdapter,
  fixture: ParityFixture,
): Promise<ParitySession> {
  await unmountParity();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => {
    root.render(adapter.render(fixture));
  });
  await flushFrame();
  // Radix registers its outside-pointer listener in a timeout after the dialog mounts
  if (fixture.dialog) await act(nextTask);
  // A dialog portals into document.body, so its content is outside the container
  return new ParitySession(adapter, fixture.dialog ? document.body : container, root);
}

/**
 * The server-rendered HTML of the fixture (`renderToString`), parsed into a detached element. The
 * session is read-only: nothing is hydrated, so interactions are unavailable.
 */
export function renderServer(adapter: ParityAdapter, fixture: ParityFixture): ParitySession {
  const probe = document.createElement('div');
  probe.innerHTML = renderToString(adapter.render(fixture));
  return new ParitySession(adapter, probe, undefined);
}

// ---------------------------------------------------------------------------
// Session: observations and interactions
// ---------------------------------------------------------------------------

/** `role` and every `aria-*` attribute of a part; an id reference is a token (see `aria`). */
export type AriaObservation = { readonly [attribute: string]: string };

/** How a group hides itself: the `hidden` attribute, an inline `display: none`, or neither. */
export type GroupState = {
  readonly heading: string | null;
  readonly hiddenAttribute: boolean;
  readonly displayNone: boolean;
  readonly itemsRendered: number;
};

const ID_REFERENCE_ATTRIBUTES = new Set([
  'aria-activedescendant',
  'aria-controls',
  'aria-describedby',
  'aria-labelledby',
  'aria-owns',
]);

const bySortedKey = ([a]: [string, string], [b]: [string, string]): number =>
  a < b ? -1 : a > b ? 1 : 0;

export class ParitySession {
  readonly adapter: ParityAdapter;
  /** Where observations look: the container, `document.body` for a dialog, or the server probe. */
  readonly scope: Element;
  readonly #root: Root | undefined;

  constructor(adapter: ParityAdapter, scope: Element, root: Root | undefined) {
    this.adapter = adapter;
    this.scope = scope;
    this.#root = root;
  }

  /** Renders another fixture into the same container. */
  async rerender(fixture: ParityFixture): Promise<void> {
    const root = this.#root;
    if (!root) throw new Error('a server-HTML session cannot rerender');
    await act(async () => {
      root.render(this.adapter.render(fixture));
    });
    await flushFrame();
  }

  // -- Queries ----------------------------------------------------------------------------------

  /** Every element of the part under the library's own name; none for a part it lacks. */
  parts(part: PartName): Element[] {
    const selector = this.adapter.names.parts[part];
    return selector === null ? [] : [...this.scope.querySelectorAll(selector)];
  }

  part(part: PartName): Element | null {
    return this.parts(part)[0] ?? null;
  }

  /**
   * True when neither the element nor an ancestor below the scope has the `hidden` attribute or an
   * inline `display: none`. Only those two are read: no stylesheet is applied, so a rule that hides
   * a part through CSS counts as shown.
   */
  isShown(element: Element): boolean {
    for (let at: Element | null = element; at && at !== this.scope; at = at.parentElement) {
      if (at.hasAttribute('hidden')) return false;
      if ((at as HTMLElement).style.display === 'none') return false;
    }
    return true;
  }

  #shownItems(): Element[] {
    return this.parts('item').filter((item) => this.isShown(item));
  }

  /** The `data-value` of every shown item in DOM order (both libraries write the value there). */
  shownValues(): string[] {
    return this.#shownItems().map((item) => item.getAttribute('data-value') ?? '');
  }

  /** The text of every shown item in DOM order; cmdk writes no `data-value` into server HTML. */
  shownTexts(): string[] {
    return this.#shownItems().map((item) => item.textContent ?? '');
  }

  /** The `data-value` of the shown item under the library's active-item marker, or null. */
  activeValue(): string | null {
    const active = [...this.scope.querySelectorAll(this.adapter.names.activeItem)].find((item) =>
      this.isShown(item),
    );
    return active?.getAttribute('data-value') ?? null;
  }

  /** True when an Empty element exists and is shown. */
  emptyShown(): boolean {
    return this.parts('empty').some((empty) => this.isShown(empty));
  }

  /** True when a Separator element exists and is shown. */
  separatorShown(): boolean {
    return this.parts('separator').some((separator) => this.isShown(separator));
  }

  /** For each part, whether the library renders it under its own name. */
  partsPresent(parts: readonly PartName[]): Record<string, boolean> {
    return Object.fromEntries(parts.map((part) => [part, this.part(part) !== null]));
  }

  /** How each group hides itself, in DOM order. */
  groupStates(): GroupState[] {
    return this.parts('group').map((group) => ({
      heading:
        group.querySelector(this.adapter.names.parts.groupHeading ?? '')?.textContent ?? null,
      hiddenAttribute: group.hasAttribute('hidden'),
      displayNone: (group as HTMLElement).style.display === 'none',
      itemsRendered: group.querySelectorAll(this.adapter.names.parts.item ?? '').length,
    }));
  }

  /** The value of the library's list-height custom property on its List element ('' when unset). */
  listHeight(): string {
    const list = this.part('list') as HTMLElement | null;
    return list?.style.getPropertyValue(this.adapter.names.listHeight) ?? '';
  }

  /** An attribute of the element, or null when it is absent. */
  attribute(target: PartName | Element | null, name: string): string | null {
    const element = typeof target === 'string' ? this.part(target) : target;
    return element?.getAttribute(name) ?? null;
  }

  /** The current text of the input. */
  inputValue(): string | null {
    return (this.part('input') as HTMLInputElement | null)?.value ?? null;
  }

  // -- Attribute observations -------------------------------------------------------------------

  /**
   * `role` and every `aria-*` attribute of the element, keys sorted. An attribute that
   * references an element (`aria-controls`, `aria-activedescendant`, `aria-labelledby`,
   * `aria-describedby`, `aria-owns`, a label's `for`) is recorded as a token naming the
   * referenced element, because generated ids differ between libraries and runs: `list`, `input`,
   * `root`, `label`, `item:<value>`, `group-heading:<text>`, `other:<tag>` for any other element,
   * or `missing`.
   */
  aria(target: PartName | Element | null): AriaObservation | null {
    const element = typeof target === 'string' ? this.part(target) : target;
    if (!element) return null;
    const entries: Array<[string, string]> = [];
    for (const { name, value } of element.attributes) {
      const isFor = name === 'for' && element.localName === 'label';
      if (name === 'role' || name.startsWith('aria-') || isFor) {
        const referencing = ID_REFERENCE_ATTRIBUTES.has(name) || isFor;
        entries.push([name, referencing ? this.#token(value) : value]);
      }
    }
    return Object.fromEntries(entries.sort(bySortedKey));
  }

  #token(id: string): string {
    const element = this.scope.querySelector(`[id="${CSS.escape(id)}"]`);
    if (!element) return 'missing';
    const { parts } = this.adapter.names;
    if (parts.list && element.matches(parts.list)) return 'list';
    if (parts.input && element.matches(parts.input)) return 'input';
    if (parts.root && element.matches(parts.root)) return 'root';
    if (parts.label && element.matches(parts.label)) return 'label';
    if (parts.item && element.matches(parts.item)) {
      return `item:${element.getAttribute('data-value') ?? element.textContent ?? ''}`;
    }
    if (parts.groupHeading && element.matches(parts.groupHeading)) {
      return `group-heading:${element.textContent ?? ''}`;
    }
    return `other:${element.localName}`;
  }

  /**
   * The raw attribute map of the element: every attribute whose name starts with one of the
   * library's `attributePrefixes` (`data-*`, and cmdk's `cmdk-*`), keys sorted. The names differ
   * between the libraries, which is the observation.
   */
  dataAttributes(target: PartName | Element | null): Record<string, string> | null {
    const element = typeof target === 'string' ? this.part(target) : target;
    if (!element) return null;
    const { attributePrefixes } = this.adapter.names;
    const entries: Array<[string, string]> = [...element.attributes]
      .filter(({ name }) => attributePrefixes.some((prefix) => name.startsWith(prefix)))
      .map(({ name, value }): [string, string] => [name, value]);
    return Object.fromEntries(entries.sort(bySortedKey));
  }

  /** The shown item with the value, or null. */
  item(value: string): Element | null {
    return this.#shownItems().find((el) => el.getAttribute('data-value') === value) ?? null;
  }

  // -- Interactions -----------------------------------------------------------------------------

  /** Types into the input as the browser does: the native value setter, then input and change. */
  async type(text: string): Promise<void> {
    const input = this.part('input') as HTMLInputElement | null;
    if (!input) throw new Error('there is no input to type into');
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
        ?.set as (v: string) => void;
      set.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flushFrame();
  }

  /** Dispatches a keydown from the input (or the root when there is none). */
  async press(key: string, init?: KeyboardEventInit): Promise<void> {
    const target = this.part('input') ?? this.part('root');
    if (!target) throw new Error('there is nothing to press a key on');
    await act(async () => {
      target.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
      );
    });
    await flushFrame();
  }

  /** Clicks the shown item with the value. */
  async click(value: string): Promise<void> {
    const item = this.item(value);
    if (!item) throw new Error(`there is no shown item "${value}" to click`);
    await act(async () => {
      (item as HTMLElement).click();
    });
    await flushFrame();
  }

  /** Moves the pointer over the shown item with the value, which activates it in both libraries. */
  async hover(value: string): Promise<void> {
    const item = this.item(value);
    if (!item) throw new Error(`there is no shown item "${value}" to hover`);
    await act(async () => {
      item.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }));
    });
    await flushFrame();
  }

  /**
   * A mouse click on the part as the browser sends it: pointerdown, then click. Radix reads that
   * pair, on an element outside the dialog content, as a dismissal (it defers the pointerdown until
   * the click arrives).
   */
  async clickPart(part: PartName): Promise<void> {
    const target = this.part(part) as HTMLElement | null;
    if (!target) throw new Error(`there is no ${part} to click`);
    await act(async () => {
      target.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          pointerType: 'mouse',
          button: 0,
        }),
      );
      target.click();
    });
    await flushFrame();
  }

  /**
   * Presses Escape on the focused element (`document.body` when nothing has focus) as a browser
   * does: a cancelable keydown that bubbles. Radix listens for it on `document` in the capture
   * phase and calls `preventDefault()` first. The palette's own handler is the React `onKeyDown`
   * of `Dialog.Content`, which sees the key only when the focused element lies inside the content;
   * `handleRootKeyDown` and `createKeydownHandler` both return on a default-prevented key, so no
   * second close follows. On an event that is not cancelable that call does nothing, the palette's
   * handler sends CLOSE as well, and a controlled modern-cmdk dialog reports the close twice.
   */
  async pressEscapeOnFocus(): Promise<void> {
    const target = document.activeElement ?? document.body;
    await act(async () => {
      target.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
    });
    await flushFrame();
  }
}
