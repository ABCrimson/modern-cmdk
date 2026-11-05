import { forwardRef } from 'react';
type Props = { label: string };
type Ref = { id: number };
export const Tag = forwardRef<HTMLSpanElement, Props>((props, ref) => <span ref={ref}>{props.label}</span>);
export const r: Ref = { id: 1 };
