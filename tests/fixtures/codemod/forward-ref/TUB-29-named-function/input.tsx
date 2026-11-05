import { forwardRef } from 'react';

export const A = forwardRef(function Inner(props, ref) {
  return <div ref={ref} {...props} />;
});

export default forwardRef(function Page({ title }, ref) {
  return <h1 ref={ref}>{title}</h1>;
});
