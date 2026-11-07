import { useImperativeHandle, type Ref } from 'react';
export const Tag = (
  {
    ref,
    label
  }: { label: string } & {
    ref?: Ref<unknown>;
  }
) => {
  useImperativeHandle(ref, () => ({}));
  return <span>{label}</span>;
};
