import { Command } from 'modern-cmdk/react';

export const A = () => (
  <Command filter={(item, query) => (item.value.includes(query) ? 1 : false)} label="a" />
);
