<script setup lang="ts">
// biome-ignore-start lint/correctness/noUnusedImports: Biome does not read the template, where these bindings are used
// biome-ignore-start lint/correctness/noUnusedVariables: Biome does not read the template, where these bindings are used
// biome-ignore-start lint/correctness/useHookAtTopLevel: <script setup> runs inside setup(); the rule models React hooks
import { useData } from 'vitepress';
import { VPHomeContent, VPHomeFeatures, VPHomeHero } from 'vitepress/theme-without-fonts';
import { data } from '../data/records.data';
import InstallBlock from './InstallBlock.vue';
import PaletteDemo from './PaletteDemo.vue';
import { HERO_SSR_LINKS } from './palette/hero-items';

// The registered `home` layout (design-final.md 3.1, J5). index.md keeps `layout: home`, and the theme registers this
// component with app.component('home', HomeLayout), so VPContent renders it instead of VPHome and the page gets a real
// <main>. It rebuilds VPHome's template from the exported VPHomeHero, VPHomeFeatures and VPHomeContent.
//
// Keep it in step with VitePress: on every VitePress bump diff
// node_modules/vitepress/dist/client/theme-default/components/VPHome.vue (template, slot forwarding and the scoped
// style restated below) against this file.
//
// Two couplings to honour:
// - VPHero shows its image column only when `image || heroImageSlotExists` (VPHero.vue), and that flag comes from the
//   default Layout's slots (Layout.vue of the default theme). THEME/Layout.vue (item 8) therefore passes an empty
//   #home-hero-image slot to DefaultTheme.Layout; without it the palette below would not be rendered.
// - VPHomeContent relies on `.VPHome` clipping horizontal overflow (VPHomeContent.vue), so the class name stays.
//
// The eyebrow is inline here: the version comes from the records loader, which reads packages/modern-cmdk/package.json.

const { frontmatter, theme } = useData();

const releaseUrl = `https://github.com/ABCrimson/modern-cmdk/releases/tag/modern-cmdk@${data.version}`;
// biome-ignore-end lint/correctness/useHookAtTopLevel: end of the script
// biome-ignore-end lint/correctness/noUnusedVariables: end of the script
// biome-ignore-end lint/correctness/noUnusedImports: end of the script
</script>

<template>
  <main class="VPHome" :class="{ 'external-link-icon-enabled': theme.externalLinkIcon }" data-mc="home">
    <VPHomeHero>
      <template #home-hero-info-before>
        <p class="eyebrow"><a :href="releaseUrl">v{{ data.version }}</a> &middot; MIT &middot; TypeScript</p>
      </template>
      <template #home-hero-actions-after><InstallBlock /></template>
      <template #home-hero-image>
        <div class="palette-wrap">
          <PaletteDemo mode="hero" label="Try the palette" :ssr-links="HERO_SSR_LINKS" />
          <p class="palette-caption">A live modern-cmdk core, driven from Vue. There is no React on this page.</p>
        </div>
      </template>
    </VPHomeHero>
    <VPHomeFeatures />
    <VPHomeContent v-if="frontmatter.markdownStyles !== false"><Content /></VPHomeContent>
    <Content v-else />
  </main>
</template>

<style scoped>
/* Restated from VPHome.vue: its scoped style no longer reaches this root */
.VPHome {
  overflow-x: clip;
  margin-bottom: 6rem;
}

@media (min-width: 48rem) {
  .VPHome {
    margin-bottom: 8rem;
  }
}

/* Sections are 64 px apart, 96 px from 768 px */
.VPHome > :is(.VPHomeFeatures, .VPHomeContent) {
  margin-block-start: var(--mc-space-8);
}

@media (min-width: 48rem) {
  .VPHome > :is(.VPHomeFeatures, .VPHomeContent) {
    margin-block-start: var(--mc-space-9);
  }
}

/* The caption sits under the panel, at the panel's width; the wrapper keeps the column a single flex item */
.palette-wrap {
  inline-size: 100%;
}

.palette-caption {
  margin: var(--mc-space-3) 0 0;
  color: var(--mc-text-2);
  font-size: var(--mc-step--1);
  line-height: var(--mc-step--1-lh);
}

/* Eyebrow chip: Geist Mono, text-2 on a brand-soft pill */
.eyebrow {
  display: inline-block;
  margin: 0 0 var(--mc-space-4);
  padding: var(--mc-space-1) var(--mc-space-3);
  border-radius: var(--mc-radius-pill);
  background-color: var(--mc-brand-soft);
  color: var(--mc-text-2);
  font-family: var(--vp-font-family-mono);
  font-size: var(--mc-step--2);
  font-weight: 500;
  letter-spacing: 0.02em;
  line-height: var(--mc-step--2-lh);
}

.eyebrow a {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.eyebrow a:hover {
  color: var(--mc-text-1);
}

/*
 * The hero's image column is sized for a picture: a fixed 20 or 24.5 rem box, shifted up and left on wide screens, and
 * ordered above the text on narrow ones. The palette is a panel of its own height, so the column flows under the text
 * below 960 px, fills its width, and sits beside the text with a gap from 960 px.
 */
.VPHome :deep(.VPHero .image) {
  order: 2;
  /* VPHero centres the whole container below 960 px; the palette rows read start-aligned */
  text-align: start;
  margin: var(--mc-space-6) 0 0;
}

.VPHome :deep(.VPHero .image-container) {
  width: 100%;
  height: auto;
  max-width: 36rem;
}

@media (min-width: 60rem) {
  .VPHome :deep(.VPHero .container) {
    gap: var(--mc-space-7);
  }

  .VPHome :deep(.VPHero .image) {
    margin: 0;
  }

  .VPHome :deep(.VPHero .image-container) {
    max-width: none;
    transform: none;
  }
}

/* Feature cards: radius lg, an icon tile of 40 px with a 24 px brand-1 glyph on brand-soft */
.VPHome :deep(.VPFeature) {
  border-color: var(--mc-divider);
  border-radius: var(--mc-radius-lg);
}

.VPHome :deep(.VPFeature .icon) {
/* The reveal is on each card, not on the whole features section (motion.css .mc-reveal): a section taller than the phone viewport
   was still translucent with its first card fully on screen. Same animation and range. */
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .VPHome :deep(.VPFeatures .item) {
      animation: mc-reveal linear both;
      animation-timeline: view();
      animation-range: entry 0% entry 100%;
    }
  }
}

  inline-size: 2.5rem;
  block-size: 2.5rem;
  border-radius: var(--mc-radius-sm);
  background-color: var(--mc-brand-soft);
  color: var(--mc-brand-1);
}

.VPHome :deep(.VPFeature .icon svg) {
  inline-size: 1.5rem;
  block-size: 1.5rem;
}

.VPHome :deep(.VPFeature .details code) {
  color: var(--mc-code-ink);
  font-size: 0.9em;
}

@supports (corner-shape: squircle) {
  .VPHome :deep(.VPFeature),
  .VPHome :deep(.VPFeature .icon) {
    /* biome-ignore lint/correctness/noUnknownProperty: valid CSS (corner-shape), Chrome and Edge 139; https://developer.mozilla.org/en-US/docs/Web/CSS/corner-shape, read 2026-11-07 */
    corner-shape: squircle;
  }
}
</style>
