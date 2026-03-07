#!/usr/bin/env node

// @crimson_dev/create-command — Scaffold a new command palette project
// Usage: npx @crimson_dev/create-command [project-name]

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const TEMPLATES = new Map([
  ['react-basic', 'Basic inline command palette (React)'],
  ['react-dialog', 'Dialog command palette with Ctrl+K (React)'],
  ['react-full', 'Full-featured: dialog + frecency + WASM search (React)'],
]);

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const projectName = args[0];

  if (!projectName || projectName === '--help') {
    console.log(`
@crimson_dev/create-command

Usage:
  npx @crimson_dev/create-command <project-name> [--template <name>]

Templates:`);
    TEMPLATES.entries().forEach(([name, desc]) => {
      console.log(`  ${name.padEnd(20)} ${desc}`);
    });
    console.log('');
    process.exit(0);
  }

  const templateFlag = args.indexOf('--template');
  const template = templateFlag !== -1 ? args[templateFlag + 1] ?? 'react-basic' : 'react-basic';

  if (!TEMPLATES.has(template)) {
    console.error(`Unknown template: ${template}`);
    console.error(`Available: ${TEMPLATES.keys().toArray().join(', ')}`);
    process.exit(1);
  }

  const projectDir = resolve(projectName);
  console.log(`\nScaffolding ${template} project in ${projectDir}...\n`);

  await mkdir(join(projectDir, 'src'), { recursive: true });

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
  await writeFile(join(projectDir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

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
  await writeFile(join(projectDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2) + '\n');

  // vite.config.ts
  await writeFile(
    join(projectDir, 'vite.config.ts'),
    `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`,
  );

  // index.html
  await writeFile(
    join(projectDir, 'index.html'),
    `<!DOCTYPE html>
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
`,
  );

  // src/main.tsx
  await writeFile(
    join(projectDir, 'src', 'main.tsx'),
    `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`,
  );

  // src/App.tsx — varies by template
  const appContent = template === 'react-dialog'
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
  await writeFile(join(projectDir, 'src', 'App.tsx'), appContent);

  console.log('Done! Next steps:\n');
  console.log(`  cd ${projectName}`);
  console.log('  pnpm install');
  console.log('  pnpm dev\n');
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
