'use client';

// apps/playground/src/demos/VirtualizedDemo.tsx
// 10K items for virtualization testing
// React 19: useId, useCallback, useMemo
// ES2026: Iterator Helpers for item rendering

import { Command } from 'modern-cmdk/react';
import { useCallback, useId, useMemo } from 'react';

/** Word pool for generating varied item values */
const WORDS = [
  'apple',
  'banana',
  'cherry',
  'date',
  'elderberry',
  'fig',
  'grape',
  'honeydew',
  'kiwi',
  'lemon',
  'mango',
  'nectarine',
  'orange',
  'papaya',
  'quince',
] as const;

const CATEGORIES = ['action', 'setting', 'navigation', 'tool', 'utility'] as const;

const ICONS = ['\u2726', '\u25C6', '\u25CF', '\u25B2', '\u2605'] as const;

/** Default item count — configurable via ?count= URL param for CI/testing */
const DEFAULT_ITEM_COUNT = 10_000;

function getItemCount(): number {
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  const count = Number(params.get('count'));
  return count > 0 ? count : DEFAULT_ITEM_COUNT;
}

export function VirtualizedDemo(): React.ReactNode {
  const headingId = useId();
  const itemCount = useMemo(getItemCount, []);

  // Generate items using Array.from
  const items = useMemo(
    () =>
      Array.from({ length: itemCount }, (_, i) => {
        const word = WORDS[i % WORDS.length] as string;
        const category = CATEGORIES[i % CATEGORIES.length] as string;
        const icon = ICONS[i % ICONS.length] as string;
        return {
          id: `virt-item-${i}`,
          value: `Item ${i} ${word} ${category}`,
          label: `Item ${i} \u2014 ${word} (${category})`,
          icon,
        };
      }),
    [itemCount],
  );

  const handleSelect = useCallback((_value: string) => {
    // Selection handler
  }, []);

  // Memoize 10K rendered items — avoids 10K JSX allocations on every render
  const renderedItems = useMemo(
    () =>
      items
        .values()
        .map((item) => (
          <Command.Item
            key={item.id}
            value={item.value}
            forceId={item.id}
            onSelect={() => handleSelect(item.value)}
          >
            <span className="item-content">
              <span className="item-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="item-label">{item.label}</span>
            </span>
          </Command.Item>
        ))
        .toArray(),
    [items, handleSelect],
  );

  return (
    <div className="demo-container" role="region" aria-labelledby={headingId}>
      <h2 className="demo-title" id={headingId}>
        Virtualized
        <span className="demo-badge demo-badge--beta">{itemCount.toLocaleString()} items</span>
      </h2>
      <p className="demo-description">
        Rendering {itemCount.toLocaleString()} items with automatic virtualization. The list
        auto-virtualizes when the filtered count exceeds 100 items. Uses{' '}
        <code>content-visibility: auto</code> for GPU-optimized rendering and{' '}
        <code>contain-intrinsic-size</code> for stable scroll height.
      </p>

      <Command
        className="command-palette command-palette--tall"
        label="Virtualized command palette"
      >
        <Command.Input placeholder={`Search ${itemCount.toLocaleString()} items...`} />
        <Command.List virtualize estimateSize={44} overscan={12}>
          <Command.Empty>No results found.</Command.Empty>
          {renderedItems}
        </Command.List>
      </Command>
    </div>
  );
}
