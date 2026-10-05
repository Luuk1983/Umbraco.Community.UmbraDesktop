/** The family name the Arcade declares its display font under; namespaced so no site's own Fraunces is touched. */
export const ARCADE_DISPLAY_FONT = 'UmbraDesktop Arcade Fraunces';

/** The file, as `vite.config.ts` copies it. */
const ARCADE_FONT_FILE = 'fraunces-latin-wght-normal.woff2';

/** Where the browser finds it. */
const ARCADE_FONT_URL = `/App_Plugins/Umbraco.Community.UmbraDesktop.Services.Arcade/fonts/${ARCADE_FONT_FILE}`;

/** The style element's id, so it is added once however many pieces ask. */
const STYLE_ID = 'umbradesktop-arcade-font';

/**
 * Declare the Arcade's display font in the document. In the document, not a shadow root: Chrome
 * ignores `@font-face` inside shadow-root styles, so a font declared beside the elements that use it
 * would never load. Every Arcade element calls this on construction; the first call adds it.
 * @param doc The document; the page's own by default.
 */
export function ensureArcadeFont(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `@font-face { font-family: '${ARCADE_DISPLAY_FONT}'; src: url('${ARCADE_FONT_URL}') format('woff2'); font-weight: 100 900; font-style: normal; font-display: swap; }`;
  doc.head.append(style);
}
