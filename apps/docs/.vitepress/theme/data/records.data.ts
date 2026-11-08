import { defineLoader } from 'vitepress';
import { loadRecords, type RecordsData } from './records.ts';

// Build-time loader for the home page (design-final.md C6, 3.4). The reading, the record selection and the warnings are
// records.ts, which tests/unit/docs-records.test.ts covers; this file only names the watched globs. They resolve relative
// to this file (VitePress data loaders), five levels up is the repository root.
export type { RecordsData };

declare const data: RecordsData;

export { data };

export default defineLoader({
  watch: [
    '../../../../../benchmarks/size-history/*.json',
    '../../../../../benchmarks/baseline.json',
    '../../../../../packages/modern-cmdk/package.json',
  ],
  load: loadRecords,
});
