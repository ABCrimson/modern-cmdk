<script setup lang="ts">
// biome-ignore-start lint/style/useVueMultiWordComponentNames: the theme contract fixes the file name Layout.vue
// biome-ignore-start lint/correctness/noUnusedImports: Biome does not read the template, where these bindings are used
// biome-ignore-start lint/correctness/useHookAtTopLevel: <script setup> runs inside setup(); the rule models React hooks
import { useData } from 'vitepress';
import DefaultTheme from 'vitepress/theme-without-fonts';
import { provide, type Ref } from 'vue';
import NotFound from './components/NotFound.vue';
import { transitionAppearance } from './view-transitions';

const { isDark } = useData();

// VPSwitchAppearance injects 'toggle-appearance' and calls it with the click event
// (vitepress/dist/client/theme-default/components/VPSwitchAppearance.vue:6,22).
// useData() is typed against the vue 3.5.44 that vitepress resolves, this app against 3.6.0-rc.14 (the pnpm store
// holds both), so the two Ref types are nominally different (RefSymbol); the value is the same boolean ref.
provide('toggle-appearance', (event: MouseEvent) =>
  transitionAppearance(event, isDark as unknown as Ref<boolean>),
);
// biome-ignore-end lint/correctness/noUnusedImports: see the matching biome-ignore-start
// biome-ignore-end lint/correctness/useHookAtTopLevel: see the matching biome-ignore-start
// biome-ignore-end lint/style/useVueMultiWordComponentNames: see the matching biome-ignore-start
</script>

<template>
  <DefaultTheme.Layout>
    <!--
      Empty on purpose: VPHero shows its image column only when `image || heroImageSlotExists`
      (VPHero.vue:28,32,62), and that flag is read from the default Layout's own slots (Layout.vue:21).
      HomeLayout renders the palette itself, so this slot only has to exist.
    -->
    <template #home-hero-image />
    <template #not-found><NotFound /></template>
  </DefaultTheme.Layout>
</template>
