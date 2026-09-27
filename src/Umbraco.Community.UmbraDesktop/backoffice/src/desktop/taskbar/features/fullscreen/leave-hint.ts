/**
 * The localization key for the greyed-out full screen button's tooltip: which key leaves the
 * browser's own full screen on this platform.
 *
 * Decided by the platform rather than the browser, because the key is the operating system's
 * convention and every browser follows it: F11 on Windows and Linux in Chrome, Edge and Firefox
 * alike; Control-Command-F on a Mac, where F11 shows the desktop instead; and the dedicated full
 * screen key on a Chromebook, whose keyboard has no F11. Esc is deliberately never the answer: a
 * press does not leave the browser's own full screen anywhere, and only newer Chrome leaves it on a
 * long hold.
 * @param platform What the browser reports as its platform; see {@link currentPlatform}.
 * @returns The key, F11's for any platform this does not recognise.
 */
export function leaveFullscreenHintKey(platform: string): string {
  if (/^mac/i.test(platform)) return 'umbraDesktop_taskbarFullscreenBrowserMac';
  if (/chrome ?os/i.test(platform)) return 'umbraDesktop_taskbarFullscreenBrowserChromeOs';
  return 'umbraDesktop_taskbarFullscreenBrowserF11';
}

/**
 * The platform this browser reports: `navigator.userAgentData.platform` where it exists, which is
 * Chromium, and the older `navigator.platform` where it does not, which is Firefox. Both start with
 * "Mac" on a Mac. Only the first names a Chromebook; Firefox there runs as a Linux app and reports
 * Linux, so it gets the F11 hint a Linux app would.
 * @returns The platform, or an empty string when the browser reports neither.
 */
export function currentPlatform(): string {
  const reported = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform;
  return reported || navigator.platform || '';
}
