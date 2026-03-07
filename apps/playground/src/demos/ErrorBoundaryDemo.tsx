import { useState } from 'react';
import { Command, CommandErrorBoundary } from '@crimson_dev/command-react';

function BrokenItem() {
  throw new Error('This item intentionally crashes!');
}

export function ErrorBoundaryDemo() {
  const [showBroken, setShowBroken] = useState(false);

  return (
    <div>
      <h3>Error Boundary Demo</h3>
      <p>
        <button onClick={() => setShowBroken(!showBroken)}>
          {showBroken ? 'Reset' : 'Trigger Error'}
        </button>
      </p>
      <CommandErrorBoundary
        fallback={(error) => (
          <div style={{ padding: '1rem', background: '#fee', borderRadius: 8, color: '#c00' }}>
            <strong>Command Palette Error</strong>
            <p>{error.message}</p>
          </div>
        )}
        onError={(error) => console.error('Caught:', error)}
      >
        <Command label="Error boundary demo">
          <Command.Input placeholder="Search..." />
          <Command.List>
            <Command.Item value="safe">Safe Item</Command.Item>
            {showBroken && <BrokenItem />}
          </Command.List>
        </Command>
      </CommandErrorBoundary>
    </div>
  );
}
