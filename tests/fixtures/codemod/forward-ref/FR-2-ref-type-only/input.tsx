import React from 'react';

export const Bare = React.forwardRef<HTMLButtonElement>((props, ref) => (
  <button ref={ref} {...props} />
));
