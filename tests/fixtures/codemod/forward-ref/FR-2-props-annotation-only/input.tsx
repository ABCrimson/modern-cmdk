import { forwardRef, useImperativeHandle } from 'react';
type Props = { label: string };
export const Tag = forwardRef((props: Props, ref) => {
  useImperativeHandle(ref, () => ({}));
  return <span>{props.label}</span>;
});
