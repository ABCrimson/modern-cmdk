'use client';

// apps/playground/src/demos/AllStatesDemo.tsx
// Demonstrates all command palette states in a grid
// React 19: useId

import { Command } from 'modern-cmdk/react';
import { useId } from 'react';

export function AllStatesDemo(): React.ReactNode {
  const headingId = useId();

  return (
    <div className="demo-container" role="region" aria-labelledby={headingId}>
      <h2 className="demo-title" id={headingId}>
        All States
      </h2>
      <p className="demo-description">
        Each palette below demonstrates a different state: empty, loading, disabled items, groups
        with separators, shortcuts, and badges.
      </p>

      <div className="states-grid">
        <section>
          <h3>Empty State</h3>
          <Command className="command-palette" label="Empty demo">
            <Command.Input placeholder="Search..." />
            <Command.List>
              <Command.Empty>No results found.</Command.Empty>
            </Command.List>
          </Command>
        </section>

        <section>
          <h3>Loading State</h3>
          <Command className="command-palette" label="Loading demo">
            <Command.Input placeholder="Search..." />
            <Command.List>
              <Command.Loading>Searching...</Command.Loading>
            </Command.List>
          </Command>
        </section>

        <section>
          <h3>Disabled Items</h3>
          <Command className="command-palette" label="Disabled demo">
            <Command.Input placeholder="Search..." />
            <Command.List>
              <Command.Item value="enabled">
                <span className="item-content">
                  <span className="item-icon" aria-hidden="true">
                    {'\u2713'}
                  </span>
                  <span className="item-label">Enabled Item</span>
                </span>
              </Command.Item>
              <Command.Item value="disabled" disabled>
                <span className="item-content">
                  <span className="item-icon" aria-hidden="true">
                    {'\u2717'}
                  </span>
                  <span className="item-label">Disabled Item</span>
                </span>
              </Command.Item>
              <Command.Item value="also-enabled">
                <span className="item-content">
                  <span className="item-icon" aria-hidden="true">
                    {'\u2713'}
                  </span>
                  <span className="item-label">Also Enabled</span>
                </span>
              </Command.Item>
            </Command.List>
          </Command>
        </section>

        <section>
          <h3>Groups with Separator</h3>
          <Command className="command-palette" label="Groups demo">
            <Command.Input placeholder="Search..." />
            <Command.List>
              <Command.Group heading="Fruits">
                <Command.Item value="apple">
                  <span className="item-content">
                    <span className="item-icon" aria-hidden="true">
                      {'\uD83C\uDF4E'}
                    </span>
                    <span className="item-label">Apple</span>
                  </span>
                </Command.Item>
                <Command.Item value="banana">
                  <span className="item-content">
                    <span className="item-icon" aria-hidden="true">
                      {'\uD83C\uDF4C'}
                    </span>
                    <span className="item-label">Banana</span>
                  </span>
                </Command.Item>
              </Command.Group>
              <Command.Separator />
              <Command.Group heading="Vegetables">
                <Command.Item value="carrot">
                  <span className="item-content">
                    <span className="item-icon" aria-hidden="true">
                      {'\uD83E\uDD55'}
                    </span>
                    <span className="item-label">Carrot</span>
                  </span>
                </Command.Item>
                <Command.Item value="broccoli">
                  <span className="item-content">
                    <span className="item-icon" aria-hidden="true">
                      {'\uD83E\uDD66'}
                    </span>
                    <span className="item-label">Broccoli</span>
                  </span>
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </section>

        <section>
          <h3>With Shortcuts</h3>
          <Command className="command-palette" label="Shortcuts demo">
            <Command.Input placeholder="Search..." />
            <Command.List>
              <Command.Item value="copy" shortcut="Ctrl+C">
                <span className="item-content">
                  <span className="item-label">Copy</span>
                  <Command.Shortcut>Ctrl+C</Command.Shortcut>
                </span>
              </Command.Item>
              <Command.Item value="paste" shortcut="Ctrl+V">
                <span className="item-content">
                  <span className="item-label">Paste</span>
                  <Command.Shortcut>Ctrl+V</Command.Shortcut>
                </span>
              </Command.Item>
            </Command.List>
          </Command>
        </section>

        <section>
          <h3>With Badges</h3>
          <Command className="command-palette" label="Badges demo">
            <Command.Input placeholder="Search..." />
            <Command.List>
              <Command.Item value="api">
                <span className="item-content">
                  <span className="item-label">API Reference</span>
                  <Command.Badge>New</Command.Badge>
                </span>
              </Command.Item>
              <Command.Item value="docs">
                <span className="item-content">
                  <span className="item-label">Documentation</span>
                  <Command.Badge>Updated</Command.Badge>
                </span>
              </Command.Item>
            </Command.List>
          </Command>
        </section>
      </div>
    </div>
  );
}
