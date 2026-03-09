'use client';

// packages/command-react/src/primitives.ts
// Minimal Primitive/Slot — replaces @radix-ui/react-primitive
// Proper ref merging for Slot pattern

import {
  type ComponentPropsWithRef,
  cloneElement,
  type ElementType,
  isValidElement,
  type ReactNode,
  type Ref,
} from 'react';

export interface SlotProps {
  readonly children?: ReactNode;
  readonly ref?: Ref<unknown>;
}

/** Merge two refs into a single callback ref */
function mergeRefs<T>(...refs: Array<Ref<T> | undefined>): Ref<T> | undefined {
  const filtered = refs.filter(Boolean) as Ref<T>[];
  if (filtered.length === 0) return undefined;
  if (filtered.length === 1) return filtered[0];
  return (instance: T | null): void => {
    for (const ref of filtered) {
      if (typeof ref === 'function') {
        ref(instance);
      } else if (ref && typeof ref === 'object') {
        (ref as { current: T | null }).current = instance;
      }
    }
  };
}

/** Slot component for asChild pattern — merges refs, props, and event handlers */
export function Slot({ children, ref, ...props }: SlotProps & Record<string, unknown>): ReactNode {
  if (isValidElement<Record<string, unknown>>(children)) {
    const childRef = (children as { ref?: Ref<unknown> }).ref;
    return cloneElement(children, {
      ...props,
      ...children.props,
      ref: mergeRefs(ref, childRef),
    });
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
