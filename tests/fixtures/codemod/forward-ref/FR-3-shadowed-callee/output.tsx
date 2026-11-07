import { type Ref } from 'react';
export const Tag = (
  {
    ref,
    ...props
  }: { a: string } & {
    ref?: Ref<HTMLSpanElement>;
  }
) => <span ref={ref}>{props.a}</span>;
function inner() { const forwardRef = (x: unknown) => x; return forwardRef(1); }
export { inner };
