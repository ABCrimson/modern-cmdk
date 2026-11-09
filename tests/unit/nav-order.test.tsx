import type { CommandItem, CommandMachine, ItemId } from 'modern-cmdk';
import { createCommandMachine, groupId, itemId } from 'modern-cmdk';
import { describe, expect, it } from 'vitest';

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
});
