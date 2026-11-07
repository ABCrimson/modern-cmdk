import { forwardRef } from 'react';

export const A = forwardRef(({ a } = {}, ref) => <div ref={ref} id={a} />);
