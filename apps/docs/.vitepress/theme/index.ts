import type { EnhanceAppContext, Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme-without-fonts';
import '@fontsource-variable/instrument-sans/wght.css';
import '@fontsource-variable/geist-mono/wght.css';
import './styles/tokens.css';
import './styles/fonts.css';
import './styles/doc.css';
import './styles/chrome.css';
import './styles/motion.css';
import './styles/a11y.css';
import HomeLayout from './components/HomeLayout.vue';
import MermaidDiagram from './components/MermaidDiagram.vue';
import Layout from './Layout.vue';
import { installRouteTransitions } from './view-transitions';

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app, router }: EnhanceAppContext): void {
    // A registered `home` component replaces VitePress's VPHome (VPContent.vue skips it when
    // isRegistered('home')), so the home page gets a real <main>
    app.component('home', HomeLayout);
    app.component('MermaidDiagram', MermaidDiagram);
    installRouteTransitions(router);
  },
} satisfies Theme;
