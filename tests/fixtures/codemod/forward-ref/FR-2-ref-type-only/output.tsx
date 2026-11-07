import React from 'react';

export const Bare = (
  {
    ref,
    ...props
  }: {
    ref?: React.Ref<HTMLButtonElement>;
  }
) => (<button ref={ref} {...props} />);
