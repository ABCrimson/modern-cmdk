import type { EnhanceAppContext, Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import MermaidDiagram from './components/MermaidDiagram.vue';
import './styles/vars.css';
import './styles/custom.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }: EnhanceAppContext): void {
    app.component('MermaidDiagram', MermaidDiagram);
  },
} satisfies Theme;
