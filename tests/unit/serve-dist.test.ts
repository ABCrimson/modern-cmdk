// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error scripts/serve-dist.mjs is plain JavaScript with JSDoc types
import { createDistServer } from '../../scripts/serve-dist.mjs';

// scripts/serve-dist.mjs serves the built docs to the tests/docs Playwright run. The defect it exists for: a failed read
// killed `vitepress preview` (sirv 3.0.2 pipes a ReadStream with no 'error' handler) and every later test saw
// connection refused. Here a failed read answers 500 or resets that one response, and the next request is served.

const BASE = '/modern-cmdk/';

let root: string;
let server: Server;
let origin: string;

type OpenFile = (path: string) => ReturnType<typeof open>;

async function start(openFile?: OpenFile): Promise<void> {
  server = createDistServer({ root, base: BASE, ...(openFile ? { openFile } : {}) });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'serve-dist-'));
  mkdirSync(join(root, 'guide'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'index.html'), '<h1>home</h1>');
  writeFileSync(join(root, '404.html'), '<h1>not found</h1>');
  writeFileSync(join(root, 'guide', 'index.html'), '<h1>guide index</h1>');
  writeFileSync(join(root, 'guide', 'a.html'), '<h1>a</h1>');
  writeFileSync(join(root, 'assets', 'app.js'), 'export {};');
  writeFileSync(join(root, 'assets', 'font.woff2'), 'woff');
});

afterEach(async () => {
  // fetch keeps its connections alive, and close() waits for them
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  rmSync(root, { recursive: true, force: true });
});

describe('serve-dist', () => {
  it('serves pages and assets under the base with their content types, and a directory as its index.html', async () => {
    await start();
    const home = await fetch(`${origin}${BASE}`);
    expect(home.status).toBe(200);
    expect(home.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await home.text()).toBe('<h1>home</h1>');
    expect(await (await fetch(`${origin}${BASE}guide/`)).text()).toBe('<h1>guide index</h1>');
    expect(await (await fetch(`${origin}${BASE}guide`)).text()).toBe('<h1>guide index</h1>');
    expect((await fetch(`${origin}${BASE}guide/a.html`)).status).toBe(200);
    const script = await fetch(`${origin}${BASE}assets/app.js`);
    expect(script.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect((await fetch(`${origin}${BASE}assets/font.woff2`)).headers.get('content-type')).toBe(
      'font/woff2',
    );
  });

  it('answers an unknown path, a path outside the base and a traversal with 404 and the 404.html page', async () => {
    await start();
    for (const path of [
      `${BASE}guide/missing.html`,
      '/elsewhere.html',
      `${BASE}..%2f..%2fetc%2fpasswd`,
    ]) {
      const response = await fetch(`${origin}${path}`);
      expect(response.status, path).toBe(404);
      expect(await response.text(), path).toBe('<h1>not found</h1>');
    }
  });

  it('answers 400 for a malformed path: a bad percent escape or a NUL byte in the decoded path', async () => {
    await start();
    for (const path of [`${BASE}%zz`, `${BASE}%00`, `${BASE}guide/a.html%00.png`]) {
      const response = await fetch(`${origin}${path}`);
      expect(response.status, path).toBe(400);
      await response.text();
    }
    expect((await fetch(`${origin}${BASE}`)).status, 'keeps serving').toBe(200);
  });

  it('answers 500 when a file cannot be opened, and keeps serving', async () => {
    await start(async (path) => {
      if (path.endsWith('a.html')) throw Object.assign(new Error('boom'), { code: 'EIO' });
      return open(path, 'r');
    });
    const failed = await fetch(`${origin}${BASE}guide/a.html`);
    expect(failed.status).toBe(500);
    await failed.text();
    const next = await fetch(`${origin}${BASE}`);
    expect(next.status).toBe(200);
    expect(await next.text()).toBe('<h1>home</h1>');
  });

  it('survives a read error in the middle of a response: that request fails, the next is served', async () => {
    await start(async (path) => {
      const handle = await open(path, 'r');
      if (!path.endsWith('a.html')) return handle;
      return {
        stat: () => handle.stat(),
        close: () => handle.close(),
        createReadStream: () =>
          new Readable({
            read(): void {
              this.destroy(Object.assign(new Error('read failed'), { code: 'EIO' }));
            },
          }),
      } as unknown as Awaited<ReturnType<typeof open>>;
    });
    await expect(
      fetch(`${origin}${BASE}guide/a.html`).then((response) => response.text()),
    ).rejects.toThrow();
    const next = await fetch(`${origin}${BASE}`);
    expect(next.status).toBe(200);
    expect(await next.text()).toBe('<h1>home</h1>');
  });

  it('rejects methods other than GET and HEAD with 405', async () => {
    await start();
    const response = await fetch(`${origin}${BASE}`, { method: 'POST' });
    expect(response.status).toBe(405);
  });
});
