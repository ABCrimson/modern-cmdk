import { forwardRef } from 'react';

function Inner(props, ref) {
  return <div ref={ref} {...props} />;
}

export const A = forwardRef(Inner);
export const B = forwardRef(makeRender());
export const C = forwardRef((a, b, c) => <div />);
