'use client';

// apps/playground/src/demos/VirtualizedDemo.tsx
// 10K items for virtualization testing
// Uses ES2026 Iterator Helpers for item generation

import { useMemo, useCallback } from 'react';
import { Command } from '@crimson_dev/command-react';

/** Word pool for generating varied item values */
const WORDS = [
  'apple', 'banana', 'cherry', 'date', 'elderberry',
  'fig', 'grape', 'honeydew', 'kiwi', 'lemon',
  'mango', 'nectarine', 'orange', 'papaya', 'quince',
] as const;

const CATEGORIES = [
  'action', 'setting', 'navigation', 'tool', 'utility',
] as const;

export function VirtualizedDemo(): React.ReactNode {
  // Generate 10,000 items using Array.from
  const items = useMemo(
    () =>
      Array.from({ length: 10_000 }, (_, i) => {
        const word = WORDS[i % WORDS.length]!;
        const category = CATEGORIES[i % CATEGORIES.length]!;
        return {
          id: `virt-item-${i}`,
          value: `Item ${i} ${word} ${category}`,
          label: `Item ${i} - ${word} (${category})`,
        };
      }),
    [],
  );

  const handleSelect = useCallback((value: string) => {
    console.log(`Selected: ${value}`);
  }, []);

  // Use Iterator Helpers (ES2026) to render items
  const renderedItems = items
    .values()
    .map((item) => (
      <Command.Item
        key={item.id}
        value={item.value}
        forceId={item.id}
        onSelect={() => handleSelect(item.value)}
      >
        {item.label}
      </Command.Item>
    ))
    .toArray();

  return (
    <div className="demo-container">
      <h2 className="demo-title">Virtualized (10,000 Items)</h2>
      <p className="demo-description">
        Rendering 10K items with automatic virtualization. The list auto-virtualizes
        when filtered count exceeds 100 items.
      </p>

      <Command className="command-palette command-palette--tall" label="Virtualized command palette">
        <Command.Input placeholder="Search 10,000 items..." />
        <Command.List estimateSize={44} overscan={12}>
          <Command.Empty>No results found.</Command.Empty>
          {renderedItems}
        </Command.List>
      </Command>
    </div>
  );
}
