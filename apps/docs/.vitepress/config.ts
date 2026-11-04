// import { transformerTwoslash } from '@shikijs/twoslash';
// Twoslash stays disabled (checked 2026-11-04): twoslash 0.3.9, the newest release, declares peer
// typescript ^5.5.0 || ^6.0.0 and drives the TypeScript JS compiler API, which the installed
// typescript 7.1 entry point (lib/version.cjs, lib/tsc.js) does not expose. @shikijs/twoslash 4.6.0
// only widens its own peer to typescript >=5.5.0; it still delegates to twoslash.
import { defineConfig, type MarkdownRenderer } from 'vitepress';

type FenceRule = NonNullable<MarkdownRenderer['renderer']['rules']['fence']>;

// The site is a GitHub Pages project site. VitePress prefixes base onto its own asset and page URLs
// but not onto `head` entries, so the favicon href below is built from these constants.
const origin = 'https://abcrimson.github.io';
const base = '/modern-cmdk/';
const siteUrl = `${origin}${base}`;
const ogImage = `${siteUrl}og-image.png`;
const description =
  'Headless command palette engine for React 19. Framework-agnostic core, frecency ranking, full WAI-ARIA.';

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
  description: 'Headless command palette engine for React 19',
  base,

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` }],
    ['meta', { property: 'og:title', content: 'modern-cmdk' }],
    ['meta', { property: 'og:description', content: description }],
    ['meta', { property: 'og:image', content: ogImage }],
    ['meta', { property: 'og:url', content: siteUrl }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'modern-cmdk' }],
    ['meta', { name: 'twitter:description', content: description }],
    ['meta', { name: 'twitter:image', content: ogImage }],
  ],

  markdown: {
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
    search: { provider: 'local' },
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/api/command' },
      { text: 'Examples', link: '/examples/basic' },
      { text: 'Architecture', link: '/architecture/overview' },
      { text: 'Benchmarks', link: '/benchmarks' },
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
    },
    socialLinks: [{ icon: 'github', link: 'https://github.com/ABCrimson/modern-cmdk' }],
  },
});
