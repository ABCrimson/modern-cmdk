import { forwardRef, type Ref } from 'react';
export const K = class Ref {
  render() {
    return forwardRef<HTMLDivElement, { a: string }>((props, ref) => <div ref={ref} />);
  }
};
export type R = Ref<HTMLDivElement>;
