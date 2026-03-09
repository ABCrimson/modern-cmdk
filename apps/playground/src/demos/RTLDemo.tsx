'use client';

// apps/playground/src/demos/RTLDemo.tsx
// Right-to-left layout demo with Arabic content
// React 19: useId
// All styles use CSS logical properties (inline/block)

import { Command } from 'modern-cmdk/react';
import { useId } from 'react';

export function RTLDemo(): React.ReactNode {
  const headingId = useId();

  return (
    <div className="demo-container" role="region" aria-labelledby={headingId}>
      <h2 className="demo-title" id={headingId}>
        RTL (Right-to-Left) Layout
      </h2>
      <p className="demo-description">
        All styles use CSS logical properties (<code>inline-start</code>, <code>block-end</code>,
        etc.) so the palette mirrors correctly in RTL languages without any additional CSS.
      </p>

      <div dir="rtl" lang="ar" className="rtl-container">
        <Command
          className="command-palette"
          label="\u0644\u0648\u062D\u0629 \u0627\u0644\u0623\u0648\u0627\u0645\u0631"
        >
          <Command.Input placeholder="...\u0628\u062D\u062B" />
          <Command.List>
            <Command.Empty>
              {'\u0644\u0627 \u062A\u0648\u062C\u062F \u0646\u062A\u0627\u0626\u062C'}
            </Command.Empty>

            <Command.Group heading="\u0623\u0648\u0627\u0645\u0631">
              <Command.Item value="copy">
                <span className="item-content">
                  <span className="item-icon" aria-hidden="true">
                    {'\uD83D\uDCCB'}
                  </span>
                  <span className="item-label">{'\u0646\u0633\u062E'}</span>
                </span>
              </Command.Item>
              <Command.Item value="paste">
                <span className="item-content">
                  <span className="item-icon" aria-hidden="true">
                    {'\uD83D\uDCCB'}
                  </span>
                  <span className="item-label">{'\u0644\u0635\u0642'}</span>
                </span>
              </Command.Item>
              <Command.Item value="cut">
                <span className="item-content">
                  <span className="item-icon" aria-hidden="true">
                    {'\u2702'}
                  </span>
                  <span className="item-label">{'\u0642\u0635'}</span>
                </span>
              </Command.Item>
            </Command.Group>

            <Command.Separator />

            <Command.Group heading="\u062A\u0646\u0642\u0644">
              <Command.Item value="home">
                <span className="item-content">
                  <span className="item-icon" aria-hidden="true">
                    {'\uD83C\uDFE0'}
                  </span>
                  <span className="item-label">
                    {
                      '\u0627\u0644\u0635\u0641\u062D\u0629 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629'
                    }
                  </span>
                </span>
              </Command.Item>
              <Command.Item value="settings">
                <span className="item-content">
                  <span className="item-icon" aria-hidden="true">
                    {'\u2699'}
                  </span>
                  <span className="item-label">
                    {'\u0627\u0644\u0627\u0639\u062F\u0627\u062F\u0627\u062A'}
                  </span>
                </span>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
