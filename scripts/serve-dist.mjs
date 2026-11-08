// scripts/serve-dist.mjs
// A static server for the built docs (apps/docs/.vitepress/dist) that the tests/docs Playwright run starts through its
// webServer. It replaces `vitepress preview`, whose file server (sirv 3.0.2, apps/docs/node_modules/vitepress/dist/node/
// chunk-BjrVv9r8.js:28534) pipes `fs.createReadStream(file)` into the response with no 'error' handler: one failed read
// (observed once: ENOENT on a file that exists, 54,361 B) is an unhandled 'error' event and kills the process, and every
// later test fails with connection refused. Here a failed open answers 500, a failed read tears down that one response,
// and the server keeps serving.
//
// Behaviour, so tests/docs pass exactly as against `vitepress preview`: the site is served under --base (the GitHub Pages
// project path), a directory answers its index.html, and a path with no file answers 404 with the page's own 404.html.
// No dependency: node:http, node:fs/promises, node:stream/promises (Node >= 26.4, the repository's floor).
//
//   node scripts/serve-dist.mjs [--root <dir>] [--base <path>] [--port <n>]
//
//   --root  the built site (default: apps/docs/.vitepress/dist, relative to the repository root)
//   --base  the site's base path (default: /modern-cmdk/, apps/docs/.vitepress/config.ts)
//   --port  default 4173, the port playwright.docs.config.ts waits for

import { open } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

/** The content types of what a VitePress build emits (dist/ holds .html, .css, .js, .json, fonts, images, a manifest). */
export const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.avif', 'image/avif'],
  ['.gif', 'image/gif'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.wasm', 'application/wasm'],
]);

/**
 * @typedef {object} Handle
 * @property {() => Promise<{ isFile(): boolean, size: number }>} stat
 * @property {(options?: object) => import('node:stream').Readable} createReadStream
 * @property {() => Promise<void>} close
 */

/**
 * @param {object} options
 * @param {string} options.root the built site
 * @param {string} options.base the site's base path, with a leading and a trailing slash
 * @param {(path: string) => Promise<Handle>} [options.openFile] opens a file for reading; replaceable so a test can make a read fail
 * @returns {import('node:http').Server}
 */
export function createDistServer({ root, base, openFile = (path) => open(path, 'r') }) {
  const absoluteRoot = resolve(root);

  /** @param {string} relative a path under the base, without a leading slash */
  function locate(relative) {
    const target = relative === '' || relative.endsWith('/') ? `${relative}index.html` : relative;
    const absolute = resolve(join(absoluteRoot, target));
    // a decoded ../ must not leave the root
    if (absolute !== absoluteRoot && !absolute.startsWith(absoluteRoot + sep)) return undefined;
    return absolute;
  }

  /**
   * Opens `path` when it names a file, else (a directory) its index.html. Returns undefined when nothing is there.
   * @param {string} path
   * @returns {Promise<{ handle: Handle, size: number, path: string } | undefined>}
   */
  async function openServable(path) {
    for (const candidate of [path, join(path, 'index.html')]) {
      let handle;
      try {
        handle = await openFile(candidate);
      } catch (error) {
        // a missing file is a 404; any other open error (EIO, EACCES, EMFILE) is a 500, never a crash. A directory opens
        // fine for reading (Windows and Linux alike), so stat() below tells it apart.
        if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') continue;
        throw error;
      }
      const stats = await handle.stat();
      if (stats.isFile()) return { handle, size: stats.size, path: candidate };
      await handle.close();
    }
    return undefined;
  }

  return createServer((request, response) => {
    serve(request, response).catch((error) => {
      // a failed open or stat before any byte was sent is a 500; the server itself carries on
      if (!response.headersSent) {
        response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        response.end(`500: ${error?.code ?? 'read error'}`);
      } else {
        response.destroy();
      }
    });
  });

  /**
   * @param {import('node:http').IncomingMessage} request
   * @param {import('node:http').ServerResponse} response
   */
  async function serve(request, response) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { allow: 'GET, HEAD' });
      response.end();
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    } catch {
      response.writeHead(400);
      response.end();
      return;
    }
    let status = 200;
    let served;
    if (pathname.startsWith(base) || `${pathname}/` === base) {
      const located = locate(pathname.slice(base.length));
      if (located !== undefined) served = await openServable(located);
    }
    if (served === undefined) {
      // VitePress writes 404.html at the root of dist: the page every unknown path answers
      status = 404;
      served = await openServable(join(absoluteRoot, '404.html'));
    }
    if (served === undefined) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('404');
      return;
    }
    const { handle, size, path } = served;
    try {
      response.writeHead(status, {
        'content-type': MIME.get(extname(path).toLowerCase()) ?? 'application/octet-stream',
        'content-length': size,
        'cache-control': 'no-cache',
      });
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      // pipeline() forwards a read error to the response (destroyed, the client sees a reset) and rejects, instead of
      // raising an unhandled 'error' event on the stream as sirv's bare .pipe() does
      await pipeline(handle.createReadStream(), response);
    } finally {
      await handle.close().catch(() => undefined);
    }
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repository = resolve(import.meta.dirname, '..');
  const { values } = parseArgs({
    options: {
      root: { type: 'string', default: join(repository, 'apps', 'docs', '.vitepress', 'dist') },
      base: { type: 'string', default: '/modern-cmdk/' },
      port: { type: 'string', default: '4173' },
    },
    strict: true,
  });
  const server = createDistServer({ root: values.root, base: values.base });
  server.listen(Number(values.port), () => {
    // biome-ignore lint/suspicious/noConsole: a CLI reports where it listens
    console.log(`serving ${values.root} at http://localhost:${values.port}${values.base}`);
  });
}
