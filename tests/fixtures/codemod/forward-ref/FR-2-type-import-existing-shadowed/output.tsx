import { type Ref, type Ref as ReactRef } from 'react';
export function wrap<Ref>() {
  return (
    {
      ref,
      ...props
    }: { a: string } & {
      ref?: ReactRef<HTMLDivElement>;
    }
  ) => <div ref={ref} />;
}
export type R = Ref<HTMLDivElement>;
