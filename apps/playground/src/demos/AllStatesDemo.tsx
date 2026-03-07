import { Command } from '@crimson_dev/command-react';

export function AllStatesDemo() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
      <section>
        <h3>Empty State</h3>
        <Command label="Empty demo">
          <Command.Input placeholder="Search..." />
          <Command.List>
            <Command.Empty>No results found.</Command.Empty>
          </Command.List>
        </Command>
      </section>

      <section>
        <h3>Loading State</h3>
        <Command label="Loading demo">
          <Command.Input placeholder="Search..." />
          <Command.List>
            <Command.Loading>Searching...</Command.Loading>
          </Command.List>
        </Command>
      </section>

      <section>
        <h3>Disabled Items</h3>
        <Command label="Disabled demo">
          <Command.Input placeholder="Search..." />
          <Command.List>
            <Command.Item value="enabled">Enabled Item</Command.Item>
            <Command.Item value="disabled" disabled>
              Disabled Item
            </Command.Item>
            <Command.Item value="also-enabled">Also Enabled</Command.Item>
          </Command.List>
        </Command>
      </section>

      <section>
        <h3>Groups with Separator</h3>
        <Command label="Groups demo">
          <Command.Input placeholder="Search..." />
          <Command.List>
            <Command.Group heading="Fruits">
              <Command.Item value="apple">Apple</Command.Item>
              <Command.Item value="banana">Banana</Command.Item>
            </Command.Group>
            <Command.Separator />
            <Command.Group heading="Vegetables">
              <Command.Item value="carrot">Carrot</Command.Item>
              <Command.Item value="broccoli">Broccoli</Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </section>

      <section>
        <h3>With Shortcuts</h3>
        <Command label="Shortcuts demo">
          <Command.Input placeholder="Search..." />
          <Command.List>
            <Command.Item value="copy" shortcut="Ctrl+C">
              <span>Copy</span>
              <Command.Shortcut>Ctrl+C</Command.Shortcut>
            </Command.Item>
            <Command.Item value="paste" shortcut="Ctrl+V">
              <span>Paste</span>
              <Command.Shortcut>Ctrl+V</Command.Shortcut>
            </Command.Item>
          </Command.List>
        </Command>
      </section>

      <section>
        <h3>With Badges</h3>
        <Command label="Badges demo">
          <Command.Input placeholder="Search..." />
          <Command.List>
            <Command.Item value="api">
              <span>API Reference</span>
              <Command.Badge>New</Command.Badge>
            </Command.Item>
            <Command.Item value="docs">
              <span>Documentation</span>
              <Command.Badge>Updated</Command.Badge>
            </Command.Item>
          </Command.List>
        </Command>
      </section>
    </div>
  );
}
