import { forwardRef, useImperativeHandle } from 'react';
export const Tag = forwardRef(({ label }: { label: string }, ref) => {
  useImperativeHandle(ref, () => ({}));
  return <span>{label}</span>;
});
