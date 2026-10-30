// import { transformerTwoslash } from '@shikijs/twoslash';
// Disabled: twoslash 0.3.9 (peer typescript ^5.5.0 || ^6.0.0) needs the TypeScript JS compiler API,
// and the installed typescript 7.1 entry point (lib/version.cjs) no longer exposes it
import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'modern-cmdk',
  description: 'Headless command palette engine for React 19',

  head: [
    ['meta', { property: 'og:title', content: 'modern-cmdk' }],
    [
      'meta',
      {
        property: 'og:description',
        content:
          'Headless command palette engine for React 19. Framework-agnostic core, WASM search, frecency ranking, full WAI-ARIA.',
      },
    ],
    ['meta', { property: 'og:image', content: 'https://command.crimson.dev/og-image.png' }],
    ['meta', { property: 'og:url', content: 'https://command.crimson.dev' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'modern-cmdk' }],
    [
      'meta',
      {
        name: 'twitter:description',
        content:
          'Headless command palette engine for React 19. ES2026. GPU-composited. Accessible.',
      },
    ],
    ['meta', { name: 'twitter:image', content: 'https://command.crimson.dev/og-image.png' }],
  ],

  // Twoslash stays disabled until a twoslash release supports TypeScript 7 (see the import note above)
  // markdown: {
  //   codeTransformers: [
  //     transformerTwoslash({ ... }),
  //   ],
  // },

  sitemap: { hostname: 'https://command.crimson.dev' },

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
