import { bench, describe } from 'vitest';
import { createCommandMachine, itemId } from '@crimson_dev/command';
import type { CommandItem } from '@crimson_dev/command';

function generateItems(count: number): CommandItem[] {
  const words = ['apple', 'banana', 'cherry', 'date', 'elderberry', 'fig', 'grape', 'honeydew'];
  return Array.from({ length: count }, (_, i) => ({
    id: itemId(`item-${i}`),
    value: `${words[i % words.length]} ${i} ${words[(i + 3) % words.length]} action`,
    keywords: [`keyword-${i}`, `alias-${i % 100}`],
  }));
}

const items1K = generateItems(1_000);
const items10K = generateItems(10_000);

describe('Search Scoring', () => {
  bench('filter 1K items (default scorer)', () => {
    using machine = createCommandMachine({ items: items1K });
    machine.send({ type: 'SEARCH_CHANGE', query: 'apple' });
  });

  bench('filter 10K items (default scorer)', () => {
    using machine = createCommandMachine({ items: items10K });
    machine.send({ type: 'SEARCH_CHANGE', query: 'banana' });
  });

  bench('create machine with 1K items', () => {
    using machine = createCommandMachine({ items: items1K });
    machine.getState();
  });

  bench('create machine with 10K items', () => {
    using machine = createCommandMachine({ items: items10K });
    machine.getState();
  });
});
