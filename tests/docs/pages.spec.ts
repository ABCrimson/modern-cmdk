import { existsSync, globSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { expect, test as it } from '@playwright/test';

// Render pass over every built docs page (ledger G8, DG-17). The pages come from the build output,
// so a new markdown file is covered without touching this spec.
const distDir = resolve(import.meta.dirname, '../../apps/docs/.vitepress/dist');
const docsDir = resolve(import.meta.dirname, '../../apps/docs');
const shotDir = resolve(import.meta.dirname, '../../test-results/docs');

const routes = globSync('**/*.html', { cwd: distDir })
  .map((file) => file.split(sep).join('/'))
  .sort();

it('the docs build output is present', () => {
  expect(
    routes.length,
    `no built pages under ${distDir}: run pnpm docs:build first`,
  ).toBeGreaterThan(0);
});

for (const route of routes) {
  it(`renders ${route}`, async ({ page }) => {
    const brokenAssets: string[] = [];
    const pageErrors: string[] = [];
    page.on('response', (response) => {
      const { pathname } = new URL(response.url());
      // Every asset must live under the Pages base; a bare /assets/ URL is the base-path bug
      if (pathname.startsWith('/assets/') && response.status() === 404) {
        brokenAssets.push(`${response.status()} ${response.url()}`);
      }
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    const response = await page.goto(route === 'index.html' ? '' : route);
    // 404.html is served with its file, other pages must answer 2xx
    expect(response?.ok(), `${route} answered ${response?.status()}`).toBe(true);

    // The default theme stylesheet applied (an unstyled page leaves the nav static)
    const navPosition = await page
      .locator('.VPNav')
      .first()
      .evaluate((el) => getComputedStyle(el).position);
    expect(navPosition).not.toBe('static');

    // No fenced Mermaid source may survive as a code block
    await expect(page.locator('div.language-mermaid, pre code.language-mermaid')).toHaveCount(0);
    // An unregistered <MermaidDiagram> survives as an unknown element and draws nothing
    await expect(page.locator('mermaiddiagram')).toHaveCount(0);
    // One rendered container per ```mermaid fence in the page's source markdown
    const source = join(docsDir, route.replace(/\.html$/, '.md'));
    const fences = existsSync(source)
      ? (readFileSync(source, 'utf8').match(/^```mermaid\b/gm) ?? []).length
      : 0;
    // Every Mermaid container renders an <svg> and none reports a render error
    const diagrams = page.locator('.mermaid-diagram');
    await expect(diagrams).toHaveCount(fences);
    for (const diagram of await diagrams.all()) {
      await expect(diagram.locator('svg')).toHaveCount(1);
      await expect(diagram).not.toHaveAttribute('data-error', /.+/);
      // mermaid sizes each label box outside .vp-doc; a taller computed line-height clips the last line
      const clipped = await diagram
        .locator('foreignObject')
        .evaluateAll((nodes) =>
          nodes
            .filter(
              (fo) =>
                (fo.firstElementChild?.scrollHeight ?? 0) > Number(fo.getAttribute('height')) + 1,
            )
            .map((fo) => fo.textContent ?? ''),
        );
      expect(clipped, 'Mermaid labels overflow their boxes').toEqual([]);
    }

    await page.waitForLoadState('networkidle');
    expect(brokenAssets, 'asset requests outside the base returned 404').toEqual([]);
    expect(pageErrors, 'uncaught page errors').toEqual([]);

    const shot = join(shotDir, route.replace(/\.html$/, '.png'));
    mkdirSync(dirname(shot), { recursive: true });
    await page.screenshot({ path: shot, fullPage: true });
  });
}
