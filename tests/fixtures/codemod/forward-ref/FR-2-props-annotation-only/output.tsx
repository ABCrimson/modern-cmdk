import { useImperativeHandle, type Ref } from 'react';
type Props = { label: string };
export const Tag = (
  {
    ref,
    ...props
  }: Props & {
    ref?: Ref<unknown>;
  }
) => {
  useImperativeHandle(ref, () => ({}));
  return <span>{props.label}</span>;
};
