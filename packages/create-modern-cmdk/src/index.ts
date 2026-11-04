#!/usr/bin/env node

// create-modern-cmdk — Scaffold a new command palette project
// Usage: npx create-modern-cmdk <project-name> [--template=<name>] [--strict]
//        npx create-modern-cmdk --help
//
// Exit codes. Without --strict (the 1.x defaults): 0 for --help and a missing project name; 1 for
// an unknown template and write failures. An unknown option is ignored with a warning on stderr
// when a project name is present (the scaffold carries on as in 1.2.2); without a name it is a
// usage error that exits 0. A malformed known option (a flag given a value, --template with no
// value or a dash-led space-form value) is a usage error that exits 0 and writes nothing, even
// beside an unknown option. With --strict: 2 for any usage error (including an unknown option and
// an unknown template).

import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { parseArgs, styleText } from 'node:util';

const TEMPLATES: Map<string, string> = new Map([
  ['react-basic', 'Basic inline command palette (React)'],
  [
    'react-dialog',
    'Command palette in a dialog, opened with Mod+K (Ctrl+K, Cmd+K on macOS) (React)',
  ],
  [
    'react-full',
    'Same output as react-basic; frecency and WASM search are not scaffolded yet (React)',
  ],
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
    `  ${name('--strict')}Exit 2 on usage errors (incl. unknown options)`,
    `  ${name('-h, --help')}Show this help`,
    '',
  ].join('\n');
}

interface CliValues {
  readonly help?: string | boolean | undefined;
  readonly strict?: string | boolean | undefined;
  readonly template?: string | boolean | undefined;
}

const OPTIONS = {
  help: { type: 'boolean', short: 'h' },
  strict: { type: 'boolean' },
  template: { type: 'string' },
} as const;

function parseCli(argv: readonly string[]): {
  readonly values: CliValues;
  readonly positionals: string[];
} {
  return parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true, strict: true });
}

/** Write a file and return its path (for reporting). */
async function emitFile(filePath: string, content: string): Promise<string> {
  await writeFile(filePath, content);
  return filePath;
}

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

    const template = typeof values.template === 'string' ? values.template : 'react-basic';
    if (!TEMPLATES.has(template)) {
      fail(`unknown template "${template}". Valid templates: ${[...TEMPLATES.keys()].join(', ')}`);
      return strict ? 2 : 1;
    }

    const projectDir = resolve(projectName);

    await mkdir(join(projectDir, 'src'), { recursive: true });

    // --- Generate files concurrently using Promise.allSettled ---

    // package.json
    const pkg = {
      name: projectName,
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
    <title>${projectName}</title>
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

    // Write all files concurrently
    const results = await Promise.allSettled([
      emitFile(join(projectDir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`),
      emitFile(join(projectDir, 'tsconfig.json'), `${JSON.stringify(tsconfig, null, 2)}\n`),
      emitFile(join(projectDir, 'vite.config.ts'), viteConfig),
      emitFile(join(projectDir, 'index.html'), indexHtml),
      emitFile(join(projectDir, 'src', 'main.tsx'), mainTsx),
      emitFile(join(projectDir, 'src', 'App.tsx'), appContent),
    ]);

    // Report results
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      for (const r of failed) fail(String(r.reason instanceof Error ? r.reason.message : r.reason));
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
    out(`  cd ${projectName}`);
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
