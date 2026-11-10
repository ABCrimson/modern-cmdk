import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { Writable } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { escapeHtml, run, validateTarget } from '../../packages/create-modern-cmdk/src/index.js';

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
  vi.stubEnv('MODERN_CMDK_VERSION', '1.9.9');
  dir = await mkdtemp(join(tmpdir(), 'create-modern-cmdk-'));
});

afterEach(async () => {
  vi.unstubAllEnvs();
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
    for (const f of [
      'package.json',
      'tsconfig.json',
      'tsconfig.app.json',
      'tsconfig.node.json',
      'vite.config.ts',
      'index.html',
    ]) {
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
    expect(app).toContain("event.key.toLowerCase() === 'k'");
  });
});

const sha = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

async function tree(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true });
  return entries.map((e) => e.replaceAll('\\', '/')).sort();
}

async function exists(path: string): Promise<boolean> {
  return (await readdir(join(path, '..')).catch(() => [] as string[])).includes(
    path.split(/[\\/]/).at(-1) ?? '',
  );
}

describe('create-modern-cmdk 1.5 safety', () => {
  it('CV-21, SEC-11: a non-empty target lists the files this run will overwrite on stderr before any write', async () => {
    const target = join(dir, 'existing');
    await mkdir(target);
    await writeFile(join(target, 'package.json'), 'OLD');
    await writeFile(join(target, 'notes.txt'), 'keep');
    const c = capture();
    expect(await run([target], c.io)).toBe(0);
    expect(c.err()).toContain('package.json');
    expect(c.err()).toContain(target);
    expect(c.err()).not.toContain('notes.txt');
    expect(await readFile(join(target, 'package.json'), 'utf-8')).not.toBe('OLD');
    expect(await readFile(join(target, 'notes.txt'), 'utf-8')).toBe('keep');
    expect(await readFile(join(target, 'src', 'App.tsx'), 'utf-8')).toContain('Command');
  });

  it('RP-22: --no-overwrite refuses a target with any colliding file', async () => {
    const target = join(dir, 'guarded');
    await mkdir(target);
    await writeFile(join(target, 'vite.config.ts'), 'MINE');
    const before = await tree(target);
    const hash = sha(await readFile(join(target, 'vite.config.ts')));
    const c = capture();
    expect(await run([target, '--no-overwrite'], c.io)).toBe(1);
    expect(c.err()).toContain('vite.config.ts');
    expect(sha(await readFile(join(target, 'vite.config.ts')))).toBe(hash);
    expect(await tree(target)).toEqual(before);
    const clean = join(dir, 'fresh');
    expect(await run([clean, '--no-overwrite'], capture().io)).toBe(0);
  });

  it('CV-22: the package name is derived from the basename', async () => {
    const target = join(dir, 'My App');
    const c = capture();
    expect(await run([target], c.io)).toBe(0);
    expect(JSON.parse(await readFile(join(target, 'package.json'), 'utf-8')).name).toBe('my-app');
    expect(c.out()).toContain('note: package name "my-app" (from "My App")');
    expect(await readFile(join(target, 'index.html'), 'utf-8')).toContain('<title>My App</title>');

    const plain = join(dir, 'valid-name_1.x~');
    const p = capture();
    expect(await run([plain], p.io)).toBe(0);
    expect(JSON.parse(await readFile(join(plain, 'package.json'), 'utf-8')).name).toBe(
      'valid-name_1.x~',
    );
    expect(p.out()).not.toContain('note: package name');

    const escaped = join(dir, 'escaped');
    await mkdir(escaped);
    await writeFile(join(escaped, 'package.json'), 'OLD');
    const e = capture();
    expect(await run([`${dir}${sep}sub${sep}..${sep}escaped`], e.io)).toBe(0);
    expect(e.err()).toContain(escaped);
    expect(e.err()).not.toContain('..');
    expect(JSON.parse(await readFile(join(escaped, 'package.json'), 'utf-8')).name).toBe('escaped');
  });

  it('CV-22: a scoped project name @acme/palette stays the package name', async () => {
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const c = capture();
      expect(await run(['@acme/palette'], c.io)).toBe(0);
      const pkg = JSON.parse(
        await readFile(join(dir, '@acme', 'palette', 'package.json'), 'utf-8'),
      );
      expect(pkg.name).toBe('@acme/palette');
      expect(c.out()).not.toContain('note: package name');
    } finally {
      process.chdir(cwd);
    }
  });

  it.skipIf(process.platform === 'win32')(
    'CV-22: a name is sanitized, never refused for its characters',
    async () => {
      const target = join(dir, 'Bad<Name');
      expect(await run([target], capture().io)).toBe(0);
      expect(JSON.parse(await readFile(join(target, 'package.json'), 'utf-8')).name).toBe(
        'bad-name',
      );
    },
  );

  it('CV-74, SEC-15: an empty derived name or one over 214 characters fails before any write', async () => {
    const empty = join(dir, '...');
    const c = capture();
    expect(await run([empty], c.io)).toBe(1);
    expect(c.err()).toContain('package name');
    expect(await run([empty, '--strict'], capture().io)).toBe(2);
    expect(await exists(empty)).toBe(false);

    const long = join(dir, 'a'.repeat(215));
    const l = capture();
    expect(await run([long], l.io)).toBe(1);
    expect(l.err()).toContain('214');
    expect(await run([long, '--strict'], capture().io)).toBe(2);
    expect(await tree(dir)).toEqual([]);
  });

  it('CV-74: validateTarget refuses Windows-illegal names for win32 only', () => {
    for (const bad of [
      'a<b',
      'a>b',
      'a:b',
      'a"b',
      'a|b',
      'a?b',
      'a*b',
      'a\u0001b',
      'CON',
      'nul',
      'Com1',
      'LPT9',
      'aux.txt',
    ]) {
      expect(validateTarget(bad, 'win32'), bad).toEqual(expect.any(String));
      expect(validateTarget(bad, 'linux'), bad).toBeUndefined();
    }
    for (const ok of ['app', 'My App', 'com10', 'console']) {
      expect(validateTarget(ok, 'win32'), ok).toBeUndefined();
    }
  });

  it.runIf(process.platform === 'win32')(
    'CV-74: on win32 an illegal name fails before any write',
    async () => {
      const target = join(dir, 'bad<name');
      const c = capture();
      expect(await run([target], c.io)).toBe(1);
      expect(c.err()).toContain('bad<name');
      expect(await tree(dir)).toEqual([]);
    },
  );

  it('SEC-15: the index.html title is HTML-escaped', async () => {
    expect(escapeHtml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &#39;');
    const target = join(dir, 'Tom & Jerry');
    expect(await run([target], capture().io)).toBe(0);
    const html = await readFile(join(target, 'index.html'), 'utf-8');
    expect(html).toContain('<title>Tom &amp; Jerry</title>');
  });

  it('CV-74: next steps quote a path with whitespace', async () => {
    const target = join(dir, 'My App');
    const c = capture();
    expect(await run([target], c.io)).toBe(0);
    expect(c.out()).toContain(`cd "${target}"`);
    const plain = capture();
    expect(await run([join(dir, 'plain')], plain.io)).toBe(0);
    expect(plain.out()).toContain(`cd ${join(dir, 'plain')}\n`);
  });

  it('CV-23: a failed write removes only what this run created', async () => {
    const target = join(dir, 'half', 'nested');
    await mkdir(join(target, 'src', 'App.tsx'), { recursive: true });
    await writeFile(join(target, 'notes.txt'), 'keep');
    const before = await tree(target);
    const c = capture();
    expect(await run([target], c.io)).toBe(1);
    expect(c.err()).toContain('App.tsx');
    expect(await tree(target)).toEqual(before);
    expect(await readFile(join(target, 'notes.txt'), 'utf-8')).toBe('keep');
  });

  it('CV-23: a failed write removes the directories this run created and nothing above them', async () => {
    const parent = join(dir, 'parent');
    const target = join(parent, 'proj');
    await mkdir(join(target, 'index.html'), { recursive: true });
    await writeFile(join(target, 'notes.txt'), 'keep');
    const before = await tree(dir);
    const c = capture();
    expect(await run([target], c.io)).toBe(1);
    expect(c.err()).toContain('index.html');
    expect(c.err()).not.toMatch(/rmdir/);
    expect(await tree(dir)).toEqual(before);
  });

  it("CV-23: --no-overwrite that loses a race keeps the other writer's file", async () => {
    const target = join(dir, 'raced');
    await mkdir(target);
    await writeFile(join(target, 'index.html'), 'RACER');
    const raced = join(target, 'index.html');
    const original = fs.promises.lstat;
    fs.promises.lstat = ((p: unknown, ...rest: unknown[]) => {
      if (p === raced) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return (original as (...a: unknown[]) => unknown)(p, ...rest);
    }) as typeof fs.promises.lstat;
    syncBuiltinESMExports();
    try {
      expect(await run([target, '--no-overwrite'], capture().io)).toBe(1);
    } finally {
      fs.promises.lstat = original;
      syncBuiltinESMExports();
    }
    expect(await readFile(raced, 'utf-8')).toBe('RACER');
    expect(await tree(dir)).toContain('raced');
  });

  it('CV-70, CV-05, RP-12: --template=react-full prints one deprecation line and scaffolds react-basic', async () => {
    const full = join(dir, 'full');
    const basic = join(dir, 'basic');
    const c = capture();
    expect(await run([full, '--template=react-full'], c.io)).toBe(0);
    expect(await run([basic], capture().io)).toBe(0);
    const line =
      'warning: the react-full template is a deprecated alias of react-basic; it is removed in create-modern-cmdk 2.0';
    expect(
      c
        .err()
        .split('\n')
        .filter((l) => l === line),
    ).toHaveLength(1);
    expect(await readFile(join(full, 'src', 'App.tsx'))).toEqual(
      await readFile(join(basic, 'src', 'App.tsx')),
    );
  });

  it('CV-70: --help marks react-full as deprecated', async () => {
    const c = capture();
    expect(await run(['--help'], c.io)).toBe(0);
    expect(c.out()).toMatch(/react-full\s+Deprecated alias of react-basic/);
    expect(c.out()).toContain('--no-overwrite');
    expect(c.out()).toContain('--force');
  });

  it('SEC-13, DT-07, RP-23, F31: every generated dependency is an exact version', async () => {
    const target = join(dir, 'exact-pins');
    expect(await run([target], capture().io)).toBe(0);
    const pkg = JSON.parse(await readFile(join(target, 'package.json'), 'utf-8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(all).length).toBeGreaterThanOrEqual(9);
    for (const [name, range] of Object.entries(all)) {
      expect(range, name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('SEC-13: modern-cmdk is the build-time version', async () => {
    const target = join(dir, 'build-version');
    expect(await run([target], capture().io)).toBe(0);
    const pkg = JSON.parse(await readFile(join(target, 'package.json'), 'utf-8')) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['modern-cmdk']).toBe('1.9.9');
  });

  it('SEC-13: a missing MODERN_CMDK_VERSION fails loudly', async () => {
    vi.stubEnv('MODERN_CMDK_VERSION', undefined);
    const target = join(dir, 'no-version');
    const c = capture();
    expect(await run([target], c.io)).toBe(1);
    expect(c.err()).toContain('MODERN_CMDK_VERSION');
    await expect(readFile(join(target, 'package.json'))).rejects.toThrow();
  });

  it('CV-48, CV-73, DT-06: main.tsx imports modern-cmdk/styles.css and tsconfig has types vite/client', async () => {
    const target = join(dir, 'styles-types');
    expect(await run([target], capture().io)).toBe(0);
    const main = await readFile(join(target, 'src', 'main.tsx'), 'utf-8');
    expect(main).toContain("import 'modern-cmdk/styles.css';");
    expect(main.indexOf('react-dom/client')).toBeLessThan(main.indexOf('modern-cmdk/styles.css'));
    const tsconfig = JSON.parse(await readFile(join(target, 'tsconfig.app.json'), 'utf-8')) as {
      compilerOptions: { types: string[] };
    };
    expect(tsconfig.compilerOptions.types).toEqual(['vite/client']);
    const solution = JSON.parse(await readFile(join(target, 'tsconfig.json'), 'utf-8')) as {
      files: string[];
      references: { path: string }[];
    };
    expect(solution.files).toEqual([]);
    expect(solution.references).toEqual([
      { path: './tsconfig.app.json' },
      { path: './tsconfig.node.json' },
    ]);
  });

  it('CV-25, CV-64: the scaffold type-checks vite.config.ts: tsconfig.node.json includes it and the typecheck script is tsc -b', async () => {
    const target = join(dir, 'node-project');
    expect(await run([target], capture().io)).toBe(0);
    const node = JSON.parse(await readFile(join(target, 'tsconfig.node.json'), 'utf-8')) as {
      compilerOptions: { types: string[] };
      include: string[];
    };
    expect(node.include).toEqual(['vite.config.ts']);
    expect(node.compilerOptions.types).toEqual(['node']);
    const pkg = JSON.parse(await readFile(join(target, 'package.json'), 'utf-8')) as {
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.scripts.typecheck).toBe('tsc -b');
    expect(pkg.scripts.build).toBe('tsc -b && vite build');
    expect(pkg.devDependencies['@types/node']).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('CV-25: every scaffolded file equals its template file byte for byte', async () => {
    const templates = resolve(import.meta.dirname, '../../packages/create-modern-cmdk/templates');
    for (const template of ['react-basic', 'react-dialog']) {
      const target = join(dir, `bytes-${template}`);
      expect(await run([target, `--template=${template}`], capture().io)).toBe(0);
      const expected = new Map<string, string>([
        ['tsconfig.json', 'shared/tsconfig.json'],
        ['tsconfig.app.json', 'shared/tsconfig.app.json'],
        ['tsconfig.node.json', 'shared/tsconfig.node.json'],
        ['vite.config.ts', 'shared/vite.config.ts'],
        [join('src', 'main.tsx'), 'shared/src/main.tsx'],
        [join('src', 'App.tsx'), `${template}/src/App.tsx`],
      ]);
      for (const [file, source] of expected) {
        expect(await readFile(join(target, file), 'utf-8'), file).toBe(
          await readFile(join(templates, source), 'utf-8'),
        );
      }
      // index.html differs from its template in the {{title}} placeholder alone.
      const html = await readFile(join(templates, 'shared/index.html'), 'utf-8');
      expect(await readFile(join(target, 'index.html'), 'utf-8')).toBe(
        html.replace('{{title}}', `bytes-${template}`),
      );
      expect(html.match(/\{\{[^}]*\}\}/g)).toEqual(['{{title}}']);
    }
  });
});
