# Spike — can a manifest link be injected by script?

Fixture for the one question that decided the shape of the web app manifest feature (see
[`../../2026-09-13-web-app-manifest-design.md`](../../2026-09-13-web-app-manifest-design.md) §3.2).

## The question

UmbraDesktop needs `<link rel="manifest">` in the backoffice `<head>`. Umbraco 17 generates that
HTML in C# and there is no `index.html` in `Umbraco.Cms.StaticAssets` to extend, so the only cheap
route is for the bundle to append the element itself at runtime. The alternative was
response-rewriting middleware over the backoffice HTML: reliable, ugly, several times the work.

The [commonly cited writeup on dynamic manifests][medium] says flatly that injecting the tag into
the head does not take, and that the link must already exist in the HTML with JavaScript only
filling its `href`. If that still held, the feature was a middleware feature and the design had to
say so up front.

## The answer

It is stale. Chrome re-evaluates installability when the manifest link changes; it does not decide
once at load and give up.

Measured 2026-09-13 on **Chrome 153**, **Edge 153** and **Firefox 155**. Every browser tested
honours a manifest link that script put there, including one appended five seconds after load.

Chrome 153, all four pages:

| Page | What it does | Manifest fetched | Icon fetched | `beforeinstallprompt` |
| --- | --- | --- | --- | --- |
| `b.html` | Static link in the HTML (control) | yes | yes | yes |
| `a.html` | Whole link element appended by script on load | yes | yes | yes, 19ms after |
| `c.html` | Empty link in HTML, `href` set by script | yes | yes | yes, 24ms after |
| `d.html` | Whole element appended **5 seconds after load** | yes | yes | yes, 21ms after |

`c.html` passing is unsurprising and not the point; it is the workaround, and it needed no test to
believe. What it confirms is that the two dynamic routes are equivalent here, so there is no reason
to prefer the one that would require editing Umbraco's own HTML.

`d.html` is the one that mattered. Our bundle arrives behind a dynamic import, after
authentication, long after the document — so the question was never whether Chrome reads a link that
beat it to the punch, but whether it looks again at one that turns up late. It does, 19ms later.

Edge 153 was run separately on `d.html` and behaves identically, manifest fetched at the 5 second
mark and the prompt 21ms later. Expected, since it is the same engine, and worth having because the
screenshots on [#47][issue] are Edge.

**Firefox 155 passes too, and cost the most to establish.** It never fetches the manifest on page
load — not on `d.html`, not on the static control — because its install (back on Windows since
Firefox 143) is a menu action rather than an offered banner. It reads the manifest at the moment you
invoke install, and not before. So the fixture's passive signal is blind to Firefox, exactly as it
was blind in the embedded Chromium, and the absence of a fetch means nothing at all here.

Driven by hand, the log is unambiguous:

```
19:09:15.528 Firefox GET /d.html
19:09:15.579 Firefox GET /manifest.webmanifest?probe=banner   <- the banner, not Firefox
19:09:23.573 Firefox POST /report   injectedAt: 5082
19:09:26.052 Firefox GET /manifest.webmanifest                <- Firefox, after injection
```

The bare URL on the last line is the whole result: Firefox's own pipeline, fetching a manifest whose
link did not exist when the page loaded.

## Testing Firefox: it has to be done by hand

The procedure, because the passive fixture cannot do it for you:

1. **Check the banner at the top of the page is green.** Red means the server is not running and
   nothing you do next means anything. See the third trap below for why this check exists.
2. Uninstall any previous copy of the app first. An existing install can be reused rather than
   re-derived, which quietly gives you the previous run's answer.
3. Open `b.html` — **the control, first, as always** — wait past the 8 second beacon, and install it
   from Firefox's menu.
4. **Read the name in the install dialog**, and the icon. `Manifest Injection Spike` with a white
   circle on blue means the manifest was read. The page title with a generic globe means it was not.
5. Only if the control passed, repeat with `d.html`. Same signals.
6. **Confirm in the log.** A bare `GET /manifest.webmanifest` attributed to Firefox, after the
   beacon's `injectedAt`, is the result. `?probe=banner` lines are this fixture's own check and
   prove nothing.

**Do not read the taskbar label of a running window.** It is the window's `<title>`, not the
installed app's name, so a perfectly good install shows as `D-late-inject` and looks like a failure.
That misread nearly threw away a valid run. The install dialog's name and the icon are the honest
signals, and the log is the arbiter.

## What this fixture cannot tell you

**Android and iOS: not tested, and not testable from here.** Installability needs a secure context.
`localhost` is one; `http://<your-lan-ip>:8731` from a phone is not, so serving the fixture to a
device on the same network does not work no matter how the server is bound. Testing these needs the
fixture behind real HTTPS.

What can be said without testing: Chrome on Android is the same engine as Chrome on desktop and is
very likely to behave the same, but that is an inference and not a measurement. Safari is now the
only real unknown — it has honoured manifests since 16.4 but still leans on the `apple-mobile-web-app-*` meta
tags, and nothing found says whether it reads the manifest at page load or at the moment the user
taps Add to Home Screen. Only the second would make injection work.

[issue]: https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/47

## Running it

```bash
node server.mjs
```

No dependencies, deliberately — the point of keeping this is that it still runs against a browser
nobody has shipped yet. Then open each page and watch the server:

- <http://localhost:8731/b.html> — **run this first, every time.**
- <http://localhost:8731/a.html>
- <http://localhost:8731/c.html>
- <http://localhost:8731/d.html> (wait past the 5 second timer)

Each page beacons its result to the server 8 seconds in, so the **server log is the whole report**
and no console is needed. That matters because the browsers worth asking are not all drivable:

```
>> REPORT {"bip":true,"bipAt":5148.2,"injectedAt":5127.6,"mode":"D-late-inject","ua":"...Edg/153..."}
```

`bip: true` is a pass on Chromium. Everywhere else `bip` is always false and means nothing — read
the `GET /manifest.webmanifest` line instead, and see the section above on what to do when there
isn't one.

`localhost` is what makes this work at all: installability needs a secure context, which `localhost`
satisfies and `file://` does not.

## Three traps, each of which cost time here

**Run the control first.** A negative result on `a.html` means nothing until `b.html` has passed on
the same browser. Skipping it is how the first attempt at this spike reached the wrong answer: run
in an embedded Chromium, *no* page fetched the manifest, control included, because that browser has
no install pipeline at all. A browser that cannot answer the question looks exactly like a No.

This is not a hypothetical that happened once. It caught Firefox too, several hours later, in the
same session, after the trap had already been written down here. `d.html` came back with no manifest
fetch and it looked like a clean failure; the control came back the same way and turned it into "this
fixture cannot see Firefox". Run the control.

**Read the server log, not just the page.** `window.__spike` reports what the page observed.
`server.mjs` logs every request, so it reports what Chrome actually did. Both agreeing is what makes
the result worth writing down.

**A dead server looks exactly like a browser ignoring manifests.** The first manual Firefox run was
thrown away to this: the server had been stopped, Firefox served the pages from cache so they
rendered perfectly, both installed apps fell back to their `<title>` with a generic globe icon, and
it read as a clean, decisive negative. It was a 404 that never reached the log, because the log was
not running either. Hence the green banner on every page and `cache-control: no-store` on every
response. **Do not install off a page whose banner is not green.**

## The icons are real, and have to be

`icon-192.png` and `icon-512.png` are flat placeholders, generated once with `sharp` and committed
so the fixture has no build step. They are not decoration: Chromium requires a 192 **and** a 512 to
consider a manifest installable, so a fixture without them fails for a reason that has nothing to do
with link injection.

[medium]: https://medium.com/@alshakero/how-to-setup-your-web-app-manifest-dynamically-using-javascript-f7fbee899a61
