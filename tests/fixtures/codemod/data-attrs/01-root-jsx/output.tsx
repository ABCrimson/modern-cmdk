import type { ReactElement } from 'react';

// A hand-rolled shell that mirrors cmdk's markup.
export function Shell(): ReactElement {
  return (
    <div data-command-root="" className="shell">
      <input data-command-input="" />
      <div data-command-list="">
        <div data-command-item="" data-command-group="">
          item
        </div>
        <div data-command-separator="" />
        <div data-command-empty="" />
        <div data-command-loading="" />
      </div>
    </div>
  );
}
