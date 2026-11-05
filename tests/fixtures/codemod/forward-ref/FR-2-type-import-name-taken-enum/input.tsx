import { forwardRef } from 'react';
enum Ref { A }
export const A = forwardRef<HTMLDivElement, { a: string }>((props, ref) => <div ref={ref} />);
export const r = Ref.A;
