import { type Ref as ReactRef } from 'react';
type Props = { label: string };
type Ref = { id: number };
export const Tag = (
  {
    ref,
    ...props
  }: Props & {
    ref?: ReactRef<HTMLSpanElement>;
  }
) => <span ref={ref}>{props.label}</span>;
export const r: Ref = { id: 1 };
