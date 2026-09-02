import { findShadowRootWith, injectStyle } from '../desktop/chrome-injector';

/** Style-element id for the injected section-tab-hiding rule. */
const SECTION_TAB_STYLE_ID = 'umbradesktop-hide-section-tab';

/** How many poll attempts (× {@link POLL_INTERVAL_MS}) before giving up waiting for the shell. */
const MAX_POLL_TRIES = 100;
/** Delay between poll attempts, in milliseconds. */
const POLL_INTERVAL_MS = 100;

/**
 * CSS selector for a backoffice section nav tab, keyed by the section's alias. Matches the
 * `data-mark="section-link:<alias>"` attribute the core section header puts on each `uui-tab`
 * (see `umb-backoffice-header-sections`).
 * @param alias The section alias (e.g. the UmbraDesktop section alias).
 * @returns The CSS selector string for that section's tab.
 */
export function sectionTabSelector(alias: string): string {
  return `uui-tab[data-mark="section-link:${alias}"]`;
}

/**
 * Build the CSS that hides a section's nav tab. Pure — the counterpart of `buildHeaderCss` /
 * `buildSidebarCss` in the chrome injector.
 * @param alias The section alias whose tab should be hidden.
 * @returns A CSS string.
 */
export function buildSectionTabHideCss(alias: string): string {
  return `${sectionTabSelector(alias)} { display: none !important; }`;
}

/**
 * Inject the hide rule into every shadow root that can render the section's tab, and report
 * whether the tab list was found. Idempotent: the `<style>` is keyed, so repeated calls refresh
 * the existing element rather than stacking duplicates.
 *
 * Two roots are needed. The tab itself lives in the shadow root of `umb-backoffice-header-sections`,
 * but `uui-tab-group` collapses tabs that do not fit into a "More" dropdown by *cloning* them
 * (`cloneNode(true)`) into its own shadow root — a tree the tab-list stylesheet cannot reach. The
 * UmbraDesktop section sorts last (lowest weight), so it is the first to overflow, which would
 * make it reappear in that dropdown on a narrow window. Styling the tab-group root too covers
 * every clone it makes now or later, since the stylesheet outlives the clones.
 * @param alias The section alias whose tab should be hidden.
 * @param doc The document to search/inject into. Defaults to the current document.
 * @returns True when the section tab was found and the rule injected.
 */
export function applySectionTabHide(alias: string, doc: Document = document): boolean {
  const selector = sectionTabSelector(alias);
  const root = findShadowRootWith(doc, selector);
  if (!root) return false;
  const css = buildSectionTabHideCss(alias);
  injectStyle(root, doc, SECTION_TAB_STYLE_ID, css);
  const groupRoot = root.querySelector(selector)?.closest('uui-tab-group')?.shadowRoot;
  if (groupRoot) injectStyle(groupRoot, doc, SECTION_TAB_STYLE_ID, css);
  return true;
}

/**
 * Hide the classic-backoffice nav tab for the given section, so the section can act purely as a
 * route (reached via the header-app launcher) without also cluttering the section list. Route
 * access and nav visibility are the same permission bit in core, so this presentational hide is
 * the only lever available — see the header-app launcher design doc (2026-07-23).
 *
 * The section header mounts asynchronously, so we poll (bounded) until the shadow root that owns
 * the tab appears, then inject via {@link applySectionTabHide}. Safe to call when the current user
 * lacks the section: the tab never renders, the selector never matches, and the poll simply times
 * out. Also safe to call again later — {@link applySectionTabHide} is idempotent, and the desktop
 * re-asserts the hide when it unmounts, because the outer header is invisible for as long as the
 * desktop is open and a poll that timed out during boot would otherwise only become visible then.
 * @param alias The section alias whose tab should be hidden.
 * @param doc The document to search/inject into. Defaults to the current document.
 */
export function hideSectionTab(alias: string, doc: Document = document): void {
  if (applySectionTabHide(alias, doc)) return;

  // Shell not up yet — poll until the section header mounts, then stop. A MutationObserver on the
  // light DOM would not see the shell appear inside shadow roots.
  let tries = 0;
  const timer = window.setInterval(() => {
    if (applySectionTabHide(alias, doc) || (tries += 1) > MAX_POLL_TRIES) window.clearInterval(timer);
  }, POLL_INTERVAL_MS);
}
