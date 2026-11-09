import type { CommandItem, CommandMachine, ItemId } from 'modern-cmdk';
import { createCommandMachine, getDisplayIds, groupId, itemId } from 'modern-cmdk';
import { Command, CommandStableContext } from 'modern-cmdk/react';
import type { ReactNode } from 'react';
import { Activity, act, StrictMode, use, useState } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { silenceConsoleError } from '../act-guard.ts';

// The refilter is scheduled on an animation frame; real timers and a short wait let it run
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 30));

type Spec = readonly [id: string, group?: string, disabled?: boolean];

/** Items in registration order; each id doubles as the item value the probe filter scores */
function itemsOf(specs: readonly Spec[]): CommandItem[] {
  return specs.map(([id, group, disabled]) => ({
    id: itemId(id),
    value: id,
    ...(group === undefined ? {} : { groupId: groupId(group) }),
    ...(disabled === undefined ? {} : { disabled }),
  }));
}

/** A filter that scores by value: 'zz' matches nothing, other queries score from `scores` (0 is no match) */
function scoring(
  scores: Readonly<Record<string, number>>,
): (item: CommandItem, q: string) => number | false {
  return (item: CommandItem, q: string) =>
    q === 'zz' ? false : q ? (scores[item.value] ?? 0) || false : 1;
}

async function send(
  m: CommandMachine,
  event: Parameters<CommandMachine['send']>[0],
): Promise<void> {
  m.send(event);
  await flush();
}

/** Searches 'zz' (nothing matches, so the active item clears), then 's' (the scores apply) */
async function searchScored(m: CommandMachine): Promise<void> {
  await send(m, { type: 'SEARCH_CHANGE', query: 'zz' });
  await send(m, { type: 'SEARCH_CHANGE', query: 's' });
}

/** The active ids of NAVIGATE `start`, then `step` as often as `steps` says */
async function walkFrom(
  m: CommandMachine,
  start: 'first' | 'last',
  step: 'next' | 'prev',
  steps: number,
): Promise<(ItemId | null)[]> {
  const seen: (ItemId | null)[] = [];
  await send(m, { type: 'NAVIGATE', direction: start });
  seen.push(m.getState().activeId);
  for (let i = 0; i < steps; i++) {
    await send(m, { type: 'NAVIGATE', direction: step });
    seen.push(m.getState().activeId);
  }
  return seen;
}

const walk = (m: CommandMachine, steps: number): Promise<(ItemId | null)[]> =>
  walkFrom(m, 'first', 'next', steps);
const walkBack = (m: CommandMachine, steps: number): Promise<(ItemId | null)[]> =>
  walkFrom(m, 'last', 'prev', steps);

const ids = (...names: string[]): ItemId[] => names.map(itemId);

describe('C4 display order: core', () => {
  it('RA-02: keyboard navigation follows the visible order of the list', async () => {
    using m = createCommandMachine({
      items: itemsOf([['u1'], ['a1', 'gA'], ['a2', 'gA'], ['b1', 'gB'], ['b2', 'gB'], ['u2']]),
      groups: [{ id: groupId('gA') }, { id: groupId('gB') }],
      filter: scoring({ b1: 9, u2: 8, a1: 7, a2: 6, u1: 5 }),
    });
    await searchScored(m);
    const state = m.getState();
    expect(state.filteredIds).toEqual(ids('b1', 'u2', 'a1', 'a2', 'u1'));
    const display = [...state.groupedIds.values()].flat();
    expect(display).toEqual(ids('b1', 'u2', 'u1', 'a1', 'a2'));
    expect(getDisplayIds(state)).toEqual(display);
    expect(await walk(m, 4)).toEqual(display);
    expect(await walkBack(m, 4)).toEqual([...display].reverse());
  });

  it('C4: with default priorities the first enabled item of filteredIds becomes active after a search', async () => {
    using m = createCommandMachine({
      items: itemsOf([['u1'], ['a1', 'gA'], ['b1', 'gB'], ['b2', 'gB']]),
      groups: [{ id: groupId('gA') }, { id: groupId('gB') }],
      filter: scoring({ b2: 9, a1: 8, u1: 7, b1: 6 }),
    });
    await searchScored(m);
    const { filteredIds, activeId } = m.getState();
    expect(filteredIds[0]).toBe(itemId('b2'));
    expect(activeId).toBe(filteredIds[0]);
  });

  it('C4: a disabled best match makes the first enabled item of its group active', async () => {
    using m = createCommandMachine({
      items: itemsOf([
        ['a1', 'gA', true],
        ['a2', 'gA'],
        ['b1', 'gB'],
      ]),
      groups: [{ id: groupId('gA') }, { id: groupId('gB') }],
      filter: scoring({ a1: 9, b1: 8, a2: 7 }),
    });
    await searchScored(m);
    expect(m.getState().filteredIds).toEqual(ids('a1', 'b1', 'a2'));
    expect(m.getState().activeId).toBe(itemId('a2'));
  });

  it('C4: a set priority puts its group first in the display order and NAVIGATE walks it', async () => {
    // A search: gA (priority -1) leads although its item scores below b1
    {
      using m = createCommandMachine({
        items: itemsOf([
          ['a1', 'gA'],
          ['b1', 'gB'],
          ['b2', 'gB'],
        ]),
        groups: [{ id: groupId('gA'), priority: -1 }, { id: groupId('gB') }],
        filter: scoring({ b1: 9, a1: 3, b2: 2 }),
      });
      await searchScored(m);
      expect(m.getState().filteredIds).toEqual(ids('b1', 'a1', 'b2'));
      expect(m.getState().activeId).toBe(itemId('a1'));
      expect(await walk(m, 2)).toEqual(ids('a1', 'b1', 'b2'));
    }
    // The empty query: filteredIds keeps registration order, the display order puts gB (-1) first
    {
      using m = createCommandMachine({
        items: itemsOf([['u1'], ['a1', 'gA'], ['a2', 'gA'], ['b1', 'gB'], ['u2']]),
        groups: [{ id: groupId('gA') }, { id: groupId('gB'), priority: -1 }],
        filter: scoring({}),
      });
      await flush();
      expect(m.getState().filteredIds).toEqual(ids('u1', 'a1', 'a2', 'b1', 'u2'));
      expect(await walk(m, 4)).toEqual(ids('b1', 'u1', 'u2', 'a1', 'a2'));
    }
  });

  it('C4: getDisplayIds returns the values of groupedIds flattened in key order', async () => {
    using m = createCommandMachine({
      items: itemsOf([['u1'], ['a1', 'gA'], ['a2', 'gA'], ['b1', 'gB'], ['b2', 'gB'], ['u2']]),
      groups: [{ id: groupId('gA') }, { id: groupId('gB') }],
      filter: scoring({ b1: 9, u2: 8, a1: 7, a2: 6, u1: 5 }),
    });
    await flush();
    // The empty query keeps registration order; the keys are first appearances
    let state = m.getState();
    expect(state.filteredIds).toEqual(ids('u1', 'a1', 'a2', 'b1', 'b2', 'u2'));
    expect([...state.groupedIds.keys()]).toEqual(['__ungrouped', 'gA', 'gB']);
    expect(getDisplayIds(state)).toEqual(ids('u1', 'u2', 'a1', 'a2', 'b1', 'b2'));
    expect(getDisplayIds(state)).toEqual([...state.groupedIds.values()].flat());

    // A search: filteredIds keeps the score order, the keys and the display order group it
    await searchScored(m);
    state = m.getState();
    expect(state.filteredIds).toEqual(ids('b1', 'u2', 'a1', 'a2', 'u1'));
    expect([...state.groupedIds.keys()]).toEqual(['gB', '__ungrouped', 'gA']);
    expect(getDisplayIds(state)).toEqual(ids('b1', 'u2', 'u1', 'a1', 'a2'));
    expect(getDisplayIds(state)).toEqual([...state.groupedIds.values()].flat());
  });

  it('C4: a group whose members are all disabled is placed by first appearance', async () => {
    using m = createCommandMachine({
      items: itemsOf([
        ['a1', 'gA'],
        ['d1', 'gD', true],
      ]),
      groups: [{ id: groupId('gA') }, { id: groupId('gD') }],
      filter: scoring({ d1: 9, a1: 5 }),
    });
    await searchScored(m);
    const state = m.getState();
    expect(state.filteredIds).toEqual(ids('d1', 'a1'));
    expect(getDisplayIds(state)).toEqual(ids('d1', 'a1'));
    // The disabled item is listed but never reached: the walk skips it
    expect(await walk(m, 1)).toEqual(ids('a1', 'a1'));
  });
});

// ---------------------------------------------------------------------------------------------------
// React: the List renders the display order in both list modes
// ---------------------------------------------------------------------------------------------------

const itWithActivity = it.skipIf(Activity === undefined);

let container: HTMLDivElement | undefined;
let root: Root | undefined;
let moveBeforeDefined = false;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
  }
  container?.remove();
  root = undefined;
  container = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (moveBeforeDefined) Reflect.deleteProperty(Element.prototype, 'moveBefore');
  moveBeforeDefined = false;
});

/** Runs the scheduler frames and the effects that follow a state change. */
const settle = (): Promise<void> =>
  act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  });

/** Records the machine the subtree holds. */
class MachineProbe {
  machine: CommandMachine | undefined;

  /** Probe child: place it inside `<Command>`. */
  readonly Probe = (): null => {
    const stable = use(CommandStableContext);
    if (stable) this.machine = stable.machine;
    return null;
  };

  /** The recorded machine; throws before the probe has rendered. */
  get current(): CommandMachine {
    if (!this.machine) throw new Error('probe never rendered');
    return this.machine;
  }
}

/** Mounts `ui` in a fresh container and flushes the first render and the registration frame. */
async function mount(ui: ReactNode): Promise<HTMLDivElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  container = host;
  const created = createRoot(host);
  root = created;
  await act(async () => {
    created.render(ui);
  });
  await settle();
  return host;
}

function view(): HTMLDivElement {
  if (!container) throw new Error('nothing is mounted');
  return container;
}

async function sendTo(
  probe: MachineProbe,
  event: Parameters<CommandMachine['send']>[0],
): Promise<void> {
  await act(async () => {
    probe.current.send(event);
  });
  await settle();
}

/** Searches 'zz' (nothing matches, so the active item clears), then 's' (the scores apply). */
async function searchReordering(probe: MachineProbe): Promise<void> {
  await sendTo(probe, { type: 'SEARCH_CHANGE', query: 'zz' });
  await sendTo(probe, { type: 'SEARCH_CHANGE', query: 's' });
}

const itemIdsInDom = (): string[] =>
  [...view().querySelectorAll('[data-command-item]')].map((el) => el.id);
const optionIdsInDom = (): string[] =>
  [...view().querySelectorAll('[role="option"]')].map((el) => el.id);
const activeIdInDom = (): string | null => view().querySelector('[data-active]')?.id ?? null;
const displayOf = (probe: MachineProbe): string[] =>
  getDisplayIds(probe.current.getState()).map(String);

async function arrowDown(): Promise<void> {
  const input = view().querySelector('[data-command-input]');
  await act(async () => {
    input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  });
  await settle();
}

/** The active id now, then after each of `steps` ArrowDown presses. */
async function walkDown(steps: number): Promise<(string | null)[]> {
  const seen = [activeIdInDom()];
  for (let i = 0; i < steps; i++) {
    await arrowDown();
    seen.push(activeIdInDom());
  }
  return seen;
}

const row = (id: string): ReactNode => (
  <Command.Item key={id} value={id} id={id}>
    {id}
  </Command.Item>
);

const C4R_SCORES = { b1: 9, u2: 8, a1: 7, a2: 6, u1: 5, b2: 0 } as const;
const C4R_FILTER = scoring(C4R_SCORES);

/** The C4R fixture: an item, group A, a separator, group B, an item. */
function c4r(
  probe: MachineProbe,
  options: { readonly filter?: typeof C4R_FILTER; readonly lead?: ReactNode } = {},
): ReactNode {
  return (
    <Command filter={options.filter ?? C4R_FILTER}>
      <probe.Probe />
      <Command.Input />
      <Command.List>
        {options.lead}
        {row('u1')}
        <Command.Group heading="A" id="gA">
          {row('a1')}
          {row('a2')}
        </Command.Group>
        <Command.Separator />
        <Command.Group heading="B" id="gB">
          {row('b1')}
          {row('b2')}
        </Command.Group>
        {row('u2')}
      </Command.List>
    </Command>
  );
}

/** A `moveBefore` stand-in for happy-dom, which has none: it delegates to the real insertBefore. */
function defineMoveBefore(): ReturnType<typeof vi.fn> {
  const realInsertBefore = Node.prototype.insertBefore;
  const moveBefore = vi.fn(function (this: Element, node: Node, ref: Node | null): void {
    realInsertBefore.call(this, node, ref);
  });
  Object.defineProperty(Element.prototype, 'moveBefore', {
    value: moveBefore,
    configurable: true,
    writable: true,
  });
  moveBeforeDefined = true;
  return moveBefore;
}

/** Spies on insertBefore; `moves` collects the nodes that were already children of the parent. */
function spyInsertBefore(): { readonly calls: () => number; readonly moves: Node[] } {
  const realInsertBefore = Node.prototype.insertBefore;
  const moves: Node[] = [];
  const spy = vi.spyOn(Node.prototype, 'insertBefore').mockImplementation(function (
    this: Node,
    node: Node,
    ref: Node | null,
  ) {
    if (node.parentNode === this) moves.push(node);
    return realInsertBefore.call(this, node, ref);
  } as typeof Node.prototype.insertBefore);
  return { calls: () => spy.mock.calls.length, moves };
}

/** Setters the module-level fixture components below hand to the tests. */
const controls: {
  mountLate?: () => void;
  setMode?: (mode: 'visible' | 'hidden') => void;
  setInB?: (inB: boolean) => void;
  showRecent?: () => void;
} = {};

/** Mounts item x1 on demand, as the last child of the List. */
function Late(): ReactNode {
  const [on, setOn] = useState(false);
  controls.mountLate = (): void => setOn(true);
  return on ? row('x1') : null;
}

/** Mounts item x1 on demand under an Activity whose mode the test sets. */
function Controlled(): ReactNode {
  const [mode, setModeState] = useState<'visible' | 'hidden'>('visible');
  const [on, setOn] = useState(false);
  controls.setMode = setModeState;
  controls.mountLate = (): void => setOn(true);
  return <Activity mode={mode}>{on ? row('x1') : null}</Activity>;
}

/** Item m, rendered in group A or in group B by a flag. */
function Moving(): ReactNode {
  const [inB, setState] = useState(false);
  controls.setInB = setState;
  return (
    <>
      <Command.Group heading="A" id="gA">
        {row('a1')}
        {inB ? null : row('m')}
      </Command.Group>
      <Command.Group heading="B" id="gB">
        {row('b1')}
        {inB ? row('m') : null}
      </Command.Group>
    </>
  );
}

/** Group "Recent" (priority -1), mounted on demand. */
function Recent(): ReactNode {
  const [on, setOn] = useState(false);
  controls.showRecent = (): void => setOn(true);
  return on ? (
    <Command.Group heading="Recent" id="gR" priority={-1}>
      {row('r1')}
    </Command.Group>
  ) : null;
}

const isItemOrGroup = (node: Node): boolean =>
  node instanceof Element &&
  (node.hasAttribute('data-command-item') || node.hasAttribute('data-command-group'));

describe('C4 display order: React', () => {
  it('RA-02: ArrowDown follows the on-screen order after ranking reorders matches', async () => {
    const probe = new MachineProbe();
    await mount(c4r(probe));
    await searchReordering(probe);
    const walk = await walkDown(4);
    expect(walk).toEqual(['b1', 'u2', 'u1', 'a1', 'a2']);
    expect(itemIdsInDom()).toEqual(walk);
  });

  it('A11Y-03: DOM order equals navigation order across two groups', async () => {
    const probe = new MachineProbe();
    await mount(
      <Command filter={scoring({ a1: 5, a2: 4, b1: 9, b2: 3 })}>
        <probe.Probe />
        <Command.Input />
        <Command.List>
          <Command.Group heading="A" id="gA">
            {row('a1')}
            {row('a2')}
          </Command.Group>
          <Command.Group heading="B" id="gB">
            {row('b1')}
            {row('b2')}
          </Command.Group>
        </Command.List>
      </Command>,
    );
    await searchReordering(probe);
    const walk = await walkDown(3);
    expect(walk).toEqual(['b1', 'b2', 'a1', 'a2']);
    expect(optionIdsInDom()).toEqual(walk);
  });

  it('A11Y-03: the listbox DOM order equals the keyboard navigation order', async () => {
    const probe = new MachineProbe();
    await mount(
      <Command filter={scoring({ b1: 9, w1: 8, a1: 7, a2: 6, b2: 5 })}>
        <probe.Probe />
        <Command.Input />
        <Command.List>
          <Command.Page id="root">
            <div data-wrapper="">{row('w1')}</div>
            <Command.Group heading="A" id="gA">
              {row('a1')}
              {row('a2')}
            </Command.Group>
            <Command.Separator />
            <Command.Group heading="B" id="gB">
              {row('b1')}
              {row('b2')}
            </Command.Group>
          </Command.Page>
        </Command.List>
      </Command>,
    );
    for (const query of ['s', '']) {
      await sendTo(probe, { type: 'SEARCH_CHANGE', query: 'zz' });
      await sendTo(probe, { type: 'SEARCH_CHANGE', query });
      await sendTo(probe, { type: 'NAVIGATE', direction: 'first' });
      const walk = await walkDown(4);
      expect(optionIdsInDom()).toEqual(walk);
      expect(walk).toEqual(displayOf(probe));
    }
  });

  it('C4: an item mounted during a search lands in display order', async () => {
    const probe = new MachineProbe();
    const filter = scoring({ ...C4R_SCORES, x1: 8.5 });
    await mount(
      <StrictMode>
        <Command filter={filter}>
          <probe.Probe />
          <Command.Input />
          <Command.List>
            {row('u1')}
            <Command.Group heading="A" id="gA">
              {row('a1')}
              {row('a2')}
            </Command.Group>
            <Command.Separator />
            <Command.Group heading="B" id="gB">
              {row('b1')}
              {row('b2')}
            </Command.Group>
            {row('u2')}
            <Late />
          </Command.List>
        </Command>
      </StrictMode>,
    );
    await searchReordering(probe);
    await act(async () => {
      controls.mountLate?.();
    });
    await settle();
    expect(itemIdsInDom()).toContain('x1');
    expect(itemIdsInDom()).toEqual(displayOf(probe));
    // Unmounting the root mid-search leaves nothing behind
    const host = view();
    const current = root;
    root = undefined;
    await act(async () => {
      current?.unmount();
    });
    expect(host.innerHTML).toBe('');
  });

  itWithActivity(
    'C4: an item inserted under a hidden Activity is placed in display order when shown',
    async () => {
      const probe = new MachineProbe();
      await mount(
        <Command filter={scoring({ ...C4R_SCORES, x1: 8.5 })}>
          <probe.Probe />
          <Command.Input />
          <Command.List>
            {row('u1')}
            <Command.Group heading="A" id="gA">
              {row('a1')}
              {row('a2')}
            </Command.Group>
            <Command.Separator />
            <Command.Group heading="B" id="gB">
              {row('b1')}
              {row('b2')}
            </Command.Group>
            {row('u2')}
            <Controlled />
          </Command.List>
        </Command>,
      );
      await searchReordering(probe);
      await act(async () => {
        controls.setMode?.('hidden');
      });
      await act(async () => {
        controls.mountLate?.();
      });
      await settle();
      await act(async () => {
        controls.setMode?.('visible');
      });
      await settle();
      expect(itemIdsInDom()).toContain('x1');
      expect(itemIdsInDom()).toEqual(displayOf(probe));
    },
  );

  describe('C4: a refilter that keeps the order moves no node', () => {
    for (const present of [true, false]) {
      it(`with moveBefore ${present ? 'present' : 'absent'}`, async () => {
        const moveBefore = present ? defineMoveBefore() : undefined;
        const probe = new MachineProbe();
        await mount(c4r(probe, { lead: <div data-lead="">lead</div> }));
        await searchReordering(probe);
        moveBefore?.mockClear();
        const insertBefore = spyInsertBefore();
        const records: MutationRecord[] = [];
        const observer = new MutationObserver((batch) => records.push(...batch));
        observer.observe(view(), { childList: true, subtree: true });
        await sendTo(probe, { type: 'SEARCH_CHANGE', query: 'se' });
        records.push(...observer.takeRecords());
        observer.disconnect();
        expect(records).toHaveLength(0);
        expect(insertBefore.calls()).toBe(0);
        expect(moveBefore?.mock.calls.length ?? 0).toBe(0);
      });
    }
  });

  describe('C4: a reorder moves nodes with moveBefore where the parent has it, else insertBefore', () => {
    it('with moveBefore present it moves the nodes with moveBefore', async () => {
      const moveBefore = defineMoveBefore();
      const probe = new MachineProbe();
      await mount(c4r(probe));
      await sendTo(probe, { type: 'SEARCH_CHANGE', query: 'zz' });
      const insertBefore = spyInsertBefore();
      await sendTo(probe, { type: 'SEARCH_CHANGE', query: 's' });
      expect(itemIdsInDom()).toEqual(['b1', 'u2', 'u1', 'a1', 'a2']);
      expect(moveBefore.mock.calls.some(([node]) => isItemOrGroup(node as Node))).toBe(true);
      expect(insertBefore.moves).toHaveLength(0);
    });

    it('with moveBefore absent it moves the nodes with insertBefore', async () => {
      expect('moveBefore' in Element.prototype).toBe(false);
      const probe = new MachineProbe();
      await mount(c4r(probe));
      await sendTo(probe, { type: 'SEARCH_CHANGE', query: 'zz' });
      const insertBefore = spyInsertBefore();
      await sendTo(probe, { type: 'SEARCH_CHANGE', query: 's' });
      expect(itemIdsInDom()).toEqual(['b1', 'u2', 'u1', 'a1', 'a2']);
      expect(insertBefore.moves.some(isItemOrGroup)).toBe(true);
    });
  });

  it('C4: a separator keeps its JSX slot between two reordered groups', async () => {
    const probe = new MachineProbe();
    const filter = scoring({ b1: 9, b2: 8, a1: 7, a2: 6, u1: 0, u2: 0 });
    await mount(c4r(probe, { filter }));
    const inner = (): string[] =>
      [...(view().querySelector('[data-command-list-inner]')?.children ?? [])].map((el) =>
        el.hasAttribute('data-command-separator') ? 'SEP' : el.id,
      );
    await sendTo(probe, { type: 'SEARCH_CHANGE', query: 'zz' });
    await sendTo(probe, { type: 'SEARCH_CHANGE', query: 's' });
    expect(inner()).toEqual(['gB', 'SEP', 'gA']);
    await sendTo(probe, { type: 'SEARCH_CHANGE', query: '' });
    expect(inner()).toEqual(['u1', 'u2', 'SEP', 'gA', 'gB']);
  });

  it("C4: ungrouped items sit as one block at their first member's position", async () => {
    const probe = new MachineProbe();
    await mount(c4r(probe));
    expect(itemIdsInDom()).toEqual(['u1', 'u2', 'a1', 'a2', 'b1', 'b2']);
    await searchReordering(probe);
    expect(itemIdsInDom()).toEqual(['b1', 'u2', 'u1', 'a1', 'a2']);
  });

  it('C4: no node moves across parents when an item changes groups', async () => {
    const probe = new MachineProbe();
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent): void => {
      errors.push(event.error);
    };
    window.addEventListener('error', onError);
    try {
      await mount(
        <StrictMode>
          <Command filter={scoring({ b1: 9, m: 8, a1: 7 })}>
            <probe.Probe />
            <Command.Input />
            <Command.List>
              <Moving />
            </Command.List>
          </Command>
        </StrictMode>,
      );
      await searchReordering(probe);
      let inB = false;
      for (let toggle = 0; toggle < 3; toggle++) {
        inB = !inB;
        await act(async () => {
          controls.setInB?.(inB);
        });
        await settle();
        expect(view().querySelectorAll('[id="m"]')).toHaveLength(1);
        const owner = view().querySelector('[id="m"]')?.parentElement;
        expect(owner?.hasAttribute('data-command-group-items')).toBe(true);
        expect(owner?.parentElement?.id).toBe(inB ? 'gB' : 'gA');
      }
    } finally {
      window.removeEventListener('error', onError);
    }
    expect(errors).toEqual([]);
  });

  it('C4: a grouped list above 100 matches positions and scrolls virtual rows by display index', async () => {
    class FixedResizeObserver {
      readonly #callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.#callback = callback;
      }
      observe(target: Element): void {
        this.#callback(
          [{ target, contentRect: { height: 440 } } as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        );
      }
      unobserve(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('ResizeObserver', FixedResizeObserver);
    const scores: Record<string, number> = {};
    const aIds: string[] = [];
    const bIds: string[] = [];
    for (let i = 0; i < 60; i++) {
      aIds.push(`a${i}`);
      bIds.push(`b${i}`);
      scores[`b${i}`] = 1000 - 2 * i;
      scores[`a${i}`] = 999 - 2 * i;
    }
    const probe = new MachineProbe();
    await mount(
      <Command filter={scoring(scores)}>
        <probe.Probe />
        <Command.Input />
        <Command.List>
          <Command.Group heading="A" id="gA">
            {aIds.map(row)}
          </Command.Group>
          <Command.Group heading="B" id="gB">
            {bIds.map(row)}
          </Command.Group>
        </Command.List>
      </Command>,
    );
    await searchReordering(probe);
    const display = displayOf(probe);
    expect(display.slice(0, 3)).toEqual(['b0', 'b1', 'b2']);
    expect(view().querySelector('[data-command-list-virtual]')).not.toBeNull();

    const translateOf = (el: Element): number =>
      Number.parseFloat((el as HTMLElement).style.translate.split(' ')[1] ?? 'NaN');
    const rows = (): Element[] => [...view().querySelectorAll('[data-command-item]')];
    const visual = (): string[] =>
      rows()
        .toSorted((x, y) => translateOf(x) - translateOf(y))
        .map((el) => el.id);
    expect(visual()).toEqual(display.slice(0, visual().length));
    expect(itemIdsInDom()).toEqual(visual());

    // Scrolling by hand moves the window across the group boundary
    const list = view().querySelector<HTMLElement>('[data-command-list]');
    if (!list) throw new Error('no list');
    list.scrollTop = 55 * 44;
    await act(async () => {
      list.dispatchEvent(new Event('scroll'));
    });
    await settle();
    const first = display.indexOf(itemIdsInDom()[0] ?? '');
    expect(itemIdsInDom()).toContain('b59');
    expect(itemIdsInDom()).toContain('a0');
    expect(itemIdsInDom()).toEqual(display.slice(first, first + itemIdsInDom().length));
    expect(visual()).toEqual(itemIdsInDom());

    // The active item scrolls by its display index (a0 is 60th in the display, 2nd in filteredIds)
    const scrollTo = vi.fn();
    list.scrollTo = scrollTo as unknown as typeof list.scrollTo;
    list.scrollTop = 0;
    await act(async () => {
      list.dispatchEvent(new Event('scroll'));
    });
    await sendTo(probe, { type: 'ITEM_ACTIVATE', id: itemId('a0') });
    const top = (scrollTo.mock.calls.at(-1)?.[0] as { top: number } | undefined)?.top ?? -1;
    expect(top).toBeGreaterThanOrEqual(60 * 44);
  });

  it('C4: SSR markup in JSX order hydrates without a recoverable error and is ordered after hydration', async () => {
    const probe = new MachineProbe();
    const tree = c4r(probe);
    const html = renderToString(tree);
    expect(html.indexOf('id="u1"')).toBeGreaterThan(-1);
    expect(html.indexOf('id="u1"')).toBeLessThan(html.indexOf('id="a1"'));
    expect(html.indexOf('id="a1"')).toBeLessThan(html.indexOf('id="u2"'));
    const host = document.createElement('div');
    document.body.appendChild(host);
    container = host;
    host.innerHTML = html;
    const onRecoverableError = vi.fn();
    const restore = silenceConsoleError();
    try {
      await act(async () => {
        root = hydrateRoot(host, tree, { onRecoverableError });
      });
      await settle();
    } finally {
      restore.mockRestore();
    }
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(itemIdsInDom()).toEqual(['u1', 'u2', 'a1', 'a2', 'b1', 'b2']);
  });

  it('C4: aria-activedescendant names a connected option after a reorder', async () => {
    const probe = new MachineProbe();
    await mount(c4r(probe));
    await searchReordering(probe);
    for (let step = 0; step < 6; step++) {
      await arrowDown();
      const named = view()
        .querySelector('[data-command-input]')
        ?.getAttribute('aria-activedescendant');
      const target = named ? document.getElementById(named) : null;
      expect(target?.isConnected).toBe(true);
    }
  });

  it('C4: priority pins a group that mounts after its siblings first', async () => {
    const probe = new MachineProbe();
    await mount(
      <Command filter={scoring({})}>
        <probe.Probe />
        <Command.Input />
        <Command.List>
          <Command.Group heading="Actions" id="gX">
            {row('x1')}
            {row('x2')}
          </Command.Group>
          <Recent />
        </Command.List>
      </Command>,
    );
    await act(async () => {
      controls.showRecent?.();
    });
    await settle();
    expect(displayOf(probe)).toEqual(['r1', 'x1', 'x2']);
    expect(itemIdsInDom()).toEqual(['r1', 'x1', 'x2']);
  });
});
