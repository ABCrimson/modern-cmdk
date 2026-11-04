// Build entry for modern-cmdk-search-wasm.
// The JS build bundles pkg/ (wasm-pack output), so without pkg/ it is skipped on purpose
// (documented in the root CLAUDE.md): build the crate first with `pnpm build:wasm`.
// With pkg/ present, tsdown's own exit status is this script's exit status.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));

if (!existsSync(join(packageRoot, 'pkg', 'command_search_wasm.js'))) {
  process.stderr.write(
    'modern-cmdk-search-wasm: pkg/ missing, run pnpm build:wasm first; JS build skipped\n',
  );
  process.exit(0);
}

// tsdown is a root devDependency: run its package bin with this Node, no shell involved.
const require = createRequire(import.meta.url);
const tsdownManifest = require.resolve('tsdown/package.json');
const { bin } = require(tsdownManifest);
const tsdownBin = join(dirname(tsdownManifest), typeof bin === 'string' ? bin : bin.tsdown);

const result = spawnSync(process.execPath, [tsdownBin], {
  cwd: packageRoot,
  stdio: 'inherit',
  shell: false,
});

if (result.error) {
  process.stderr.write(`modern-cmdk-search-wasm: could not run tsdown: ${result.error.message}\n`);
  process.exit(1);
}
process.exit(result.status ?? 1);
