// @vitest-environment node
// Drift guard for src/pkg.d.ts: the stub must stay a subset of the wasm-bindgen output in pkg/.
// No @types/node in this package, so node:fs comes from process.getBuiltinModule (typed locally).
import { expect, it } from 'vitest';

type Fs = { existsSync(p: URL): boolean; readFileSync(p: URL, enc: 'utf8'): string };
const fs = (
  globalThis as unknown as { process: { getBuiltinModule(id: 'node:fs'): Fs } }
).process.getBuiltinModule('node:fs');
const stubUrl = new URL('./pkg.d.ts', import.meta.url);
const generatedUrl = new URL('../pkg/command_search_wasm.d.ts', import.meta.url);
const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

it.skipIf(!fs.existsSync(generatedUrl))('pkg.d.ts stub matches the generated declarations', () => {
  const stub = fs.readFileSync(stubUrl, 'utf8');
  const generated = norm(fs.readFileSync(generatedUrl, 'utf8'));

  const classBody = /export class WasmSearchEngine \{([\s\S]*?)\n {2}\}/.exec(stub)?.[1] ?? '';
  const members = classBody
    .split('\n')
    .map(norm)
    .filter((l) => l && !l.startsWith('//'));
  expect(members.length).toBeGreaterThan(0);
  for (const member of members) expect(generated, member).toContain(member);

  const fns = [...stub.matchAll(/export (?:default )?function (\w+)/g)].map((m) => m[1] as string);
  expect(fns).toEqual(['initSync', '__wbg_init']);
  for (const name of fns) expect(generated, name).toContain(`function ${name}`);
});
