import { useCommandState } from 'cmdk';

export function Count() {
  return useCommandState((state) => state.filtered.count);
}
