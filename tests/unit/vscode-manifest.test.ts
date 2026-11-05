// tests/unit/vscode-manifest.test.ts
// CV-42 (D7 repo side): the VS Code extension package is private, packageable by a pinned vsce
// and carries the metadata vsce asks for.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../packages/vscode-modern-cmdk');
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  private?: boolean;
  repository?: { type?: string; url?: string; directory?: string };
  homepage?: string;
  bugs?: { url?: string };
  keywords?: string[];
  icon?: string;
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  contributes?: { snippets?: { language: string; path: string }[] };
};

describe('vscode-modern-cmdk manifest', () => {
  it('is private so changesets never publishes it to npm', () => {
    expect(manifest.private).toBe(true);
  });

  it('declares repository, homepage, bugs and keywords', () => {
    expect(manifest.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/ABCrimson/modern-cmdk.git',
      directory: 'packages/vscode-modern-cmdk',
    });
    expect(manifest.homepage).toBeTruthy();
    expect(manifest.bugs?.url).toBeTruthy();
    expect(manifest.keywords?.length).toBeGreaterThan(0);
  });

  it('ships images/icon.png as a 128x128 PNG', () => {
    expect(manifest.icon).toBe('images/icon.png');
    const png = readFileSync(resolve(root, 'images/icon.png'));
    expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(128);
    expect(png.readUInt32BE(20)).toBe(128);
  });

  it('packages with a pinned vsce devDependency', () => {
    expect(manifest.scripts?.package).toBe('vsce package --no-dependencies');
    expect(manifest.devDependencies?.['@vscode/vsce']).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
  });

  it('points every contributed snippet at an existing file', () => {
    const snippets = manifest.contributes?.snippets ?? [];
    expect(snippets.length).toBeGreaterThan(0);
    for (const s of snippets) expect(existsSync(resolve(root, s.path))).toBe(true);
  });
});

describe('vscode-modern-cmdk snippets', () => {
  const files =
    (JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { files?: string[] })
      .files ?? [];
  const snippets = manifest.contributes?.snippets ?? [];

  function load(path: string): Record<string, { prefix: string; body: string[] }> {
    return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  }

  it('CV-71: every contributes.snippets path is covered by files', () => {
    for (const s of snippets) {
      expect(files, s.path).toContain(s.path.replace(/^\.\//, ''));
    }
  });

  it('CV-58: cmd-machine is contributed to typescript and javascript', () => {
    const languagesOf = (path: string): string[] =>
      (manifest.contributes?.snippets ?? []).filter((s) => s.path === path).map((s) => s.language);
    expect(languagesOf('./src/snippets-core.json')).toEqual(
      expect.arrayContaining(['typescript', 'javascript', 'typescriptreact', 'javascriptreact']),
    );
    const core = Object.values(load('./src/snippets-core.json'));
    expect(core.map((s) => s.prefix)).toEqual(['cmd-machine']);
    const body = core[0]?.body.join('\n') ?? '';
    expect(body).toContain('machine[Symbol.dispose]()');
    expect(body).not.toMatch(/^using /m);
  });

  it('CV-30: the cmd-dialog body toggles on a case-insensitive key and wires onOpenChange', () => {
    const dialog = Object.values(load('./src/snippets.json')).find(
      (s) => s.prefix === 'cmd-dialog',
    );
    const body = dialog?.body.join('\n') ?? '';
    expect(body).toContain('onOpenChange');
    expect(body).toContain('toLowerCase');
  });

  it('CV-55: cmd-action passes the action isPending to Command.Loading', () => {
    const action = Object.values(load('./src/snippets.json')).find(
      (s) => s.prefix === 'cmd-action',
    );
    const body = action?.body.join('\n') ?? '';
    expect(body).toContain('loading={isPending}');
    expect(body).not.toContain('{isPending && <Command.Loading>');
  });
});
