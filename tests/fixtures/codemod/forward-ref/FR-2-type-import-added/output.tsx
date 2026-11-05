import { useState, type Ref } from 'react';

type Props = { label: string };

export const Tag = (
  {
    ref,
    ...props
  }: Props & {
    ref?: Ref<HTMLSpanElement>;
  }
) => {
  const [n] = useState(0);
  return <span ref={ref}>{props.label}{n}</span>;
};
