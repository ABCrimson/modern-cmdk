<script setup lang="ts">
import { useData } from 'vitepress';
import { onMounted, ref, useId, watch } from 'vue';

// Client-only: mermaid touches the DOM, so it is imported dynamically in onMounted and a page
// without a diagram never downloads it. The markdown fence override in config.ts emits this component.
const props = defineProps<{ code: string }>();

// biome-ignore lint/correctness/useHookAtTopLevel: <script setup> runs inside setup(); the rule models React hooks
const { isDark } = useData();
// biome-ignore lint/correctness/useHookAtTopLevel: <script setup> runs inside setup(); the rule models React hooks
const id = `mermaid-${useId()}`;
const svg = ref('');
const error = ref('');
let mounted = false;

async function render(): Promise<void> {
  const { default: mermaid } = await import('mermaid');
  // securityLevel 'strict' (the default) is kept; the theme follows the VitePress dark-mode class
  mermaid.initialize({ startOnLoad: false, theme: isDark.value ? 'dark' : 'default' });
  try {
    ({ svg: svg.value } = await mermaid.render(id, props.code));
    error.value = '';
  } catch (cause) {
    svg.value = '';
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
}

onMounted(() => {
  mounted = true;
  void render();
});
watch(isDark, () => {
  if (mounted) void render();
});
</script>

<template>
  <div class="mermaid-diagram" :data-error="error || undefined">
    <div v-if="svg" v-html="svg" />
    <pre v-else-if="error" class="mermaid-diagram-error">{{ error }}</pre>
  </div>
</template>

<style scoped>
.mermaid-diagram {
  margin: 16px 0;
  overflow-x: auto;
  text-align: center;
}
.mermaid-diagram-error {
  text-align: left;
  color: var(--vp-c-danger-1);
}
/* mermaid measures labels outside .vp-doc (body line-height 1.5); .vp-doc p sets 1.75 and would clip every label */
.mermaid-diagram :deep(foreignObject p) {
  line-height: 1.5;
}
</style>
