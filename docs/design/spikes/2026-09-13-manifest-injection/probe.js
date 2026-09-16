/**
 * Instrumentation shared by every fixture page.
 *
 * Loaded from the `<head>` and **before** any page injects anything, which is the part that has to
 * be got right: `beforeinstallprompt` does not replay, so a listener attached after the event has
 * already fired records a false negative and the spike concludes the opposite of the truth.
 *
 * Two signals are captured rather than one, because either alone is weak. The event says Chrome
 * considers the page installable; the server log says Chrome actually fetched the manifest. Agreeing
 * signals from the page and from the wire are what make the result trustworthy.
 */

/**
 * Show, on the page itself, whether the manifest is actually reachable right now.
 *
 * Added after a manual Firefox run was thrown away. The server had been stopped, Firefox served the
 * pages from cache, both installed apps fell back to their `<title>`, and it looked exactly like a
 * browser ignoring the manifest. A dead server and a browser that ignores manifests are
 * indistinguishable from the outside, which makes this banner the difference between a result and a
 * wasted afternoon.
 *
 * Deliberately loud and deliberately at the top of the page: the check is worthless if you have to
 * go looking for it before installing.
 */
async function showManifestReachability() {
  const banner = document.createElement('p');
  banner.style.cssText =
    'font:700 16px/1.4 system-ui,sans-serif;padding:12px;margin:0 0 16px;border-radius:6px';

  try {
    // Two things about this URL, both load-bearing.
    //
    // `cache: 'no-store'` because a cached 200 from a server that has since died is the exact
    // failure being guarded against.
    //
    // `?probe=banner` because without it this check *is* a `GET /manifest.webmanifest` in the log,
    // indistinguishable from the browser's own manifest processing — which briefly made Firefox
    // look like it fetched the manifest on page load when the only thing fetching it was this
    // banner. The query string is stripped for serving and kept for logging.
    const res = await fetch('/manifest.webmanifest?probe=banner', { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const name = (await res.json()).name;
    banner.style.cssText += ';background:#d8f5d8;color:#0a3d0a';
    banner.textContent = `Manifest reachable. Installed app should be named "${name}".`;
  } catch {
    banner.style.cssText += ';background:#f5d8d8;color:#5a0a0a';
    banner.textContent =
      'MANIFEST UNREACHABLE — is server.mjs running? Do not install; any result is meaningless.';
  }

  document.body.prepend(banner);
}

document.addEventListener('DOMContentLoaded', showManifestReachability);

/** Everything the fixture records, read back afterwards from the page context. */
window.__spike = {
  /** Whether `beforeinstallprompt` fired at all. The headline result. */
  bip: false,
  /** `performance.now()` when it fired, or null. Paired with `injectedAt` to get the latency. */
  bipAt: null,
  /** `performance.now()` when the page injected its link. Left null by the static control. */
  injectedAt: null,
  /** Which case this is, taken from the title so a screenshot is self-describing. */
  mode: document.title,
};

window.addEventListener('beforeinstallprompt', (e) => {
  // Suppressed so Chrome does not put its own install UI over the fixture. The event having fired
  // is the entire result; actually prompting would add nothing and would need dismissing by hand.
  e.preventDefault();

  window.__spike.bip = true;
  window.__spike.bipAt = performance.now();
  console.log('SPIKE beforeinstallprompt fired at', window.__spike.bipAt);
});

/**
 * Report the result back to the server, which logs it.
 *
 * The reason this exists rather than leaving you to read `window.__spike` from a console: the
 * console is not reachable in every browser this fixture needs to answer for. Driving Chrome's
 * devtools is easy, driving Firefox's is not, and driving a phone's is not happening at all. A
 * beacon turns "open the page" into the entire test procedure, on any browser, including one on
 * someone else's device.
 *
 * **`beforeinstallprompt` is Chromium-only.** In Firefox and Safari it will never fire and `bip`
 * will always be false, which is not a failure and must not be read as one. There, the signal is the
 * server's own log: did the browser go and fetch `/manifest.webmanifest` after the link was
 * injected? That is what is actually being asked, and it is recorded whether or not the page
 * manages to say anything.
 */
setTimeout(() => {
  // 8 seconds, chosen to sit past d.html's 5 second timer plus the ~20ms the prompt has taken
  // everywhere it fires at all, so one delay serves every page.
  const body = JSON.stringify({ ...window.__spike, ua: navigator.userAgent });

  // sendBeacon survives the page being closed the instant after; fetch is the fallback for
  // browsers that refuse it. Either way a failure here loses the page's own account, never the
  // server log, which is the part that matters.
  try {
    if (!navigator.sendBeacon('/report', new Blob([body], { type: 'application/json' }))) {
      throw new Error('sendBeacon refused');
    }
  } catch {
    fetch('/report', { method: 'POST', body, headers: { 'content-type': 'application/json' } });
  }
}, 8000);
