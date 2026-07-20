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
  return `${base}
    umb-section-sidebar { display: none !important; }
  `;
}

/**
 * Inject (or refresh) the chrome-stripping stylesheet into a same-origin iframe.
 * No-op if the iframe document is not reachable (e.g. cross-origin or not ready).
 * @param iframe The window's iframe.
 * @param profile The chrome profile to apply.
 */
export function injectChromeStyles(
  iframe: HTMLIFrameElement,
  profile: UmbraDesktopChromeProfile,
): void {
  const doc = iframe.contentDocument;
  if (!doc?.head) return;
  let style = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement('style');
    style.id = STYLE_ID;
    doc.head.appendChild(style);
  }
  style.textContent = buildChromeCss(profile);
}
