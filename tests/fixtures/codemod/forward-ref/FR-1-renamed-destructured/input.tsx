import { forwardRef } from 'react';

export const Field = forwardRef(({ value, ...rest }, inputRef) => (
  <input ref={inputRef} value={value} {...rest} />
));
