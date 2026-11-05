import React from 'react';

export const Tag = React.forwardRef((props, ref: React.Ref<HTMLSpanElement>) => (
  <span ref={ref} {...props} />
));
