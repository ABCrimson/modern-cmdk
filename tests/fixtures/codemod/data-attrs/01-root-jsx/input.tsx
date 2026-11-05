import type { ReactElement } from 'react';

// A hand-rolled shell that mirrors cmdk's markup.
export function Shell(): ReactElement {
  return (
    <div cmdk-root="" className="shell">
      <input cmdk-input="" />
      <div cmdk-list="">
        <div cmdk-item="" cmdk-group="">
          item
        </div>
        <div cmdk-separator="" />
        <div cmdk-empty="" />
        <div cmdk-loading="" />
      </div>
    </div>
  );
}
