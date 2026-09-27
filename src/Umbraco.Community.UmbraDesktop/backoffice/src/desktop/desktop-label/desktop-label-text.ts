/** What the desktop label says. */
export interface UmbraDesktopLabelText {
  /** The large line: the App name, or the domain when nothing names the site. */
  name: string;
  /** The small line under it, or null when there is none. */
  domain: string | null;
}

/**
 * Decide what the desktop label says.
 *
 * The name is the App name, resolved by the server exactly as the installed app resolves it. When
 * nothing names the site the installed app is called "Umbraco", which on a desktop says nothing at
 * all, so the label shows the domain in its place instead, and does not then repeat it underneath.
 *
 * The domain is the browser's, never the server's idea of it, for the reason the Connections status
 * screen gives for its local row: behind a proxy an instance does not reliably know its own public
 * address, and the browser always knows where it is.
 * @param name The App name as the server resolved it. Null, undefined or blank when nothing names
 * the site.
 * @param domain The host the browser is on.
 * @param showDomain Whether the domain line is switched on.
 * @returns The two lines.
 */
export function desktopLabelText(
  name: string | null | undefined,
  domain: string,
  showDomain: boolean,
): UmbraDesktopLabelText {
  const named = name?.trim();
  if (!named) return { name: domain, domain: null };
  return { name: named, domain: showDomain ? domain : null };
}
