import { forwardRef } from 'react';
export function wrap<Ref>() {
  return forwardRef<HTMLDivElement, { a: string }>((props, ref) => <div ref={ref} />);
}
