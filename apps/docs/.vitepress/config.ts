// import { transformerTwoslash } from '@shikijs/twoslash';
// Twoslash is not enabled. twoslash 0.3.9, the newest release, declares peer typescript
// ^5.5.0 || ^6.0.0 and drives the TypeScript 6 compiler API. The docs app pins typescript 6.0.3
// (apps/docs/package.json, for vue-tsc), which has that API and which @shikijs/twoslash 4.6.0
// resolves here, so turning twoslash on is now possible. The root typescript 7.1 does not have
// it: its package exports (node_modules/typescript/package.json) are "." = ./lib/version.cjs, ./package.json, the tsconfig and jsconfig schemas,
// and the new API entry points sync and async (each with /transport), ast (/is, /factory, /utils, /scanner, /visitor, /clone), fs, path, proto, wasm and vscode.
import { fileURLToPath } from 'node:url';
import { createCssVariablesTheme } from 'shiki/core';
import {
  defineConfig,
  type HeadConfig,
  type MarkdownRenderer,
  type TransformContext,
} from 'vitepress';
import pkg from '../../../packages/modern-cmdk/package.json' with { type: 'json' };

type FenceRule = NonNullable<MarkdownRenderer['renderer']['rules']['fence']>;

// The site is a GitHub Pages project site. VitePress prefixes base onto its own asset and page URLs
// but not onto `head` entries, so the favicon href below is built from these constants.
const origin = 'https://abcrimson.github.io';
const base = '/modern-cmdk/';
const siteUrl = `${origin}${base}`;
const ogImage = `${siteUrl}og-image.png`;
const description =
  'Headless command palette engine: a framework-agnostic TypeScript core with fuzzy search, frecency ranking and keyboard shortcuts, plus a React 19 adapter.';
const ogImageAlt =
  'modern-cmdk: one headless engine, any framework. A command palette filtering for ‘frec’.';
const version: string = pkg.version;
const repoUrl = 'https://github.com/ABCrimson/modern-cmdk';

// The docs build compiles the core from source (the docs CI job installs and runs `pnpm docs:build`
// without building packages), so the bare specifier `modern-cmdk` resolves to the core entry.
const coreEntry = fileURLToPath(
  new URL('../../../packages/modern-cmdk/src/core/index.ts', import.meta.url),
);

// The latin, normal-style, variable-weight files of the two Fontsource packages are the only font
// files preloaded (design spec section 2.2).
const fontPreload = /(instrument-sans|geist-mono)-latin-wght-normal\.[\w-]+\.woff2$/;

// Shiki CSS-variables theme (createCssVariablesTheme, @shikijs/core/dist/index.d.mts:118-149):
// `name` is the theme's unique name (l.124), `variablePrefix` the CSS variable prefix (l.130, default
// '--shiki-'), `variableDefaults` fallbacks (l.136, unused: theme/styles/tokens.css declares every
// variable), `fontStyle` whether italic and bold are emitted (l.142). VitePress takes a theme that is
// not a {light, dark} pair as it is (ThemeOptions, vitepress/dist/node/index.d.ts:963-966).
const codeTheme = createCssVariablesTheme({
  name: 'modern-cmdk',
  variablePrefix: '--shiki-',
  fontStyle: true,
});

// The five pages NotFound.vue server-renders (SSR_LINKS there) and the 404 <noscript> fallback repeats.
const notFoundLinks: readonly (readonly [text: string, path: string])[] = [
  ['Getting started', 'guide/getting-started'],
  ['Installation', 'guide/installation'],
  ['Core API', 'api/command'],
  ['Examples', 'examples/basic'],
  ['Migrate from cmdk', 'guide/migration-from-cmdk'],
];

// A Mermaid fence renders client-side in <MermaidDiagram> (theme/components/MermaidDiagram.vue);
// the diagram source travels as an escaped attribute so Vue never parses it as template syntax.
const escapeAttribute = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;');

export default defineConfig({
  title: 'modern-cmdk',
  description,
  base,

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` }],
    ['link', { rel: 'apple-touch-icon', href: `${base}apple-touch-icon.png` }],
    // VitePress keys a meta tag by its first attribute other than `content` and keeps one tag per
    // key (mergeHead in vitepress/dist/node), so `media` comes first: with `name` first the dark
    // tag would replace the light one.
    ['meta', { media: '(prefers-color-scheme: light)', name: 'theme-color', content: '#fcfcfe' }],
    ['meta', { media: '(prefers-color-scheme: dark)', name: 'theme-color', content: '#0a0e27' }],
    ['meta', { property: 'og:image', content: ogImage }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { property: 'og:image:alt', content: ogImageAlt }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'modern-cmdk' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: ogImage }],
  ],

  // Per-page tags. The hook receives a TransformContext (vitepress/dist/node/index.d.ts:1283-1319):
  // `page` (l.1287) is the source file relative to the source root ('index.md', 'guide/frecency.md',
  // '404.md'), `title` (l.1303) the full title with the site suffix, `description` (l.1307) the
  // page's or the site's, `assets` (l.1319) every non-CSS build asset as a base-prefixed URL. It
  // returns head entries (l.1548), which the build merges over the static ones, one tag per key.
  transformHead({
    page,
    title,
    description: pageDescription,
    assets,
  }: TransformContext): HeadConfig[] {
    const isNotFound = page === '404.md';
    const socialTitle = isNotFound ? 'Page not found · modern-cmdk' : title;
    const head: HeadConfig[] = [
      ['meta', { property: 'og:title', content: socialTitle }],
      ['meta', { property: 'og:description', content: pageDescription }],
      ['meta', { name: 'twitter:title', content: socialTitle }],
      ['meta', { name: 'twitter:description', content: pageDescription }],
    ];
    if (isNotFound) {
      // A noindex page declares neither a canonical URL nor an og:url.
      head.push(['meta', { name: 'robots', content: 'noindex' }]);
    } else {
      // 'index.md' and '<dir>/index.md' map to the directory URL, any other page to its .html file:
      // the sitemap's mapping (vitepress/dist/node/chunk-BjrVv9r8.js:24317; cleanUrls is unset).
      const url = `${siteUrl}${page.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '.html')}`;
      head.push(
        ['meta', { property: 'og:url', content: url }],
        ['link', { rel: 'canonical', href: url }],
      );
    }
    for (const asset of assets) {
      if (fontPreload.test(asset)) {
        head.push([
          'link',
          { rel: 'preload', as: 'font', type: 'font/woff2', href: asset, crossorigin: '' },
        ]);
      }
    }
    return head;
  },

  // 404.md is the one page VitePress never server-renders: the HTML template writes `page === "404.md" ? "" : content`
  // into #app (vitepress/dist/node/chunk-BjrVv9r8.js:24399), so without JavaScript a visitor sees nothing. This hook
  // is a no-JS fallback for that missing content, not the DOM patch the spec's J5 rejected (J5 was about patching the
  // home page's own markup after render): it appends a <noscript> block after #app, which a browser with JavaScript
  // never renders. Its links are the five NotFound.vue server-renders plus the home page (the page has no navigation bar without JavaScript, so its sentence points at the list, not at a bar); hrefs are built from base and end in .html
  // (cleanUrls is unset). Signature: vitepress/dist/node/index.d.ts:1553.
  transformHtml(code: string, _id: string, { page }: TransformContext): string | undefined {
    if (page !== '404.md') return undefined;
    const links = notFoundLinks
      .map(([text, path]) => `<li><a href="${base}${path}.html">${text}</a></li>`)
      .join('');
    const fallback = `<noscript><main class="vp-doc" data-mc="not-found"><h1>No page at this address</h1><p>Nothing lives here. The closest pages are listed below, and the home page links to everything else.</p><ul>${links}<li><a href="${base}">Home page</a></li></ul></main></noscript>`;
    return code.replace(/<div id="app">[\s\S]*?<\/div>/, (app) => `${app}${fallback}`);
  },

  vite: {
    resolve: {
      alias: [{ find: /^modern-cmdk$/, replacement: coreEntry }],
    },
  },

  markdown: {
    theme: codeTheme,
    // Sentence-case titles (design spec 4.5); the keys are ContainerOptions (vitepress/types/shared.d.ts:412-460).
    // The labels also title the GitHub-style alerts.
    container: {
      tipLabel: 'Tip',
      noteLabel: 'Note',
      infoLabel: 'Info',
      warningLabel: 'Warning',
      dangerLabel: 'Danger',
      importantLabel: 'Important',
      cautionLabel: 'Caution',
      detailsLabel: 'Details',
    },
    config(md: MarkdownRenderer): void {
      const fence = md.renderer.rules.fence;
      const render: FenceRule = (...args: Parameters<FenceRule>): ReturnType<FenceRule> => {
        const [tokens, idx, options, , self] = args;
        const token = tokens[idx];
        if (token?.info.trim().split(/\s+/)[0] === 'mermaid') {
          return `<MermaidDiagram code="${escapeAttribute(token.content)}" />\n`;
        }
        return fence ? fence(...args) : self.renderToken(tokens, idx, options);
      };
      md.renderer.rules.fence = render;
    },
  },

  sitemap: { hostname: siteUrl },

  themeConfig: {
    logo: '/favicon.svg',
    search: { provider: 'local' },
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/api/command' },
      { text: 'Examples', link: '/examples/basic' },
      { text: 'Recipes', link: '/recipes/file-picker' },
      {
        text: 'More',
        items: [
          { text: 'Architecture', link: '/architecture/overview' },
          { text: 'Benchmarks', link: '/benchmarks' },
        ],
      },
      {
        text: `v${version}`,
        items: [
          { text: 'Release notes', link: `${repoUrl}/releases/tag/modern-cmdk@${version}` },
          { text: 'Changelog', link: `${repoUrl}/blob/main/packages/modern-cmdk/CHANGELOG.md` },
          { text: 'npm', link: 'https://www.npmjs.com/package/modern-cmdk' },
        ],
      },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Basic Usage', link: '/guide/basic-usage' },
          ],
        },
        {
          text: 'Advanced',
          items: [
            { text: 'Async Items', link: '/guide/async-items' },
            { text: 'Virtualization', link: '/guide/virtualization' },
            { text: 'WASM Search', link: '/guide/wasm-search' },
            { text: 'Frecency', link: '/guide/frecency' },
            { text: 'Keyboard Shortcuts', link: '/guide/shortcuts' },
            { text: 'Theming', link: '/guide/theming' },
            { text: 'Accessibility', link: '/guide/accessibility' },
            { text: 'SSR / Next.js', link: '/guide/ssr' },
            { text: 'Controlled Dialog', link: '/guide/controlled-dialog' },
            { text: 'TypeScript Integration', link: '/guide/typescript-integration' },
          ],
        },
        {
          text: 'Architecture',
          items: [
            { text: 'Overview', link: '/architecture/overview' },
            { text: 'Internals', link: '/guide/architecture' },
          ],
        },
        {
          text: 'Migration',
          items: [{ text: 'From cmdk', link: '/guide/migration-from-cmdk' }],
        },
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Core Engine', link: '/api/command' },
            { text: 'React Adapter', link: '/api/command-react' },
            { text: 'WASM Search', link: '/api/command-search-wasm' },
          ],
        },
      ],
      '/examples/': [
        {
          text: 'Examples',
          items: [
            { text: 'Basic', link: '/examples/basic' },
            { text: 'Dialog Mode', link: '/examples/dialog' },
            { text: 'Async Search', link: '/examples/async-search' },
            { text: 'Virtualized List', link: '/examples/virtualized' },
            { text: 'Frecency Ranking', link: '/examples/frecency' },
            { text: 'Keyboard Shortcuts', link: '/examples/shortcuts' },
            { text: 'Custom Theme', link: '/examples/theming' },
            { text: 'Vanilla JS', link: '/examples/vanilla' },
          ],
        },
      ],
      '/recipes/': [
        {
          text: 'Recipes',
          items: [
            { text: 'File Picker', link: '/recipes/file-picker' },
            { text: 'Emoji Picker', link: '/recipes/emoji-picker' },
            { text: 'AI Chat Commands', link: '/recipes/ai-chat-commands' },
            { text: 'Nested Commands', link: '/recipes/nested-commands' },
            { text: 'Spotlight Search', link: '/recipes/spotlight-search' },
          ],
        },
      ],
      '/architecture/': [
        {
          text: 'Architecture',
          items: [{ text: 'Overview', link: '/architecture/overview' }],
        },
      ],
      '/benchmarks': [
        {
          text: 'Internals',
          items: [
            { text: 'Architecture overview', link: '/architecture/overview' },
            { text: 'Internals', link: '/guide/architecture' },
            { text: 'Benchmarks', link: '/benchmarks' },
          ],
        },
      ],
    },
    socialLinks: [{ icon: 'github', link: repoUrl }],
    // Rendered with v-html on pages without a sidebar. The two local hrefs are built from `base`;
    // fonts-license.txt and licenses/lucide.txt are files in apps/docs/public.
    footer: {
      message: `Released under the <a href="${repoUrl}/blob/main/LICENSE">MIT License</a>. Set in Instrument Sans and Geist Mono (<a href="${base}fonts-license.txt">OFL-1.1</a>); icons from Lucide (<a href="${base}licenses/lucide.txt">ISC</a>).`,
      copyright: `© 2026 Albert Badalov · modern-cmdk v${version}`,
    },
  },
});
