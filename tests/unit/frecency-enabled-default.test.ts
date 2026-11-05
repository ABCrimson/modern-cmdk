// tests/unit/frecency-enabled-default.test.ts
// ARCH-56: FrecencyOptions.enabled is optional and defaults to false (apps/docs/guide/frecency.md)

import type { CommandMachineOptions, FrecencyOptions } from 'modern-cmdk';
import { createCommandMachine, FrecencyEngine, itemId, MemoryFrecencyStorage } from 'modern-cmdk';
import { describe, expect, expectTypeOf, it } from 'vitest';

const ITEMS = [
  { id: itemId('one'), value: 'app one' },
  { id: itemId('two'), value: 'app two' },
] as const;

type Machine = ReturnType<typeof createCommandMachine>;

/** Let the machine's microtask scheduler flush */
const tick = (): Promise<void> => new Promise<void>((r) => setTimeout(r, 0));

async function searchOrder(machine: Machine): Promise<readonly string[]> {
  machine.send({ type: 'SEARCH_CHANGE', query: 'app' });
  await tick();
  return machine.getState().filteredIds;
}

describe('ARCH-56 FrecencyOptions.enabled defaults to false', () => {
  it('ARCH-56: new FrecencyEngine({ storage, namespace }) and frecency: { storage } compile', () => {
    const engine = new FrecencyEngine({ storage: new MemoryFrecencyStorage(), namespace: 'n' });
    expect(engine).toBeInstanceOf(FrecencyEngine);
    expectTypeOf<FrecencyOptions['enabled']>().toEqualTypeOf<boolean | undefined>();
    const options: CommandMachineOptions = { frecency: { storage: new MemoryFrecencyStorage() } };
    expect(options.frecency?.enabled).toBeUndefined();
  });

  it('ARCH-56: frecency with a storage alone records nothing and never re-ranks', async () => {
    using machine = createCommandMachine({
      items: [...ITEMS],
      frecency: { storage: new MemoryFrecencyStorage() },
    });
    const before = await searchOrder(machine);
    machine.send({ type: 'ITEM_SELECT', id: itemId('two') });
    await tick();
    expect(await searchOrder(machine)).toEqual(before);
    expect(before[0]).toBe(itemId('one'));
  });

  it('ARCH-56: enabled: true re-ranks after a selection', async () => {
    using machine = createCommandMachine({
      items: [...ITEMS],
      frecency: { enabled: true, storage: new MemoryFrecencyStorage() },
    });
    expect((await searchOrder(machine))[0]).toBe(itemId('one'));
    machine.send({ type: 'ITEM_SELECT', id: itemId('two') });
    await tick();
    expect((await searchOrder(machine))[0]).toBe(itemId('two'));
  });
});
