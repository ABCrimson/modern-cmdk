import { useCommandState } from 'modern-cmdk/react';

export function Count() {
  return useCommandState((state) => state.filtered.count);
}
