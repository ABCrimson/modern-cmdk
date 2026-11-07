import { type Ref as ReactRef } from 'react';
enum Ref { A }
export const A = (
  {
    ref,
    ...props
  }: { a: string } & {
    ref?: ReactRef<HTMLDivElement>;
  }
) => <div ref={ref} />;
export const r = Ref.A;
