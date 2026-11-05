#!/usr/bin/env node

// create-modern-cmdk — Scaffold a new command palette project
// Usage: npx create-modern-cmdk <project-name> [--template=<name>] [--no-overwrite] [--strict]
//        npx create-modern-cmdk --help
//
// Order of work: parse, check the template, derive and validate the names, resolve the target, stat
// the output paths and list the files this run will overwrite on stderr, refuse under
// --no-overwrite when any collides, then create directories and write. Nothing is written before
// those checks pass; a failed write removes only the files and directories this run created.
//
// Exit codes. Without --strict (the 1.x defaults): 0 for --help and a missing project name; 1 for
// an unknown template, an unusable name (empty or over 214 characters as a package name, or
// illegal on Windows), a --no-overwrite collision and write failures. An unknown option is ignored
// with a warning on stderr when a project name is present (the scaffold carries on as in 1.2.2);
// without a name it is a usage error that exits 0. A malformed known option (a flag given a value,
// --template with no value or a dash-led space-form value) is a usage error that exits 0 and
// writes nothing, even beside an unknown option. With --strict: 2 for any usage error (including
// an unknown option and an unknown template) and for an unusable name.

import { lstat, mkdir, rm, rmdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { parseArgs, styleText } from 'node:util';

const TEMPLATES: Map<string, string> = new Map([
  ['react-basic', 'Basic inline command palette (React)'],
  [
    'react-dialog',
    'Command palette in a dialog, opened with Mod+K (Ctrl+K, Cmd+K on macOS) (React)',
  ],
  ['react-full', 'Deprecated alias of react-basic (removed in create-modern-cmdk 2.0)'],
]);

/** The two streams the CLI writes to; `process` satisfies this, tests pass collectors. */
export interface CliIo {
  readonly stdout: NodeJS.WritableStream;
  readonly stderr: NodeJS.WritableStream;
}

function usageText(stream: NodeJS.WritableStream): string {
  const bold = (s: string): string => styleText('bold', s, { stream });
  const name = (s: string): string => styleText('cyan', s.padEnd(19), { stream });
  return [
    `${bold('Usage:')} create-modern-cmdk <project-name> [options]`,
    '',
    bold('Templates:'),
    ...TEMPLATES.entries()
      .map(([id, description]) => `  ${name(id)}${description}`)
      .toArray(),
    '',
    bold('Options:'),
    `  ${name('--template=<name>')}Template to scaffold (default react-basic)`,
    `  ${name('--no-overwrite')}Refuse a target directory that already holds any file this run would write`,
    '                     (1.x lists the files it overwrites and carries on; create-modern-cmdk 2.0 refuses',
    '                     a non-empty target unless --force is given)',
    `  ${name('--strict')}Exit 2 on usage errors (incl. unknown options)`,
    `  ${name('-h, --help')}Show this help`,
    '',
  ].join('\n');
}

interface CliValues {
  readonly help?: string | boolean | undefined;
  readonly strict?: string | boolean | undefined;
  readonly template?: string | boolean | undefined;
  readonly overwrite?: string | boolean | undefined;
}

const OPTIONS = {
  help: { type: 'boolean', short: 'h' },
  strict: { type: 'boolean' },
  overwrite: { type: 'boolean', default: true },
  template: { type: 'string' },
} as const;

function parseCli(argv: readonly string[]): {
  readonly values: CliValues;
  readonly positionals: string[];
} {
  return parseArgs({
    args: [...argv],
    options: OPTIONS,
    allowPositionals: true,
    allowNegative: true,
    strict: true,
  });
}

const MAX_PACKAGE_NAME = 214;
/** A valid scoped package name, kept as given (1.4 wrote `name: projectName`). */
const SCOPED_NAME = /^@[a-z0-9-~][a-z0-9-._~]*\/[a-z0-9-~][a-z0-9-._~]*$/;
const OUTPUT_FILES: readonly string[] = [
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'index.html',
  join('src', 'main.tsx'),
  join('src', 'App.tsx'),
];
const DEPRECATED_ALIAS = 'react-full';

/** Escape the five characters that matter in HTML text and attribute values. */
export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Why `name` cannot be a directory on `platform`, or undefined when it can. Only win32 refuses:
 * its illegal characters (<>:"|?* and control characters) and reserved device names.
 */
export function validateTarget(name: string, platform: NodeJS.Platform): string | undefined {
  if (platform !== 'win32') return undefined;
  const illegal = name.match(/[<>:"|?*]|\p{Cc}/u);
  if (illegal) {
    return `"${name}" contains a character Windows cannot use in a directory name (${JSON.stringify(illegal[0])})`;
  }
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(name)) {
    return `"${name}" is a reserved device name on Windows`;
  }
  return undefined;
}

/** The npm package name for a directory name: lower-cased, runs of invalid characters become '-'. */
function derivePackageName(directoryName: string): string {
  return directoryName
    .toLowerCase()
    .replaceAll(/[^a-z0-9\-._~]+/g, '-')
    .replace(/^[._-]+/, '');
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw e;
  }
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Run the scaffolder. Resolves to the process exit code; writes only to `io`.
 */
export async function run(argv: readonly string[], io: CliIo): Promise<number> {
  const out = (s: string): void => void io.stdout.write(`${s}\n`);
  const err = (s: string): void => void io.stderr.write(`${s}\n`);
  const fail = (s: string): void =>
    err(`${styleText('red', 'error:', { stream: io.stderr })} ${s}`);

  try {
    let values: CliValues;
    let positionals: string[];
    try {
      ({ values, positionals } = parseCli(argv));
    } catch (e) {
      const strictArg = argv.includes('--strict');
      if ((e as NodeJS.ErrnoException).code !== 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
        fail(e instanceof Error ? e.message : String(e));
        err(usageText(io.stderr));
        return strictArg ? 2 : 0;
      }
      // Re-parse loosely: unknown options become option tokens, everything else parses as before.
      const loose = parseArgs({
        args: [...argv],
        options: OPTIONS,
        allowPositionals: true,
        allowNegative: true,
        strict: false,
        tokens: true,
      });
      const ignored = loose.tokens
        .filter((t) => t.kind === 'option' && !Object.hasOwn(OPTIONS, t.name))
        .map((t) => (t as { rawName: string }).rawName);
      const badValue = loose.tokens.find(
        (t) =>
          t.kind === 'option' &&
          Object.hasOwn(OPTIONS, t.name) &&
          (OPTIONS[t.name as keyof typeof OPTIONS].type === 'boolean'
            ? t.value !== undefined
            : t.value === undefined ||
              (!t.inlineValue && t.value.length > 1 && t.value.startsWith('-'))),
      );
      const badMessage =
        badValue?.kind === 'option'
          ? badValue.value === undefined
            ? `Option '${badValue.rawName} <value>' argument missing`
            : OPTIONS[badValue.name as keyof typeof OPTIONS].type === 'boolean'
              ? `Option '${badValue.rawName}' does not take an argument`
              : `Option '${badValue.rawName}' argument is ambiguous.\nDid you forget to specify the option argument for '${badValue.rawName}'?\nTo specify an option argument starting with a dash use '${badValue.rawName}=-XYZ'.`
          : undefined;
      if (badMessage !== undefined) {
        fail(badMessage);
        err(usageText(io.stderr));
        return strictArg ? 2 : 0;
      }
      if (strictArg || loose.values.help === true || loose.positionals.length < 1) {
        fail(`unknown option ${ignored[0]}`);
        err(usageText(io.stderr));
        return strictArg ? 2 : 0;
      }
      for (const name of ignored) {
        err(`warning: unknown option ${name} ignored (--strict makes this exit 2)`);
      }
      values = loose.values;
      positionals = loose.positionals;
    }

    const strict = values.strict === true;

    if (values.help) {
      out(usageText(io.stdout));
      return 0;
    }

    const projectName = positionals[0];
    if (!projectName) {
      err(usageText(io.stderr));
      return strict ? 2 : 0;
    }

    const requested = typeof values.template === 'string' ? values.template : 'react-basic';
    if (!TEMPLATES.has(requested)) {
      fail(`unknown template "${requested}". Valid templates: ${[...TEMPLATES.keys()].join(', ')}`);
      return strict ? 2 : 1;
    }
    const template = requested === DEPRECATED_ALIAS ? 'react-basic' : requested;
    if (requested === DEPRECATED_ALIAS) {
      err(
        'warning: the react-full template is a deprecated alias of react-basic; it is removed in create-modern-cmdk 2.0',
      );
    }

    const projectDir = resolve(projectName);
    const directoryName = basename(projectDir);
    const badTarget = validateTarget(directoryName, process.platform);
    if (badTarget !== undefined) {
      fail(badTarget);
      return strict ? 2 : 1;
    }
    const asGiven = projectName.replaceAll('\\', '/');
    const packageName =
      SCOPED_NAME.test(asGiven) && asGiven.length <= MAX_PACKAGE_NAME
        ? asGiven
        : derivePackageName(directoryName);
    if (packageName === '' || packageName.length > MAX_PACKAGE_NAME) {
      fail(
        packageName === ''
          ? `cannot derive a package name from "${directoryName}"`
          : `the package name derived from "${directoryName}" exceeds ${MAX_PACKAGE_NAME} characters`,
      );
      return strict ? 2 : 1;
    }
    if (packageName !== directoryName && packageName !== asGiven) {
      out(`note: package name "${packageName}" (from "${directoryName}")`);
    }

    const noOverwrite = values.overwrite === false;
    const collisions: string[] = [];
    for (const file of OUTPUT_FILES) {
      if (await pathExists(join(projectDir, file))) collisions.push(file);
    }
    if (collisions.length > 0) {
      const plural = collisions.length === 1 ? '' : 's';
      err(
        noOverwrite
          ? `error: ${projectDir} already holds ${collisions.length} file${plural} this run would overwrite:`
          : `warning: ${projectDir} is not empty; this run will overwrite ${collisions.length} file${plural}:`,
      );
      for (const file of collisions) err(`  ${file.replaceAll('\\', '/')}`);
      if (noOverwrite) {
        err('nothing was written (--no-overwrite)');
        return 1;
      }
    }

    // Record what this run creates so a failure removes only that.
    const createdDirs: string[] = []; // deepest first
    const createdFiles: string[] = [];
    const cleanup = async (): Promise<void> => {
      for (const file of createdFiles) {
        await rm(file, { force: true }).catch((e: unknown) => fail(message(e)));
      }
      for (const d of createdDirs) {
        await rmdir(d).catch((e: unknown) => fail(message(e)));
      }
    };
    const missing: string[] = []; // shallowest first
    for (
      let d = join(projectDir, 'src');
      dirname(d) !== d && !(await pathExists(d));
      d = dirname(d)
    ) {
      missing.unshift(d);
    }
    try {
      for (const d of missing) {
        await mkdir(d);
        createdDirs.unshift(d);
      }
    } catch (e) {
      fail(message(e));
      await cleanup();
      return 1;
    }

    // --- Generate files concurrently using Promise.allSettled ---

    // package.json
    const pkg = {
      name: packageName,
      version: '0.1.0',
      type: 'module',
      private: true,
      scripts: {
        dev: 'vite',
        build: 'vite build',
        preview: 'vite preview',
      },
      dependencies: {
        'modern-cmdk': '^1.2.2',
        'radix-ui': '^1.8.1',
        react: '^19.3.1',
        'react-dom': '^19.3.1',
      },
      devDependencies: {
        '@types/react': '^19.3.0',
        '@types/react-dom': '^19.3.0',
        '@vitejs/plugin-react': '^6.2.1',
        typescript: '^7.0.2',
        vite: '^8.3.5',
      },
    };

    // tsconfig.json
    const tsconfig = {
      compilerOptions: {
        target: 'ESNext',
        module: 'ESNext',
        moduleResolution: 'bundler',
        lib: ['ESNext', 'DOM', 'DOM.Iterable'],
        jsx: 'react-jsx',
        strict: true,
        noEmit: true,
        erasableSyntaxOnly: true,
        verbatimModuleSyntax: true,
        skipLibCheck: true,
      },
      include: ['src'],
    };

    // vite.config.ts
    const viteConfig = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`;

    // index.html
    const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(directoryName)}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

    // src/main.tsx
    const mainTsx = `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`;

    // src/App.tsx — varies by template
    const appContent =
      template === 'react-dialog'
        ? `import { Command } from 'modern-cmdk/react';
import { useEffect, useState } from 'react';

export function App() {
  const [open, setOpen] = useState(false);

  // Mod+K: Cmd+K on macOS, Ctrl+K elsewhere
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>Command Palette</h1>
      <p>Press <kbd>Ctrl+K</kbd> (<kbd>Cmd+K</kbd> on macOS) to open.</p>
      <Command.Dialog open={open} onOpenChange={setOpen}>
        <Command.Input placeholder="Search commands..." />
        <Command.List>
          <Command.Empty>No results found.</Command.Empty>
          <Command.Item value="home" onSelect={() => alert('Home!')}>Home</Command.Item>
          <Command.Item value="settings" onSelect={() => alert('Settings!')}>Settings</Command.Item>
          <Command.Item value="profile" onSelect={() => alert('Profile!')}>Profile</Command.Item>
        </Command.List>
      </Command.Dialog>
    </div>
  );
}
`
        : `import { Command } from 'modern-cmdk/react';

export function App() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>Command Palette</h1>
      <Command label="Command menu">
        <Command.Input placeholder="Search..." />
        <Command.List>
          <Command.Empty>No results found.</Command.Empty>
          <Command.Group heading="Actions">
            <Command.Item value="copy" onSelect={() => alert('Copied!')}>Copy</Command.Item>
            <Command.Item value="paste" onSelect={() => alert('Pasted!')}>Paste</Command.Item>
          </Command.Group>
          <Command.Group heading="Navigation">
            <Command.Item value="home" onSelect={() => alert('Home!')}>Home</Command.Item>
            <Command.Item value="settings" onSelect={() => alert('Settings!')}>Settings</Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
`;

    const contents: ReadonlyMap<string, string> = new Map([
      ['package.json', `${JSON.stringify(pkg, null, 2)}\n`],
      ['tsconfig.json', `${JSON.stringify(tsconfig, null, 2)}\n`],
      ['vite.config.ts', viteConfig],
      ['index.html', indexHtml],
      [join('src', 'main.tsx'), mainTsx],
      [join('src', 'App.tsx'), appContent],
    ]);
    const preExisting = new Set(collisions);
    const flag = noOverwrite ? 'wx' : 'w';
    const results = await Promise.allSettled(
      contents.entries().map(async ([file, content]) => {
        const path = join(projectDir, file);
        // Record before writing: a write that fails midway can leave a partial file.
        if (!preExisting.has(file)) createdFiles.push(path);
        try {
          await writeFile(path, content, { flag });
        } catch (e) {
          // 'wx' lost a race: the file is someone else's, so it is not ours to remove.
          if ((e as NodeJS.ErrnoException).code === 'EEXIST') {
            createdFiles.splice(createdFiles.indexOf(path), 1);
          }
          throw e;
        }
        return path;
      }),
    );

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      for (const r of failed) fail(message(r.reason));
      await cleanup();
      return 1;
    }

    const written = results
      .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
      .map((r) => r.value);
    out(styleText('green', `Created ${projectName} from ${template}:`, { stream: io.stdout }));
    for (const f of written)
      out(`  ${projectName}/${relative(projectDir, f).replaceAll('\\', '/')}`);
    out('');
    out('Next steps:');
    out(`  cd ${/\s/.test(projectName) ? `"${projectName}"` : projectName}`);
    out('  pnpm install');
    out('  pnpm dev');
    return 0;
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await run(process.argv.slice(2), process);
}
