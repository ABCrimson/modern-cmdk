import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { run } from '../../packages/create-modern-cmdk/src/index.js';

interface Captured {
  readonly io: { stdout: NodeJS.WritableStream; stderr: NodeJS.WritableStream };
  readonly out: () => string;
  readonly err: () => string;
}

function capture(): Captured {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const writer = (sink: string[]): NodeJS.WritableStream =>
    new Writable({
      write(chunk: Buffer, _enc: BufferEncoding, done: (error?: Error | null) => void): void {
        sink.push(chunk.toString());
        done();
      },
    });
  return {
    io: { stdout: writer(stdout), stderr: writer(stderr) },
    out: () => stripVTControlCharacters(stdout.join('')),
    err: () => stripVTControlCharacters(stderr.join('')),
  };
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'create-modern-cmdk-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('create-modern-cmdk CLI', () => {
  it('--help prints usage and the template list to stdout, exit 0', async () => {
    const c = capture();
    expect(await run(['--help'], c.io)).toBe(0);
    expect(c.out()).toContain('Usage:');
    expect(c.out()).toMatch(/--template=<name> {2,}Template to scaffold/);
    for (const t of ['react-basic', 'react-dialog', 'react-full']) expect(c.out()).toContain(t);
    expect(c.err()).toBe('');
  });

  it('no project name prints usage to stderr, exit 0 (strict 2)', async () => {
    const c = capture();
    expect(await run([], c.io)).toBe(0);
    expect(c.err()).toContain('Usage:');
    expect(c.out()).toBe('');
    expect(await run(['--strict'], capture().io)).toBe(2);
  });

  it('an unknown option is a usage error: exit 0, strict 2', async () => {
    const c = capture();
    expect(await run(['--bogus'], c.io)).toBe(0);
    expect(c.err()).toContain('unknown option --bogus');
    expect(await run(['--strict', '--bogus'], capture().io)).toBe(2);
  });

  it('an unknown option with a project name warns, is ignored, and scaffolds', async () => {
    const target = join(dir, 'app-ts');
    const c = capture();
    expect(await run([target, '--typescript'], c.io)).toBe(0);
    expect(c.err()).toContain('warning: unknown option --typescript ignored');
    expect(JSON.parse(await readFile(join(target, 'package.json'), 'utf-8')).type).toBe('module');
  });

  it('an unknown option with --strict exits 2 and writes nothing', async () => {
    const target = join(dir, 'app-strict');
    const c = capture();
    expect(await run([target, '--typescript', '--strict'], c.io)).toBe(2);
    expect(c.err()).toContain('unknown option --typescript');
    await expect(readFile(join(target, 'package.json'))).rejects.toThrow();
  });

  it('an unknown option does not let --strict=yes slip through (nothing written)', async () => {
    const target = join(dir, 'app-strict-value');
    const c = capture();
    expect(await run([target, '--typescript', '--strict=yes'], c.io)).toBe(0);
    expect(c.err()).toContain("Option '--strict' does not take an argument");
    await expect(readFile(join(target, 'package.json'))).rejects.toThrow();
  });

  it('an unknown option does not let a valueless --template slip through (nothing written)', async () => {
    const target = join(dir, 'app-template-novalue');
    const c = capture();
    expect(await run([target, '--typescript', '--template'], c.io)).toBe(0);
    expect(c.err()).toContain("Option '--template <value>' argument missing");
    await expect(readFile(join(target, 'package.json'))).rejects.toThrow();
    const strict = capture();
    expect(await run([target, '--typescript', '--template', '--strict'], strict.io)).toBe(2);
    expect(strict.err()).toContain('argument is ambiguous');
    await expect(readFile(join(target, 'package.json'))).rejects.toThrow();
  });

  it('a dash-led space-form --template value is ambiguous beside an unknown option (nothing written)', async () => {
    const target = join(dir, 'app-template-dash');
    const c = capture();
    expect(await run([target, '--typescript', '--template', '--help'], c.io)).toBe(0);
    expect(c.err()).toContain("Option '--template' argument is ambiguous.");
    await expect(readFile(join(target, 'package.json'))).rejects.toThrow();
  });

  it('an empty --template= is not a template: unknown template exits 1, nothing written', async () => {
    const target = join(dir, 'app-template-empty');
    const c = capture();
    expect(await run([target, '--template='], c.io)).toBe(1);
    expect(c.err()).toContain('unknown template ""');
    await expect(readFile(join(target, 'package.json'))).rejects.toThrow();
  });

  it('the space form --template <name> is honoured', async () => {
    const target = join(dir, 'space-dialog');
    expect(await run([target, '--template', 'react-dialog'], capture().io)).toBe(0);
    const app = await readFile(join(target, 'src', 'App.tsx'), 'utf-8');
    expect(app).toContain('<Command.Dialog open={open} onOpenChange={setOpen}>');
  });

  it('the space form --template nope exits 1', async () => {
    const target = join(dir, 'space-nope');
    expect(await run([target, '--template', 'nope'], capture().io)).toBe(1);
    await expect(readFile(join(target, 'package.json'))).rejects.toThrow();
  });

  it('an unknown template prints the valid ones, exit 1 (strict 2), writes nothing', async () => {
    const target = join(dir, 'app');
    const c = capture();
    expect(await run([target, '--template=nope'], c.io)).toBe(1);
    expect(c.err()).toContain('unknown template "nope"');
    expect(c.err()).toContain('react-basic, react-dialog, react-full');
    expect(await run([target, '--template=nope', '--strict'], capture().io)).toBe(2);
    await expect(readFile(join(target, 'package.json'))).rejects.toThrow();
  });

  it('success prints every written file and the next steps, exit 0', async () => {
    const target = join(dir, 'app');
    const c = capture();
    expect(await run([target], c.io)).toBe(0);
    for (const f of ['package.json', 'tsconfig.json', 'vite.config.ts', 'index.html']) {
      expect(c.out()).toContain(f);
    }
    expect(c.out()).toContain('src/main.tsx');
    expect(c.out()).toContain('src/App.tsx');
    expect(c.out()).toContain(`cd ${target}`);
    expect(c.out()).toContain('pnpm install');
    expect(c.out()).toContain('pnpm dev');
    expect(JSON.parse(await readFile(join(target, 'package.json'), 'utf-8')).type).toBe('module');
  });

  it('react-dialog writes a controlled dialog with a Mod+K listener', async () => {
    const target = join(dir, 'dialog-app');
    expect(await run([target, '--template=react-dialog'], capture().io)).toBe(0);
    const app = await readFile(join(target, 'src', 'App.tsx'), 'utf-8');
    expect(app).toContain('<Command.Dialog open={open} onOpenChange={setOpen}>');
    expect(app).toContain('useState(false)');
    expect(app).toContain("addEventListener('keydown'");
    expect(app).toContain('event.metaKey || event.ctrlKey');
    expect(app).toContain("event.key === 'k'");
  });
});
