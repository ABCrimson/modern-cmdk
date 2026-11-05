import { forwardRef } from 'react';
export const Tag = forwardRef<HTMLSpanElement, { a: string }>((props, ref) => <span ref={ref}>{props.a}</span>);
function inner() { const forwardRef = (x: unknown) => x; return forwardRef(1); }
export { inner };
