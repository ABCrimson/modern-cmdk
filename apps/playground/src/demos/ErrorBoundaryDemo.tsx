'use client';

// apps/playground/src/demos/ErrorBoundaryDemo.tsx
// Demonstrates CommandErrorBoundary with fallback UI
// React 19: useId

import { Command, CommandErrorBoundary } from 'modern-cmdk/react';
import { useId, useState } from 'react';

function BrokenItem(): React.ReactNode {
  throw new Error('This item intentionally crashes!');
}

export function ErrorBoundaryDemo(): React.ReactNode {
  const [showBroken, setShowBroken] = useState(false);
  const headingId = useId();

  return (
    <div className="demo-container" role="region" aria-labelledby={headingId}>
      <h2 className="demo-title" id={headingId}>
        Error Boundary
      </h2>
      <p className="demo-description">
        The <code>CommandErrorBoundary</code> catches rendering errors and displays a fallback UI.
        Click the button below to trigger a simulated crash.
      </p>

      <button
        type="button"
        className="trigger-button"
        onClick={() => setShowBroken(!showBroken)}
        aria-pressed={showBroken}
      >
        {showBroken ? 'Reset' : 'Trigger Error'}
      </button>

      <CommandErrorBoundary
        fallback={(error) => (
          <div className="error-fallback" role="alert">
            <strong>Command Palette Error</strong>
            <p>{error.message}</p>
          </div>
        )}
        onError={(_error) => {
          // In production: send to error reporting service
        }}
      >
        <Command className="command-palette" label="Error boundary demo">
          <Command.Input placeholder="Search..." />
          <Command.List>
            <Command.Item value="safe">
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\u2713'}
                </span>
                <span className="item-label">Safe Item</span>
              </span>
            </Command.Item>
            {showBroken && <BrokenItem />}
          </Command.List>
        </Command>
      </CommandErrorBoundary>
    </div>
  );
}
