#!/usr/bin/env node

// @crimson_dev/create-command — Scaffold a new command palette project
// Usage: npx @crimson_dev/create-command [project-name] [--template=<name>]

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const TEMPLATES = new Map([
  ['react-basic', 'Basic inline command palette (React)'],
  ['react-dialog', 'Dialog command palette with Ctrl+K (React)'],
  ['react-full', 'Full-featured: dialog + frecency + WASM search (React)'],
]);

function printUsage(): void {
  // ES2026 Iterator Helper: .forEach on map entries
  TEMPLATES.entries().forEach(([_name, _desc]) => {});
}

function parseArgs(argv: string[]): { projectName: string; template: string } | null {
  const args = argv.slice(2);

  // ES2026 Iterator Helpers: separate flags and positional args
  const flags = args
    .values()
    .filter((a) => a.startsWith('--'))
    .toArray();
  const positional = args
    .values()
    .filter((a) => !a.startsWith('--'))
    .toArray();

  const projectName = positional[0];

  if (!projectName || projectName === '--help') {
    return null;
  }

  // Parse --template=<name> using Iterator Helpers
  const templateFlag = flags.values().find((f) => f.startsWith('--template='));
  const template = templateFlag ? templateFlag.split('=')[1]! : 'react-basic';

  return { projectName, template };
}

/** Write a file and return its path (for reporting). */
async function emitFile(filePath: string, content: string): Promise<string> {
  await writeFile(filePath, content);
  return filePath;
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  if (!parsed) {
    printUsage();
    process.exit(0);
  }

  const { projectName, template } = parsed;

  if (!TEMPLATES.has(template)) {
    const _available = TEMPLATES.keys().toArray().join(', ');
    process.exit(1);
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
      '@crimson_dev/command': '^0.9.0',
      '@crimson_dev/command-react': '^0.9.0',
      react: '^19.3.0',
      'react-dom': '^19.3.0',
      ...(template === 'react-full' ? { '@crimson_dev/command-search-wasm': '^0.9.0' } : {}),
    },
    devDependencies: {
      '@vitejs/plugin-react': '^5.0.0',
      typescript: '^6.0.0',
      vite: '^7.0.0',
    },
  };

  // tsconfig.json
  const tsconfig = {
    compilerOptions: {
      target: 'ES2026',
      module: 'ES2025',
      moduleResolution: 'bundler',
      lib: ['ES2026', 'DOM', 'DOM.Iterable'],
      jsx: 'react-jsx',
      strict: true,
      noEmit: true,
      isolatedDeclarations: true,
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
      ? `import { Command } from '@crimson_dev/command-react';

export function App() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>Command Palette</h1>
      <p>Press <kbd>Ctrl+K</kbd> to open.</p>
      <Command.Dialog>
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
      : `import { Command } from '@crimson_dev/command-react';

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

  // Report results using Iterator Helpers
  const failed = results
    .values()
    .filter((r) => r.status === 'rejected')
    .toArray();

  if (failed.length > 0) {
    process.exit(1);
  }

  const written = results
    .values()
    .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
    .map((r) => r.value)
    .toArray();
  written.values().forEach((_f) => {});
}

main().catch((_err: unknown) => {
  process.exit(1);
});
