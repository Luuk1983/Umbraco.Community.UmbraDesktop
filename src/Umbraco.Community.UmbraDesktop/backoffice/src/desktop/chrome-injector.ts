import type { UmbraDesktopChromeProfile } from './types';

/** Style-element id for the injected header-stripping rules. */
const HEADER_STYLE_ID = 'umbradesktop-injected-chrome';
/** Style-element id for the injected sidebar-stripping rules. */
const SIDEBAR_STYLE_ID = 'umbradesktop-injected-sidebar';

/**
 * CSS injected into the shell's header shadow root: hide the top backoffice header and
 * let the main area take the full height. Applied for every chrome profile.
 * @returns A CSS string.
 */
export function buildHeaderCss(): string {
  return `
    umb-backoffice-header { display: none !important; }
    umb-backoffice-main { height: 100% !important; }
  `;
}

/**
 * CSS injected into the section's shadow root to strip the section sidebar (menu/tree) and
 * let the workspace fill the full width — used by the workspace-only / bare profiles. The
 * split panel reserves the sidebar's grid column via an inline style we cannot override, so
 * instead of relying on the sidebar collapsing we lift `umb-section-main` out of the grid to
 * cover the whole section body, above the split-panel divider (z-index 999999). See design §4.1.
 * @returns A CSS string.
 */
export function buildSidebarCss(): string {
  return `
    umb-section-sidebar { display: none !important; }
    umb-section-main {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      z-index: 1000000 !important;
    }
  `;
}

/**
 * Breadth-first walk across nested shadow roots, returning the first shadow root whose own
 * tree contains `selector`. Uses a duck-typed `.host` check rather than `instanceof ShadowRoot`
 * so it works across realms (an iframe's shadow roots are not instances of the parent window's
 * `ShadowRoot`).
 * @param from The document or shadow root to search from.
 * @param selector A CSS selector for an element the returned root directly contains.
 * @returns The owning shadow root, or null if not present yet.
 */
export function findShadowRootWith(
  from: Document | ShadowRoot,
  selector: string,
): ShadowRoot | null {
  const queue: Array<Document | ShadowRoot> = [from];
  while (queue.length) {
    const node = queue.shift()!;
    if ((node as ShadowRoot).host && node.querySelector(selector)) {
      return node as ShadowRoot;
    }
    node.querySelectorAll('*').forEach((el) => {
      const shadow = (el as HTMLElement).shadowRoot;
      if (shadow) queue.push(shadow);
    });
  }
  return null;
}

/**
 * Find the shadow root that directly owns `<umb-backoffice-header>`.
 * @param from The document or shadow root to search from.
 * @returns The owning shadow root, or null if the shell is not present yet.
 */
export function findChromeRoot(from: Document | ShadowRoot): ShadowRoot | null {
  return findShadowRootWith(from, 'umb-backoffice-header');
}

/**
 * Inject (or refresh) a keyed `<style>` into a shadow root.
 * @param root The shadow root to inject into.
 * @param doc The owning document (for creating the element).
 * @param id The style element's id.
 * @param css The CSS to set.
 */
export function injectStyle(root: ShadowRoot, doc: Document, id: string, css: string): void {
  let style = root.getElementById(id) as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement('style');
    style.id = id;
    root.appendChild(style);
  }
  style.textContent = css;
}

/**
 * Inject the chrome-stripping stylesheets into a same-origin iframe: always hide the top
 * header; for non-`full-section` profiles also strip the section sidebar and expand the main
 * area. The backoffice boots asynchronously and the header/section shells mount independently,
 * so we poll until each target root appears. No-op if the iframe document is unreachable.
 * @param iframe The window's iframe.
 * @param profile The chrome profile to apply.
 * @param onApplied Called once, when the header has been stripped (lets the window reveal its
 *   content only after the booting backoffice's own header is gone).
 */
export function injectChromeStyles(
  iframe: HTMLIFrameElement,
  profile: UmbraDesktopChromeProfile,
  onApplied?: () => void,
): void {
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) return;

  const stripSidebar = profile !== 'full-section';
  let headerApplied = false;
  let sidebarApplied = false;

  const tick = (): boolean => {
    if (!headerApplied) {
      const headerRoot = findChromeRoot(doc);
      if (headerRoot) {
        injectStyle(headerRoot, doc, HEADER_STYLE_ID, buildHeaderCss());
        headerApplied = true;
        onApplied?.();
      }
    }
    if (stripSidebar && !sidebarApplied) {
      // The sidebar + main live in umb-section-default's (deeper) shadow root; target it via
      // umb-section-main, which is always present once the section shell has mounted.
      const sectionRoot = findShadowRootWith(doc, 'umb-section-main');
      if (sectionRoot) {
        injectStyle(sectionRoot, doc, SIDEBAR_STYLE_ID, buildSidebarCss());
        sidebarApplied = true;
      }
    }
    return headerApplied && (!stripSidebar || sidebarApplied);
  };

  if (tick()) return;

  // Shell not fully up yet — poll until it mounts (max ~10s). A MutationObserver on the light
  // DOM would not see the shell appear inside shadow roots.
  let tries = 0;
  const timer = win.setInterval(() => {
    if (tick() || (tries += 1) > 100) win.clearInterval(timer);
  }, 100);
}
