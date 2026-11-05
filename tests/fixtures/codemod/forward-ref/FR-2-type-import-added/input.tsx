import { forwardRef, useState } from 'react';

type Props = { label: string };

export const Tag = forwardRef<HTMLSpanElement, Props>((props, ref) => {
  const [n] = useState(0);
  return <span ref={ref}>{props.label}{n}</span>;
});
