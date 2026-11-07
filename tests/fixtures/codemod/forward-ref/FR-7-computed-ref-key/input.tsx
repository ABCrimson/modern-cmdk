import { forwardRef } from 'react';
export const A = forwardRef(({ ['ref']: x }, ref) => <div ref={ref} id={x} />);
