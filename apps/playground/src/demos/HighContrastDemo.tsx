'use client';

// apps/playground/src/demos/HighContrastDemo.tsx
// Tests forced-colors and prefers-contrast CSS support
// React 19: useId

import { Command } from '@crimson_dev/command-react';
import { useId } from 'react';

export function HighContrastDemo(): React.ReactNode {
  const headingId = useId();

  return (
    <div className="demo-container" role="region" aria-labelledby={headingId}>
      <h2 className="demo-title" id={headingId}>
        High Contrast
      </h2>
      <p className="demo-description">
        Enable Windows High Contrast mode or use <code>prefers-contrast: more</code> in DevTools to
        see enhanced styles. The palette adapts its borders, outlines, and colors for maximum
        readability using <code>forced-colors: active</code> and system colors (
        <code>Highlight</code>, <code>HighlightText</code>, <code>Canvas</code>).
      </p>

      <div className="hc-preview">
        <Command className="command-palette" label="High contrast demo">
          <Command.Input placeholder="Search..." />
          <Command.List>
            <Command.Empty>No results.</Command.Empty>

            <Command.Item value="item-1">
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\u25CF'}
                </span>
                <span className="item-label">High Contrast Item 1</span>
              </span>
            </Command.Item>
            <Command.Item value="item-2">
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\u25CF'}
                </span>
                <span className="item-label">High Contrast Item 2</span>
              </span>
            </Command.Item>
            <Command.Item value="disabled" disabled>
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\u25CB'}
                </span>
                <span className="item-label">Disabled Item</span>
              </span>
            </Command.Item>

            <Command.Separator />

            <Command.Item value="item-3">
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\u25CF'}
                </span>
                <span className="item-label">High Contrast Item 3</span>
              </span>
            </Command.Item>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
