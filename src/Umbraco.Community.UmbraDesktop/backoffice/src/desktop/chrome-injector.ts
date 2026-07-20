import type { UmbraDesktopChromeProfile } from './types';

const STYLE_ID = 'umbradesktop-injected-chrome';

/**
 * Build the CSS injected into a window's iframe to strip backoffice chrome.
 * Targets stable custom-element tags rather than classes (design doc §4.1).
 * @param profile How much shell to keep.
 * @returns A CSS string.
 */
export function buildChromeCss(profile: UmbraDesktopChromeProfile): string {
  // Always: hide the top header and let the main area take the full height
  // (the shell normally reserves 60px for the header).
  const base = `
    umb-backoffice-header { display: none !important; }
    umb-backoffice-main { height: 100% !important; }
  `;
  if (profile === 'full-section') {
    return base;
  }
  // workspace-only / bare: also drop the section's sidebar (tree/menu).
  // NOTE: the sidebar lives in a deeper shadow root than the header, so this
  // rule only reaches sidebars that share the header's root. Deeper sidebar
  // stripping is future work — Phase 1 ships full-section only.
  return `${base}
    umb-section-sidebar { display: none !important; }
  `;
}

/**
 * Find the shadow root that directly owns `<umb-backoffice-header>`. The
 * backoffice shell renders inside shadow DOM, so a document-level stylesheet
 * cannot reach the header — the style must go into the shadow root that
 * contains it. Breadth-first walk across nested shadow roots.
 *
 * Uses a duck-typed `.host` check rather than `instanceof ShadowRoot` so it
 * works across realms (an iframe's shadow roots are not instances of the parent
 * window's `ShadowRoot`).
 * @param from The document or shadow root to search from.
 * @returns The owning shadow root, or null if the shell is not present yet.
 */
export function findChromeRoot(from: Document | ShadowRoot): ShadowRoot | null {
  const queue: Array<Document | ShadowRoot> = [from];
  while (queue.length) {
    const node = queue.shift()!;
    if ((node as ShadowRoot).host && node.querySelector('umb-backoffice-header')) {
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
 * Inject (or refresh) the chrome-stripping stylesheet into a same-origin iframe.
 * The backoffice boots asynchronously, so if the shell is not mounted yet we
 * poll briefly until it appears. No-op if the iframe document is unreachable.
 * @param iframe The window's iframe.
 * @param profile The chrome profile to apply.
 */
export function injectChromeStyles(
  iframe: HTMLIFrameElement,
  profile: UmbraDesktopChromeProfile,
): void {
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) return;

  const apply = (): boolean => {
    const root = findChromeRoot(doc);
    if (!root) return false;
    let style = root.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = doc.createElement('style');
      style.id = STYLE_ID;
      root.appendChild(style);
    }
    style.textContent = buildChromeCss(profile);
    return true;
  };

  if (apply()) return;

  // Shell not up yet — poll until it mounts (max ~10s). A MutationObserver on
  // the light DOM would not see the shell appear inside shadow roots.
  let tries = 0;
  const timer = win.setInterval(() => {
    if (apply() || (tries += 1) > 100) win.clearInterval(timer);
  }, 100);
}
