/**
 * Whether a typed address is one the desktop could actually fetch from.
 *
 * The same rule the server applies, deliberately: `DesktopConnectionUri.TryResolve` refuses exactly
 * what this refuses, so a connection that saves is a connection the server can use. Checking in both
 * places is not duplication - the server cannot trust the browser, and the browser can say so while
 * the person is still looking at the field.
 *
 * It exists because of a bug. An address of `https://localhost:123456` reads perfectly and no URL
 * parser will take it, because a port cannot exceed 65535, and an extra digit in a port number is an
 * ordinary typo rather than misuse. Saved, it took down the whole status screen.
 * @param value The address as typed.
 * @returns True when it parses as an http or https URL.
 */
export function isUsableConnectionAddress(value: string): boolean {
  const trimmed = value.trim();

  if (trimmed === '') {
    return false;
  }

  let url: URL;
  try {
    // `URL` is the browser's own parser, which is the same one that would resolve the address if
    // this were a link. Anything it refuses is not an address, whatever it looks like.
    url = new URL(trimmed);
  } catch {
    return false;
  }

  // A parseable URL is not necessarily a web address. Plain http stays allowed, because an instance
  // on an internal network may well not be on TLS.
  return url.protocol === 'https:' || url.protocol === 'http:';
}
