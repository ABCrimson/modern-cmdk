import type { CommandItem, CommandMachine } from 'modern-cmdk';
import { getDisplayIds } from 'modern-cmdk';
import { Command, CommandStableContext } from 'modern-cmdk/react';
import type { ReactNode } from 'react';
import { act, use, useLayoutEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

// PERF-16: the List's ordering effect (RA-02, A11Y-03; D145, D146) does work in proportion to what
// changed. The tests count DOM calls, never time: the DOM moves a commit makes and the queries the
// ordering effect asks the whole list.

let container: HTMLDivElement | undefined;
let root: Root | undefined;

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
  Reflect.deleteProperty(Element.prototype, 'moveBefore');
});

/** Runs the scheduler frames and the effects that follow a state change. */
const settle = (): Promise<void> =>
  act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  });

/** Records the machine the subtree holds. */
class MachineProbe {
  machine: CommandMachine | undefined;

  readonly Probe = (): null => {
    const stable = use(CommandStableContext);
    if (stable) this.machine = stable.machine;
    return null;
  };

  get current(): CommandMachine {
    if (!this.machine) throw new Error('probe never rendered');
    return this.machine;
  }
}

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

const row = (id: string): ReactNode => (
  <Command.Item key={id} value={id} id={id}>
    {id}
  </Command.Item>
);

const itemIdsInDom = (): string[] =>
  [...view().querySelectorAll('[data-command-item]')].map((el) => el.id);
const displayOf = (probe: MachineProbe): string[] =>
  getDisplayIds(probe.current.getState()).map(String);

/** What the DOM calls of a stretch of the test came to. */
interface Tally {
  /** insertBefore, appendChild and moveBefore calls that took a node already in a parent */
  moves: number;
  /** querySelectorAll calls, whatever element they ran on */
  queries: number;
}

/**
 * Spies on the calls that move a node (`moveBefore` always; `insertBefore` and `appendChild` when the
 * node already has a parent: React's own inserts take a new node) and on `querySelectorAll`.
 * happy-dom has no `moveBefore`, so a stand-in defines it and delegates to `insertBefore`.
 */
function tally(): Tally {
  const counts: Tally = { moves: 0, queries: 0 };
  const realInsertBefore = Node.prototype.insertBefore;
  const realAppendChild = Node.prototype.appendChild;
  const realQuery = Element.prototype.querySelectorAll;
  Object.defineProperty(Element.prototype, 'moveBefore', {
    value(this: Element, node: Node, ref: Node | null): void {
      counts.moves++;
      realInsertBefore.call(this, node, ref);
    },
    configurable: true,
    writable: true,
  });
  vi.spyOn(Node.prototype, 'insertBefore').mockImplementation(function (
    this: Node,
    node: Node,
    ref: Node | null,
  ) {
    if (node.parentNode !== null) counts.moves++;
    return realInsertBefore.call(this, node, ref);
  } as typeof Node.prototype.insertBefore);
  vi.spyOn(Node.prototype, 'appendChild').mockImplementation(function (this: Node, node: Node) {
    if (node.parentNode !== null) counts.moves++;
    return realAppendChild.call(this, node);
  } as typeof Node.prototype.appendChild);
  vi.spyOn(Element.prototype, 'querySelectorAll').mockImplementation(function (
    this: Element,
    selector: string,
  ) {
    counts.queries++;
    return realQuery.call(this, selector);
  } as typeof Element.prototype.querySelectorAll);
  return counts;
}

/** Every filter match scores alike, so a search keeps the registration order. */
const keepsOrder = (): number => 1;

/** Pushes `read()` in its layout effect: where it stands in the tree says which effects ran before it. */
function Mark({ marks, read }: { marks: number[]; read: () => number }): null {
  useLayoutEffect(() => {
    marks.push(read());
  }, [marks, read]);
  return null;
}

/** `count` plain items whose JSX order is their registration order, below the virtualization threshold. */
function plain(probe: MachineProbe, count: number): ReactNode {
  return (
    <Command filter={keepsOrder}>
      <probe.Probe />
      <Command.Input />
      <Command.List>{Array.from({ length: count }, (_, at) => row(`p${at}`))}</Command.List>
    </Command>
  );
}

/** The tally of a mount of `count` plain items and of one refilter that keeps their order. */
async function mountAndRefilter(count: number): Promise<{ mount: Tally; refilter: Tally }> {
  const probe = new MachineProbe();
  const mountCounts = tally();
  await mount(plain(probe, count));
  expect(itemIdsInDom()).toEqual(displayOf(probe));
  expect(itemIdsInDom()).toHaveLength(count);
  const before = { ...mountCounts };
  await sendTo(probe, { type: 'SEARCH_CHANGE', query: 'p' });
  expect(itemIdsInDom()).toEqual(displayOf(probe));
  const refilter = {
    moves: mountCounts.moves - before.moves,
    queries: mountCounts.queries - before.queries,
  };
  vi.restoreAllMocks();
  Reflect.deleteProperty(Element.prototype, 'moveBefore');
  return { mount: { moves: before.moves, queries: before.queries }, refilter };
}

describe('PERF-16: the ordering effect works in proportion to what changed', () => {
  it('PERF-16: mounting plain items already in display order moves no node and queries the list a number of times that does not grow with the items', async () => {
    const small = await mountAndRefilter(10);
    await act(async () => {
      root?.unmount();
    });
    root = undefined;
    container?.remove();
    container = undefined;
    const large = await mountAndRefilter(90);
    expect(small.mount.moves).toBe(0);
    expect(large.mount.moves).toBe(0);
    expect(large.mount.queries).toBe(small.mount.queries);
  });

  it('PERF-16: a refilter that keeps the display order moves no node and queries the list a number of times that does not grow with the items', async () => {
    const small = await mountAndRefilter(10);
    await act(async () => {
      root?.unmount();
    });
    root = undefined;
    container?.remove();
    container = undefined;
    const large = await mountAndRefilter(90);
    expect(small.refilter.moves).toBe(0);
    expect(large.refilter.moves).toBe(0);
    expect(large.refilter.queries).toBe(small.refilter.queries);
  });

  it('PERF-16: the mount commit, whose display order holds no item yet, makes the list query nothing', async () => {
    const probe = new MachineProbe();
    const counts = tally();
    const marks: number[] = [];
    // Layout effects run in tree order: the marks bracket the effects of the List and its items
    const read = (): number => counts.queries;
    await mount(
      <Command filter={keepsOrder}>
        <probe.Probe />
        <Mark marks={marks} read={read} />
        <Command.Input />
        <Command.List>{Array.from({ length: 30 }, (_, at) => row(`p${at}`))}</Command.List>
        <Mark marks={marks} read={read} />
      </Command>,
    );
    expect(itemIdsInDom()).toHaveLength(30);
    expect(marks).toHaveLength(2);
    expect(marks[1]).toBe(marks[0]);
  });
});

/** The scores of the reordering search: m, mounted last, ranks first of the plain items; group A leads the groups. */
const REORDER_SCORES = { m: 9, p1: 5, p2: 4, p0: 3, a1: 6, a2: 2 } as const;
const reorderFilter = (item: CommandItem, query: string): number | false =>
  query === 'zz'
    ? false
    : query
      ? ((REORDER_SCORES as Record<string, number>)[item.value] ?? 0) || false
      : 1;

/** Setters the fixture components below hand to the test. */
const lateControls: { show?: () => void; setPriority?: (priority: number) => void } = {};

function Late(): ReactNode {
  const [on, setOn] = useState(false);
  lateControls.show = (): void => setOn(true);
  return on ? row('m') : null;
}

function Prioritized(): ReactNode {
  const [priority, setPriority] = useState(0);
  lateControls.setPriority = setPriority;
  return (
    <Command.Group heading="A" id="gA" priority={priority}>
      {row('a1')}
      {row('a2')}
    </Command.Group>
  );
}

describe('PERF-16: the ordering effect still places what a change needs', () => {
  it('PERF-16: a search that reorders, a priority change and an item registered out of order each end in the display order', async () => {
    const probe = new MachineProbe();
    await mount(
      <Command filter={reorderFilter}>
        <probe.Probe />
        <Command.Input />
        <Command.List>
          {row('p0')}
          <Prioritized />
          <Command.Group heading="B" id="gB">
            {row('p1')}
            {row('p2')}
          </Command.Group>
          <Late />
        </Command.List>
      </Command>,
    );
    // Mounted in the display order: nothing to move yet
    expect(itemIdsInDom()).toEqual(displayOf(probe));

    // A search whose ranking reorders the groups
    const searched = tally();
    await sendTo(probe, { type: 'SEARCH_CHANGE', query: 'zz' });
    await sendTo(probe, { type: 'SEARCH_CHANGE', query: 's' });
    expect(displayOf(probe)).toEqual(['a1', 'a2', 'p1', 'p2', 'p0']);
    expect(itemIdsInDom()).toEqual(displayOf(probe));
    expect(searched.moves).toBeGreaterThan(0);

    // An item that mounts after every other and ranks first
    await act(async () => {
      lateControls.show?.();
    });
    await settle();
    expect(displayOf(probe)).toContain('m');
    expect(itemIdsInDom()).toEqual(displayOf(probe));

    // A priority change that puts group A before the others
    await act(async () => {
      lateControls.setPriority?.(-1);
    });
    await settle();
    expect(displayOf(probe).slice(0, 2)).toEqual(['a1', 'a2']);
    expect(itemIdsInDom()).toEqual(displayOf(probe));
  });

  it('PERF-16: plain items that a search reorders are moved and end in the display order', async () => {
    const probe = new MachineProbe();
    const scores = { p3: 9, p1: 8, p5: 7, p0: 1, p2: 2, p4: 3 } as Record<string, number>;
    const filter = (item: CommandItem, query: string): number | false =>
      query ? (scores[item.value] ?? 0) || false : 1;
    await mount(
      <Command filter={filter}>
        <probe.Probe />
        <Command.Input />
        <Command.List>{Array.from({ length: 6 }, (_, at) => row(`p${at}`))}</Command.List>
      </Command>,
    );
    expect(itemIdsInDom()).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5']);
    const searched = tally();
    await sendTo(probe, { type: 'SEARCH_CHANGE', query: 'zz' });
    await sendTo(probe, { type: 'SEARCH_CHANGE', query: 'p' });
    expect(displayOf(probe)).toEqual(['p3', 'p1', 'p5', 'p4', 'p2', 'p0']);
    expect(itemIdsInDom()).toEqual(displayOf(probe));
    expect(searched.moves).toBeGreaterThan(0);
  });

  it('PERF-16: a search that matches nothing after the first placement returns the moved children to their JSX slots', async () => {
    const probe = new MachineProbe();
    const filter = (item: CommandItem, query: string): number | false =>
      query === 'zz'
        ? false
        : query
          ? (({ b1: 9, a1: 8 } as Record<string, number>)[item.value] ?? false)
          : 1;
    await mount(
      <Command filter={filter}>
        <probe.Probe />
        <Command.Input />
        <Command.List>
          <div data-k="WA">A{row('a1')}</div>
          <div data-k="WB">B{row('b1')}</div>
        </Command.List>
      </Command>,
    );
    const wrappers = (): string[] =>
      [...view().querySelectorAll('[data-k]')].map((el) => el.getAttribute('data-k') ?? '');
    await sendTo(probe, { type: 'SEARCH_CHANGE', query: 's' });
    expect(wrappers()).toEqual(['WB', 'WA']);
    await sendTo(probe, { type: 'SEARCH_CHANGE', query: 'zz' });
    expect(wrappers()).toEqual(['WA', 'WB']);
  });
});
