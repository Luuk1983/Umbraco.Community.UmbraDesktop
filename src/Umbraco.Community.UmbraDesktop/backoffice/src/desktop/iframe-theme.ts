/**
 * Keeping the backoffice documents inside desktop windows on the same light/dark theme as the
 * desktop around them.
 *
 * Each window hosts a whole second backoffice in an iframe, and a document only ever gets its
 * theme from its own `<head>` — the desktop's stylesheets stop at the frame boundary. Umbraco's
 * own `UmbThemeContext` reads the chosen alias from `localStorage` when it boots and puts a
 * `<link rel="stylesheet">` for it in `document.head`; the light theme is the base and has no
 * stylesheet at all. So a window opened after a switch is already correct, and a window that was
 * already open keeps whatever it booted with, forever.
 *
 * This module closes that gap by doing to the frame's head exactly what Umbraco does to the top
 * document's: swap one link. Reloading the frames would also work and takes one line, but it
 * throws away whatever the user was in the middle of typing in a content editor — too high a
 * price for a display preference, and unnecessary when the themes are plain CSS.
 */

/** The parts of a registered `theme` extension manifest this module reads. */
export interface UmbraDesktopThemeManifest {
  /** The theme's alias, as `UMB_THEME_CONTEXT` reports it. */
  alias: string;
  /** Where the theme's CSS comes from: a URL, a loader function, or nothing for the base theme. */
  css?: unknown;
}

/** What one document needs in order to be brought in line with the theme in force. */
export interface UmbraDesktopThemeSync {
  /**
   * Every theme stylesheet the backoffice knows about. Read from the registry rather than written
   * down here so that renaming or adding a theme CSS file cannot leave a stale link behind — the
   * paths are Umbraco's to change, and its own manifests say as much.
   */
  known: string[];
  /** The stylesheet the active theme paints with, or nothing when it is the base theme. */
  active?: string;
  /**
   * Whether the active theme can be mirrored by copying a link. False when its CSS is a loader
   * function: there is no URL to point at, and treating that as "no stylesheet" would silently
   * drop the frame back to the base theme. The caller falls back to reloading the frame, which
   * lets the frame's own theme context load it the way it would on a fresh boot.
   */
  mirrorable: boolean;
}

/**
 * Work out what the frames need, given the registered themes and the alias in force.
 * @param themes Every registered `theme` extension.
 * @param alias The theme alias currently in force.
 * @returns The stylesheet to apply and the ones to clear away.
 */
export function resolveThemeSync(
  themes: ReadonlyArray<UmbraDesktopThemeManifest>,
  alias: string,
): UmbraDesktopThemeSync {
  const known = themes.map((theme) => theme.css).filter((css): css is string => typeof css === 'string');
  const css = themes.find((theme) => theme.alias === alias)?.css;
  return {
    known,
    active: typeof css === 'string' ? css : undefined,
    mirrorable: typeof css !== 'function',
  };
}

/**
 * Bring one already-loaded document's `<head>` in line with the theme in force: drop the theme
 * stylesheets that no longer apply, add the one that does.
 *
 * A link that is already correct is left in place rather than replaced. This runs on every
 * emission of the theme observable, not only on a real change, and swapping the element out would
 * re-fetch the stylesheet and flash the frame unstyled each time.
 * @param doc The document to update — a window iframe's, or the desktop's own in a test.
 * @param sync What {@link resolveThemeSync} worked out.
 */
export function syncThemeStylesheet(doc: Document, sync: UmbraDesktopThemeSync): void {
  const links = [...doc.head.querySelectorAll('link[rel="stylesheet"]')];
  for (const link of links) {
    const href = link.getAttribute('href');
    // Only ever touches links this backoffice registered as themes; anything else in the head —
    // the app's own stylesheets, another package's — is none of our business.
    if (href && href !== sync.active && sync.known.includes(href)) link.remove();
  }
  if (!sync.active) return;
  if (links.some((link) => link.getAttribute('href') === sync.active)) return;
  const link = doc.createElement('link');
  link.setAttribute('rel', 'stylesheet');
  link.setAttribute('href', sync.active);
  doc.head.appendChild(link);
}
