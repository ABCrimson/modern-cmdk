import * as React from 'react';

export const U = React.forwardRef<HTMLDivElement, { a: number } | { b: string }>((props, ref) => (
  <div ref={ref} data-kind={'a' in props} />
));
