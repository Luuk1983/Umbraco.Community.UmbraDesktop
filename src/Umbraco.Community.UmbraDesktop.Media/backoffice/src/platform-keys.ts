/**
 * Which modifier keys mean what on this computer (plan, global constraints): Cmd on a Mac, Ctrl on
 * Windows and Linux. The one place in the package that reads the platform, so a test can say which
 * platform it is on and nothing else has to guess.
 */

/**
 * Whether a platform string is Apple's, where Cmd is the primary modifier.
 * @param platform `navigator.platform`, or a test's stand-in.
 * @returns True on macOS, iPadOS and iOS.
 */
export function isMacPlatform(platform: string): boolean {
  return /^(Mac|iPhone|iPad|iPod)/i.test(platform);
}

/**
 * Whether this browser runs on a Mac.
 * @returns True on a Mac.
 */
export function onMac(): boolean {
  return isMacPlatform(globalThis.navigator?.platform ?? '');
}

/**
 * Whether an event holds the primary modifier: the key that adds to a selection and starts a
 * shortcut. Cmd on a Mac, where Ctrl+click is a right-click; Ctrl elsewhere, where the Windows key
 * belongs to the OS.
 * @param event The keys held.
 * @param event.metaKey Whether Cmd (or the Windows key) is held.
 * @param event.ctrlKey Whether Ctrl is held.
 * @param mac Whether this is a Mac.
 * @returns True when the primary modifier is held.
 */
export function hasPrimaryModifier(event: { metaKey: boolean; ctrlKey: boolean }, mac: boolean): boolean {
  return mac ? event.metaKey : event.ctrlKey;
}
