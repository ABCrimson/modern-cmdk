// apps/docs/scripts/render-assets.ts
// Renders the docs site's brand assets from the vector sources in ./brand with Playwright Chromium and the real
// fonts (Instrument Sans Variable and Geist Mono Variable, Latin subset, from the Fontsource packages). An SVG in an
// <img> cannot fetch web fonts, so every image a third party loads is a PNG rendered here, and og-image.svg ships
// with the two woff2 files inlined as data: URIs.
//
// Node runs this file directly (erasable TypeScript only):
//
//   node apps/docs/scripts/render-assets.ts [--fonts-dir <dir>] [--social-out <file>]
//
//   --fonts-dir   directory holding the @fontsource-variable packages
//                 (default: apps/docs/node_modules/@fontsource-variable)
//   --social-out  where the 1280 x 640 GitHub social preview goes (default: the run directory's
//                 docs-2026-11/social-preview.png; the file is never committed or served)
//
// Outputs (all under apps/docs/public): og-image.png, og-image.svg, apple-touch-icon.png, favicon.svg (through svgo),
// brand/banner-dark.png, brand/banner-light.png. Every size and dimension is asserted on the
// rendered buffer before anything is written: a miss writes nothing for that asset and the run exits 1.
// Chromium runs with --use-angle=d3d11 on Windows outside CI (the host's GPU path), with default flags elsewhere.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { type Browser, chromium } from '@playwright/test';
import { optimize } from 'svgo';

const KB = 1000;
const appDir: string = resolve(import.meta.dirname, '..');
const brandDir: string = join(appDir, 'scripts', 'brand');
const publicDir: string = join(appDir, 'public');

const { values } = parseArgs({
  options: {
    'fonts-dir': { type: 'string', default: join(appDir, 'node_modules', '@fontsource-variable') },
    'social-out': {
      type: 'string',
      default: join(
        homedir(),
        '.claude',
        'projects',
        'C--Users-alber-Desktop-Projects-modern-cmdk',
        'runs',
        '2026-10-30-deep-dive',
        'docs-2026-11',
        'social-preview.png',
      ),
    },
  },
  strict: true,
});
const fontsDir: string = values['fonts-dir'];
const socialOut: string = values['social-out'];

interface Job {
  readonly name: string;
  /** Source SVG under scripts/brand. */
  readonly source: string;
  readonly out: string;
  /** Layout size in CSS pixels. */
  readonly width: number;
  readonly height: number;
  /** deviceScaleFactor: the PNG is width * scale by height * scale. */
  readonly scale: 1 | 2;
  /** Transparent outside the SVG's own shapes (the rounded banner corners). */
  readonly transparent: boolean;
  readonly maxBytes: number;
}

const jobs: readonly Job[] = [
  {
    name: 'og-image',
    source: 'og-image.svg',
    out: join(publicDir, 'og-image.png'),
    width: 1200,
    height: 630,
    scale: 1,
    transparent: false,
    maxBytes: 150 * KB,
  },
  {
    name: 'social-preview',
    source: 'social-preview.svg',
    out: socialOut,
    width: 1280,
    height: 640,
    scale: 1,
    transparent: false,
    maxBytes: 300 * KB,
  },
  {
    name: 'apple-touch-icon',
    source: 'touch-icon.svg',
    out: join(publicDir, 'apple-touch-icon.png'),
    width: 180,
    height: 180,
    scale: 1,
    transparent: false,
    maxBytes: 60 * KB,
  },
  {
    name: 'banner-dark',
    source: 'banner-dark.svg',
    out: join(publicDir, 'brand', 'banner-dark.png'),
    width: 1280,
    height: 400,
    scale: 2,
    transparent: true,
    maxBytes: 300 * KB,
  },
  {
    name: 'banner-light',
    source: 'banner-light.svg',
    out: join(publicDir, 'brand', 'banner-light.png'),
    width: 1280,
    height: 400,
    scale: 2,
    transparent: true,
    maxBytes: 300 * KB,
  },
];

const failures: string[] = [];
const say = (line: string): void => {
  process.stdout.write(`${line}\n`);
};
/** Records a failed assertion and returns whether it held. */
const check = (ok: boolean, message: string): boolean => {
  if (!ok) failures.push(message);
  return ok;
};

function fontFace(family: string, file: string, weights: string): string {
  const data = readFileSync(file).toString('base64');
  return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weights};font-display:block;src:url(data:font/woff2;base64,${data}) format('woff2')}`;
}

const fontFaces: string = [
  fontFace(
    'Instrument Sans Variable',
    join(fontsDir, 'instrument-sans', 'files', 'instrument-sans-latin-wght-normal.woff2'),
    '400 700',
  ),
  fontFace(
    'Geist Mono Variable',
    join(fontsDir, 'geist-mono', 'files', 'geist-mono-latin-wght-normal.woff2'),
    '100 900',
  ),
].join('');

/** A source with text opens its <style> with the font-family classes; the faces go in front of them. */
function withFonts(svg: string): string {
  return svg.replace('<style>', `<style>${fontFaces}`);
}

function pngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

function writeOut(file: string, data: string | Uint8Array): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
}

const launchArgs: string[] =
  process.platform === 'win32' && !process.env.CI ? ['--use-angle=d3d11'] : [];
const browser: Browser = await chromium.launch({ args: launchArgs });
say(
  `chromium ${browser.version()} (${launchArgs.length > 0 ? launchArgs.join(' ') : 'default flags'})`,
);

try {
  for (const job of jobs) {
    const svg = withFonts(readFileSync(join(brandDir, job.source), 'utf8'));
    const page = await browser.newPage({
      viewport: { width: job.width, height: job.height },
      deviceScaleFactor: job.scale,
    });
    await page.setContent(
      `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`,
    );
    await page.evaluate(async () => {
      await Promise.all([
        document.fonts.load('650 64px "Instrument Sans Variable"'),
        document.fonts.load('500 24px "Instrument Sans Variable"'),
        document.fonts.load('400 20px "Geist Mono Variable"'),
      ]);
      await document.fonts.ready;
    });
    const loaded = await page.evaluate(
      () =>
        document.fonts.check('650 64px "Instrument Sans Variable"') &&
        document.fonts.check('400 20px "Geist Mono Variable"'),
    );
    const fontsOk = check(loaded, `${job.name}: the inlined fonts did not load`);
    const png = await page.screenshot({ type: 'png', omitBackground: job.transparent });
    await page.close();

    const size = pngSize(png);
    const wantW = job.width * job.scale;
    const wantH = job.height * job.scale;
    const dimsOk = check(
      size.width === wantW && size.height === wantH,
      `${job.name}: ${size.width} x ${size.height}, want ${wantW} x ${wantH}`,
    );
    const bytesOk = check(
      png.length <= job.maxBytes,
      `${job.name}: ${png.length} B exceeds ${job.maxBytes} B`,
    );
    if (fontsOk && dimsOk && bytesOk) {
      writeOut(job.out, png);
      say(`${job.name}: ${size.width} x ${size.height}, ${png.length} B -> ${job.out}`);
    } else {
      say(`${job.name}: ${size.width} x ${size.height}, ${png.length} B, not written`);
    }
  }
} finally {
  await browser.close();
}

// og-image.svg ships at its path (create-modern-cmdk's README links it by raw URL) with the fonts inlined.
const ogSvg = withFonts(readFileSync(join(brandDir, 'og-image.svg'), 'utf8'));
if (check(!ogSvg.includes('oklch('), 'og-image.svg contains oklch(')) {
  writeOut(join(publicDir, 'og-image.svg'), ogSvg);
  say(`og-image.svg: ${Buffer.byteLength(ogSvg)} B -> ${join(publicDir, 'og-image.svg')}`);
}

// favicon.svg: the committed source through svgo (installed devDependency), at most 900 B.
const favicon: string = optimize(readFileSync(join(brandDir, 'favicon.svg'), 'utf8'), {
  multipass: true,
  plugins: ['preset-default'],
}).data;
const faviconBytes = Buffer.byteLength(favicon);
// The shipped SVGs carry sRGB hex only: Chromium paints OKLCH, other rasterisers do not.
const faviconOk =
  check(faviconBytes <= 900, `favicon.svg: ${faviconBytes} B exceeds 900 B`) &&
  check(!favicon.includes('oklch('), 'favicon.svg contains oklch(');
if (faviconOk) {
  writeOut(join(publicDir, 'favicon.svg'), favicon);
  say(`favicon.svg: ${faviconBytes} B -> ${join(publicDir, 'favicon.svg')}`);
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`FAIL ${failure}\n`);
  process.exit(1);
}
say('render-assets: all assertions passed');
