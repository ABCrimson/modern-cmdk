import { forwardRef } from 'react';

export const Field = forwardRef(({ value }, ref) => <input ref={ref} value={value} />);

export const Plain = forwardRef((props, ref) => <div ref={ref} {...props} />);
