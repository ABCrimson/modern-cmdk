// View transitions of the docs site (design-final.md section 5, contract C3).
//
// Two callers: installRouteTransitions() is called from enhanceApp({ router }) in index.ts, and
// transitionAppearance() from the 'toggle-appearance' provider in Layout.vue. The styling is styles/motion.css,
// keyed on the data-mc-transition attribute this file sets on <html> for the lifetime of a transition.
//
// The module has no top-level document or window access beyond one guarded popstate listener, and the router hooks also run during SSR
// (vitepress/dist/client/app/ssr.js:5 calls createApp(), which runs enhanceApp({ router }), and :6 calls router.go(path)),
// where they touch neither window, document nor location; only the browser-only paths (canTransition() true, the toggle) reach the DOM.

import type { Router } from 'vitepress';
import type { Ref } from 'vue';
import { nextTick } from 'vue';

/** A transition that has not started animating within this many milliseconds is released so navigation never stalls. */
const TIMEOUT_MS = 600;

const FAKE_HOST = 'http://a.com';

const ATTRIBUTE = 'data-mc-transition';

type Kind = 'route' | 'appearance';

/**
 * True when a view transition may run now: the API exists, the user has no reduced-motion preference and the
 * document is visible (a hidden document skips the transition and would only delay the update).
 */
export function canTransition(): boolean {
  return (
    typeof document !== 'undefined' &&
    'startViewTransition' in document &&
    window.matchMedia('(prefers-reduced-motion: no-preference)').matches &&
    document.visibilityState === 'visible'
  );
}

/** The transition in flight, if any, so a navigation that starts mid-flight can skip it. */
let active: ViewTransition | undefined;

/** Marks <html> for motion.css while `transition` runs, and clears the mark when it ends (unless a newer one took over). */
function track(transition: ViewTransition, kind: Kind): void {
  active = transition;
  document.documentElement.setAttribute(ATTRIBUTE, kind);
  const release = (): void => {
    if (active !== transition) return;
    active = undefined;
    document.documentElement.removeAttribute(ATTRIBUTE);
  };
  // finished settles when the animations end or the transition is skipped; ready may reject on a skip, which is expected.
  transition.finished.then(release, release);
  transition.ready.catch(() => {});
}

/**
 * The pathname of an href the router passes to its hooks. The router hands over normalised path-absolute hrefs (router.js:180),
 * so a fixed fake host resolves them without location, which does not exist during SSR (the router does the same, router.js:7,20,36).
 */
function pathnameOf(href: string): string {
  return new URL(href, FAKE_HOST).pathname;
}

// History traversals (back, forward) get a hard cut. VitePress drops a page load that a later one overtakes
// (router.js:42, latestPendingPath), and holding the popstate load open inside a transition widens that race: rapid
// back, back, forward then ends at the wrong scroll position. navigation.activation.navigationType is no substitute: it
// stays constant during same-document navigations (https://developer.mozilla.org/en-US/docs/Web/API/Navigation/activation,
// read 2026-11-07). Popstate is counted by a listener registered when this module is evaluated, which is when the theme
// entry is imported, before createApp() creates the router and registers its own popstate listener (router.js:104):
// listeners on the window run in registration order, so a listener added in enhanceApp would run after VitePress's. It
// applies VitePress's own test, a null state is ignored (:105). Each counted popstate is consumed by the page load it
// starts, because router.js calls onBeforePageLoad synchronously from that listener. The typeof guard keeps SSR clean.
let pendingTraversals = 0;
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', (event) => {
    if (event.state !== null) pendingTraversals++;
  });
}

/**
 * Wraps the router's page swap in a view transition, chaining any hook that is already installed.
 *
 * Router facts, all in apps/docs/node_modules/vitepress/dist/client/app/router.js:
 * - onAfterPageLoad is awaited immediately before route.component is replaced (:45-47), so holding it open until the
 *   browser has captured the old page lets the swap happen inside the transition callback.
 * - onAfterRouteChange runs after both go() (:30) and popstate (:109), once the new component has been set.
 * - onBeforePageLoad runs at the start of every page load, from go() and from popstate alike (:35, reached from go() at :27 and from popstate at :107), so it is
 *   the one place that sees every navigation start.
 * - go() updates the history before it loads the page (changeRoute, :183-196), so location.pathname is already the new
 *   path inside the hooks; the previous path is therefore remembered here.
 */
export function installRouteTransitions(router: Router): void {
  const previous = {
    onBeforePageLoad: router.onBeforePageLoad,
    onAfterPageLoad: router.onAfterPageLoad,
    onAfterRouteChange: router.onAfterRouteChange,
  };

  // Path of the page on screen; undefined until the first page load finishes, which is never animated.
  let currentPath: string | undefined;
  // Resolvers of the transition in flight: `captured` opens when the browser has the old page, `swapped` when the new one is in.
  let swapped: PromiseWithResolvers<void> | undefined;
  let captured: PromiseWithResolvers<void> | undefined;
  // The path the transition in flight is swapping to; onAfterRouteChange releases `swapped` only for that path.
  let swappedPath: string | undefined;

  let traversing = false;

  const settle = (): void => {
    captured?.resolve();
    swapped?.resolve();
    captured = undefined;
    swapped = undefined;
    swappedPath = undefined;
  };

  router.onBeforePageLoad = async (to: string): Promise<boolean | undefined> => {
    traversing = pendingTraversals > 0;
    if (traversing) pendingTraversals--;
    if ((await previous.onBeforePageLoad?.(to)) === false) return false;
    // A navigation that starts mid-flight ends the running transition; its pending promises are released with it.
    if (active) {
      active.skipTransition();
      settle();
    }
    return undefined;
  };

  router.onAfterPageLoad = async (to: string): Promise<void> => {
    await previous.onAfterPageLoad?.(to);
    const nextPath = pathnameOf(to);
    const from = currentPath;
    currentPath = nextPath;
    // Guards: not the initial load, the pathname differs (hash-only moves skip), and the browser allows it now.
    if (from === undefined || from === nextPath || traversing || !canTransition()) return;

    const pairCaptured = Promise.withResolvers<void>();
    const pairSwapped = Promise.withResolvers<void>();
    captured = pairCaptured;
    swapped = pairSwapped;
    swappedPath = nextPath;

    // The timeout releases both pairs of this navigation if the browser or the router stalls.
    const timer = setTimeout(() => {
      pairCaptured.resolve();
      pairSwapped.resolve();
    }, TIMEOUT_MS);
    const transition = document.startViewTransition(async () => {
      pairCaptured.resolve();
      await pairSwapped.promise;
    });
    track(transition, 'route');
    transition.finished.then(
      () => clearTimeout(timer),
      () => clearTimeout(timer),
    );

    // The router replaces route.component as soon as this hook returns, which is inside the callback above.
    await pairCaptured.promise;
  };

  router.onAfterRouteChange = async (to: string): Promise<void> => {
    await previous.onAfterRouteChange?.(to);
    // A go() whose page load was overtaken by a later one still calls this hook (router.js:30), and route.path is then
    // still the page on screen: only the navigation that owns `swapped` may release it. route.path has the form of
    // pathnameOf (router.js:37 and :46 use new URL(href, fakeHost).pathname).
    currentPath = router.route.path;
    if (swapped === undefined || router.route.path !== swappedPath) return;
    // The new component is set; let Vue render it, then tell the browser to capture the new state.
    await nextTick();
    swapped?.resolve();
    swapped = undefined;
    captured = undefined;
    swappedPath = undefined;
  };
}

/**
 * The toggle of the default theme's appearance switch, with a circular reveal from the click point.
 *
 * VPSwitchAppearance injects 'toggle-appearance' and calls it with the click event
 * (vitepress/dist/client/theme-default/components/VPSwitchAppearance.vue:6 and :22). This is the "On Appearance Toggle"
 * recipe of vitepress.dev (https://vitepress.dev/guide/extending-default-theme#on-appearance-toggle, read 2026-11-07):
 * the click point and the radius that covers the viewport go to custom properties on <html>, which motion.css turns
 * into the clip-path animation. Without the API, with reduced motion or in a hidden document it flips `isDark` at once.
 */
export async function transitionAppearance(event: MouseEvent, isDark: Ref<boolean>): Promise<void> {
  if (!canTransition()) {
    isDark.value = !isDark.value;
    return;
  }
  // A running route transition would be replaced by this one; end it first so the attribute belongs to one kind only.
  active?.skipTransition();

  const { clientX: x, clientY: y } = event;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const style = document.documentElement.style;
  style.setProperty('--mc-switch-x', `${(x / innerWidth) * 100}%`);
  style.setProperty('--mc-switch-y', `${(y / innerHeight) * 100}%`);
  style.setProperty('--mc-switch-r', `${radius}px`);

  const transition = document.startViewTransition(async () => {
    isDark.value = !isDark.value;
    await nextTick();
  });
  track(transition, 'appearance');
  await transition.finished.catch(() => {});
}
