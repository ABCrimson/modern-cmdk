import type { Ref } from 'react';
import { forwardRef } from 'react';
type Props = { label: string };
export const Tag = forwardRef<HTMLSpanElement, Props>((props, ref) => <span ref={ref}>{props.label}</span>);
export const r: Ref<HTMLElement> | null = null;
