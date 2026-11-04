import { globSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { type APIRequestContext, type BrowserContext, expect, test as it } from '@playwright/test';

// Internal-link pass over every built docs page (DG-45 class: a link or #fragment that points at
// nothing). Every same-origin a[href] must stay under the Pages base, answer 200, and, with a
// #fragment, land on a page that has an element with that id. External links are lychee's job
// (lychee.toml, the CI `links` job).
const distDir = resolve(import.meta.dirname, '../../apps/docs/.vitepress/dist');

const routes = globSync('**/*.html', { cwd: distDir })
  .map((file) => file.split(sep).join('/'))
  .sort();

// One status request per target URL per worker process, however many pages link to it
const statuses = new Map<string, Promise<number>>();
// Ids come from the rendered DOM, not the static HTML: 404.html is an empty shell the client fills
const idSets = new Map<string, Promise<Set<string>>>();

function statusOf(request: APIRequestContext, url: string): Promise<number> {
  let status = statuses.get(url);
  if (status === undefined) {
    status = request.get(url).then((response) => response.status());
    statuses.set(url, status);
  }
  return status;
}

function idsOf(context: BrowserContext, url: string): Promise<Set<string>> {
  let ids = idSets.get(url);
  if (ids === undefined) {
    ids = (async () => {
      const page = await context.newPage();
      try {
        await page.goto(url);
        await page.waitForLoadState('networkidle');
        return new Set(
          await page.locator('[id]').evaluateAll((nodes) => nodes.map((node) => node.id)),
        );
      } finally {
        await page.close();
      }
    })();
    idSets.set(url, ids);
  }
  return ids;
}

it('the docs build output is present', () => {
  expect(
    routes.length,
    `no built pages under ${distDir}: run pnpm docs:build first`,
  ).toBeGreaterThan(0);
});

for (const route of routes) {
  it(`links on ${route} resolve`, async ({ page, request, baseURL }) => {
    if (baseURL === undefined) throw new Error('playwright.docs.config.ts sets no baseURL');
    const base = new URL(baseURL);
    const response = await page.goto(route === 'index.html' ? '' : route);
    expect(response?.ok(), `${route} answered ${response?.status()}`).toBe(true);

    // a.href is the browser-resolved absolute URL of each anchor
    const hrefs = await page
      .locator('a[href]')
      .evaluateAll((anchors) => anchors.map((anchor) => (anchor as HTMLAnchorElement).href));

    const problems: string[] = [];
    for (const href of new Set(hrefs)) {
      const url = new URL(href);
      if (url.origin !== base.origin) continue;
      if (!url.pathname.startsWith(base.pathname)) {
        problems.push(`${href}: same-origin link outside the Pages base ${base.pathname}`);
        continue;
      }
      const fragment = decodeURIComponent(url.hash.slice(1));
      url.hash = '';
      const status = await statusOf(request, url.href);
      if (status !== 200) {
        problems.push(`${href}: answered ${status}`);
      } else if (fragment !== '' && !(await idsOf(page.context(), url.href)).has(fragment)) {
        problems.push(`${href}: no element with id "${fragment}" on the target page`);
      }
    }
    expect(problems, `dead internal links or anchors on ${route}`).toEqual([]);
  });
}
