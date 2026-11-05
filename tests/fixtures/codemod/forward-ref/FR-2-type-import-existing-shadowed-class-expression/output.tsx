import { type Ref, type Ref as ReactRef } from 'react';
export const K = class Ref {
  render() {
    return (
      {
        ref,
        ...props
      }: { a: string } & {
        ref?: ReactRef<HTMLDivElement>;
      }
    ) => <div ref={ref} />;
  }
};
export type R = Ref<HTMLDivElement>;
