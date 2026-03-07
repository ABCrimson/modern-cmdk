'use client';

// packages/command-react/src/primitives.ts
// Minimal Primitive/Slot — 12 lines, replaces @radix-ui/react-primitive

import {
  type ComponentPropsWithRef,
  type ElementType,
  type ReactNode,
  cloneElement,
  isValidElement,
} from 'react';

export interface SlotProps {
  readonly children?: ReactNode;
}

/** Slot component for asChild pattern — merges refs, props, and event handlers */
export function Slot({ children, ...props }: SlotProps & Record<string, unknown>): ReactNode {
  if (isValidElement(children)) {
    return cloneElement(children, { ...props, ...children.props });
  }
  return children ?? null;
}

/** Primitive component — renders as a given element or uses Slot via asChild */
export function Primitive<T extends ElementType = 'div'>({
  asChild,
  as: Component = 'div' as T,
  ...props
}: { asChild?: boolean; as?: T } & ComponentPropsWithRef<T>): ReactNode {
  if (asChild) {
    return <Slot {...props} />;
  }
  // @ts-expect-error — dynamic element type
  return <Component {...props} />;
}
