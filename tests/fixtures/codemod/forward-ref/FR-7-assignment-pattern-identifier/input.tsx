import { forwardRef } from 'react';

export const A = forwardRef((props = {}, ref) => <div ref={ref} {...props} />);
