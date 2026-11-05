import { forwardRef } from 'react';
const k = 'ref';
export const A = forwardRef(({ [k]: x }, ref) => <div ref={ref} id={x} />);
