<script setup lang="ts">
// biome-ignore-start lint/correctness/noUnusedImports: Biome does not read the template, where these bindings are used
// biome-ignore-start lint/correctness/noUnusedVariables: Biome does not read the template, where these bindings are used
import { onMounted, onScopeDispose, ref, useId, useTemplateRef } from 'vue';

// The install block of the home hero (design-final.md 3.3, 5). A native fieldset of three radios is the segmented
// control; the visible command is chosen in CSS with :has(), so it switches before the page hydrates. The copy key
// writes the command of the checked manager, shows "Copied" in a bubble for 1.6 s and says it once through a polite
// live region. The three managers are the ones guide/installation.md documents. The commands install the core alone.

const MANAGERS = [
  { id: 'pnpm', command: 'pnpm add modern-cmdk' },
  { id: 'npm', command: 'npm install modern-cmdk' },
  { id: 'yarn', command: 'yarn add modern-cmdk' },
] as const;

type ManagerId = (typeof MANAGERS)[number]['id'];

const BUBBLE_MS = 1600;

// biome-ignore lint/correctness/useHookAtTopLevel: <script setup> runs inside setup(); the rule models React hooks
const group = useId();
// biome-ignore lint/correctness/useHookAtTopLevel: <script setup> runs inside setup(); the rule models React hooks
const fieldset = useTemplateRef<HTMLFieldSetElement>('fieldset');
const manager = ref<ManagerId>('pnpm');
const bubble = ref('');
const announcement = ref('');
let timer: ReturnType<typeof setTimeout> | undefined;

function commandOf(id: ManagerId): string {
  return MANAGERS.find((entry) => entry.id === id)?.command ?? '';
}

function show(message: string): void {
  clearTimeout(timer);
  bubble.value = message;
  // An empty region is set first so a repeated message is announced again
  announcement.value = '';
  queueMicrotask(() => {
    announcement.value = message;
  });
  timer = setTimeout(() => {
    bubble.value = '';
    announcement.value = '';
  }, BUBBLE_MS);
}

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(commandOf(manager.value));
    show('Copied');
  } catch {
    show('Copy failed');
  }
}

// A choice made before hydration is a DOM state Vue does not know; the default carries a static `checked` so hydration
// leaves it alone, and the state is read back here.
onMounted(() => {
  const checked = fieldset.value?.querySelector<HTMLInputElement>('input:checked')?.value;
  if (MANAGERS.some((entry) => entry.id === checked)) manager.value = checked as ManagerId;
});

onScopeDispose(() => clearTimeout(timer));
// biome-ignore-end lint/correctness/noUnusedVariables: end of the script
// biome-ignore-end lint/correctness/noUnusedImports: end of the script
</script>

<template>
  <div class="mc-install" data-mc="install">
    <fieldset ref="fieldset" class="managers">
      <legend class="sr-only">Package manager</legend>
      <label v-for="entry in MANAGERS" :key="entry.id" class="manager">
        <input
          v-if="entry.id === 'pnpm'"
          type="radio"
          :name="`mc-pm-${group}`"
          :value="entry.id"
          checked
          @change="manager = entry.id"
        />
        <input v-else type="radio" :name="`mc-pm-${group}`" :value="entry.id" @change="manager = entry.id" />
        <span>{{ entry.id }}</span>
      </label>
    </fieldset>
    <div class="line">
      <div class="commands">
        <p v-for="entry in MANAGERS" :key="entry.id" class="command" :data-pm="entry.id">
          <span class="prompt" aria-hidden="true">$</span><code>{{ entry.command }}</code>
        </p>
      </div>
      <span class="anchor">
        <button class="copy" type="button" data-mc="install-copy" aria-label="Copy install command" @click="copy">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            <rect x="9" y="9" width="11" height="11" rx="2.5" />
            <path d="M5.5 15H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5h8.5A1.5 1.5 0 0 1 15 5v.5" />
          </svg>
        </button>
        <span v-if="bubble" class="bubble mc-enter" aria-hidden="true">{{ bubble }}</span>
      </span>
    </div>
    <span class="sr-only" role="status" aria-live="polite">{{ announcement }}</span>
  </div>
</template>

<style scoped>
.mc-install {
  box-sizing: border-box;
  max-inline-size: 26rem;
  margin-block-start: var(--mc-space-5);
  padding: var(--mc-space-3);
  border: 1px solid var(--mc-divider);
  border-radius: var(--mc-radius-lg);
  background-color: var(--mc-bg-soft);
  text-align: start;
}

/* The hero text is centred below 960 px, so the block centres with it */
@media (max-width: 59.99rem) {
  .mc-install {
    margin-inline: auto;
  }
}

@supports (corner-shape: squircle) {
  .mc-install {
    /* biome-ignore lint/correctness/noUnknownProperty: valid CSS (corner-shape), Chrome and Edge 139; https://developer.mozilla.org/en-US/docs/Web/CSS/corner-shape, read 2026-11-07 */
    corner-shape: squircle;
  }
}

.sr-only {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  border: 0;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* Segmented control */
.managers {
  position: relative;
  display: inline-flex;
  gap: 2px;
  min-inline-size: 0;
  margin: 0;
  padding: 2px;
  border: 0;
  border-radius: var(--mc-radius-sm);
  background-color: var(--mc-code-bg);
}

.manager {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-block-size: 32px;
  padding-inline: var(--mc-space-3);
  border-radius: calc(var(--mc-radius-sm) - 2px);
  color: var(--mc-text-2);
  font-family: var(--vp-font-family-mono);
  font-size: var(--mc-step--1);
  cursor: pointer;
  transition:
    background-color var(--mc-dur-1) var(--mc-ease-standard),
    color var(--mc-dur-1) var(--mc-ease-standard);
}

.manager:hover {
  color: var(--mc-text-1);
}

/* The native radio stays focusable and in the accessibility tree; only its box is hidden */
.manager input {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: inherit;
}

.manager:has(input:checked) {
  background-color: var(--mc-bg-elv);
  color: var(--mc-text-1);
  box-shadow: 0 0 0 1px var(--mc-divider);
}

.manager:has(input:focus-visible) {
  outline: 2px solid var(--mc-brand-3);
  outline-offset: 2px;
}

/* Command line */
.line {
  display: flex;
  align-items: center;
  gap: var(--mc-space-2);
  margin-block-start: var(--mc-space-3);
}

.commands {
  flex: 1 1 auto;
  min-inline-size: 0;
}

.command {
  display: none;
  gap: var(--mc-space-2);
  margin: 0;
  overflow-x: auto;
  font-family: var(--vp-font-family-mono);
  font-size: var(--mc-step--1);
  line-height: 1.75;
  white-space: nowrap;
}

.mc-install:has(input[value="pnpm"]:checked) .command[data-pm="pnpm"] {
  display: flex;
}

.mc-install:has(input[value="npm"]:checked) .command[data-pm="npm"] {
  display: flex;
}

.mc-install:has(input[value="yarn"]:checked) .command[data-pm="yarn"] {
  display: flex;
}

.prompt {
  color: var(--mc-text-3);
  user-select: none;
}

.command code {
  padding: 0;
  background: none;
  color: var(--mc-text-1);
  font-size: inherit;
}

/* Copy key and the "Copied" bubble. The wrapper hugs the key, so a fallback bubble centred on it needs no anchor. */
.anchor {
  position: relative;
  display: inline-flex;
  flex: none;
}

.copy {
  /* biome-ignore lint/correctness/noUnknownProperty: valid CSS (anchor-name), https://developer.mozilla.org/en-US/docs/Web/CSS/anchor-name, read 2026-11-07 */
  anchor-name: --mc-copy;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 32px;
  block-size: 32px;
  padding: 0;
  border: 1px solid var(--mc-border-strong);
  border-radius: var(--mc-radius-sm);
  background-color: var(--mc-bg-elv);
  color: var(--mc-text-1);
  cursor: pointer;
  transition:
    background-color var(--mc-dur-1) var(--mc-ease-standard),
    border-color var(--mc-dur-1) var(--mc-ease-standard);
}

.copy:hover {
  border-color: var(--mc-brand-1);
  color: var(--mc-brand-1);
}

.copy:focus-visible {
  outline: 2px solid var(--mc-brand-3);
  outline-offset: 2px;
}

.copy svg {
  inline-size: 18px;
  block-size: 18px;
}

.bubble {
  position: absolute;
  inset-block-end: calc(100% + 6px);
  inset-inline-end: 0;
  padding: var(--mc-space-1) var(--mc-space-2);
  border-radius: var(--mc-radius-xs);
  background-color: var(--mc-text-1);
  color: var(--mc-bg);
  font-size: var(--mc-step--2);
  font-weight: 600;
  line-height: 1.4;
  pointer-events: none;
  white-space: nowrap;
}

/* Anchor positioning: Baseline 2026 for the core parts (MDN position-area, read 2026-11-07). The bubble is centred above the key and flips below when there is no room. */
@supports (position-area: block-start) {
  .bubble {
    /* fixed, so the area above the key is measured against the viewport; an absolute box would be confined to the 32 px wrapper */
    position: fixed;
    /* biome-ignore lint/correctness/noUnknownProperty: valid CSS (position-anchor), https://developer.mozilla.org/en-US/docs/Web/CSS/position-anchor, read 2026-11-07 */
    position-anchor: --mc-copy;
    /* biome-ignore lint/correctness/noUnknownProperty: valid CSS (position-area), https://developer.mozilla.org/en-US/docs/Web/CSS/position-area, read 2026-11-07 */
    position-area: block-start;
    /* biome-ignore lint/correctness/noUnknownProperty: valid CSS (position-try-fallbacks), https://developer.mozilla.org/en-US/docs/Web/CSS/position-try-fallbacks, read 2026-11-07 */
    position-try-fallbacks: flip-block;
    inset: auto;
    margin-block: 6px;
  }
}

@media (forced-colors: active) {
  .manager:has(input:checked) {
    outline: 2px solid Highlight;
  }

  .copy {
    border-color: ButtonText;
  }
}
</style>
