import { Command } from '@crimson_dev/command-react';

export function HighContrastDemo() {
  return (
    <div>
      <h3>High Contrast Demo</h3>
      <p style={{ opacity: 0.6 }}>
        Enable Windows High Contrast mode or use <code>prefers-contrast: more</code> in devtools to
        see enhanced styles.
      </p>
      <div
        style={{
          padding: '1.5rem',
          borderRadius: 12,
          background: '#000',
          color: '#fff',
          border: '3px solid #fff',
        }}
      >
        <Command label="High contrast demo">
          <Command.Input placeholder="Search..." />
          <Command.List>
            <Command.Item value="item-1">High Contrast Item 1</Command.Item>
            <Command.Item value="item-2">High Contrast Item 2</Command.Item>
            <Command.Item value="disabled" disabled>
              Disabled Item
            </Command.Item>
            <Command.Separator />
            <Command.Item value="item-3">High Contrast Item 3</Command.Item>
          </Command.List>
          <Command.Empty>No results.</Command.Empty>
        </Command>
      </div>
    </div>
  );
}
