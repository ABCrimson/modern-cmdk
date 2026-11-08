import type { FrecencyData, FrecencyStorage } from 'modern-cmdk';
import { FrecencyEngine, itemId } from 'modern-cmdk';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.useRealTimers();
});

it('CE-111: a rejected timer save keeps the engine dirty and asyncDispose persists the records', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  using warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const saved: FrecencyData[] = [];
  const save = vi
    .fn<FrecencyStorage['save']>()
    .mockRejectedValueOnce(new Error('quota exceeded'))
    .mockImplementation(async (_namespace, data) => {
      saved.push(data);
    });
  const storage: FrecencyStorage = {
    load: async () => ({ records: new Map() }),
    save,
    [Symbol.dispose]: () => {},
  };
  const engine = new FrecencyEngine({ storage });
  engine.recordSelection(itemId('apple'));

  await vi.advanceTimersByTimeAsync(1000); // the debounce timer saves, the save rejects
  expect(save).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledTimes(1);

  await engine[Symbol.asyncDispose]();
  expect(save).toHaveBeenCalledTimes(2);
  expect(saved.at(-1)?.records.get(itemId('apple'))?.frequency).toBe(1);
  expect(warn).toHaveBeenCalledTimes(1);
});
