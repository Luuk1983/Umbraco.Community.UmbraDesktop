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
 * Hide the classic-backoffice nav tab for the given section, so the section can act purely as a
 * route (reached via the header-app launcher) without also cluttering the section list. Route
 * access and nav visibility are the same permission bit in core, so this presentational hide is
 * the only lever available — see the header-app launcher design doc (2026-07-23).
 *
 * The section header mounts asynchronously, so we poll (bounded) until the shadow root that owns
 * the tab appears, then inject a keyed `<style>` once. Safe to call when the current user lacks
 * the section: the tab never renders, the selector never matches, and the poll simply times out.
 * @param alias The section alias whose tab should be hidden.
 * @param doc The document to search/inject into. Defaults to the current document.
 */
export function hideSectionTab(alias: string, doc: Document = document): void {
  const selector = sectionTabSelector(alias);

  const apply = (): boolean => {
    const root = findShadowRootWith(doc, selector);
    if (!root) return false;
    injectStyle(root, doc, SECTION_TAB_STYLE_ID, buildSectionTabHideCss(alias));
    return true;
  };

  if (apply()) return;

  // Shell not up yet — poll until the section header mounts, then stop. A MutationObserver on the
  // light DOM would not see the shell appear inside shadow roots.
  let tries = 0;
  const timer = window.setInterval(() => {
    if (apply() || (tries += 1) > MAX_POLL_TRIES) window.clearInterval(timer);
  }, POLL_INTERVAL_MS);
}
