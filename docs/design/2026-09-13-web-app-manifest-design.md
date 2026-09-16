# Web app manifest — Design

> The backoffice declares a web app manifest, so installing or pinning it gives a named, correctly
> iconed, chromeless window instead of a browser tab wearing Umbraco's logo. It opens on the desktop,
> and which icon it wears is a site-wide setting rather than something the package decides for
> everybody.

- **Status:** Implemented 2026-09-16, except the screenshot and the mobile checks (§3.3, §2.5).
  Link injection spiked and confirmed in Chrome 153, Edge 153 and Firefox 155 (2026-09-13)
- **Date:** 2026-09-13
- **Branch:** `claude/issue-47-icon-424acc`
- **Issue:** [#47](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/47)
- **Target:** Umbraco CMS **v17**, package `Umbraco.Community.UmbraDesktop`

---

## 1. Goal & scope

Pinning the backoffice from Edge today gives Umbraco's own favicon, and Chrome's *Install as app*
gives a generic tile. Neither is wrong exactly — there is no manifest, so the browser is guessing
from what the page happens to expose.

**In scope:**

- A web app manifest served for the backoffice, declaring name, icons, scope and `display:
  standalone`.
- Opening on the desktop rather than on whichever section the backoffice would have picked.
- Site-wide settings for the installed app's icon and its name, with two sources each.
- The artwork the default mode needs.

**Out of scope:**

- A service worker, and therefore offline support and caching of any kind. Installability does not
  require one, and a backoffice is the last place to introduce a cache layer casually.
- Anything about the session. An installed backoffice shares cookies and storage with the browser it
  was installed from, and nothing here changes that.
- Per-user icons. The thing being installed is a site, not a person's preferences.

## 2. What the manifest says

```
id          <backoffice path>/umbradesktop
start_url   <backoffice path>/section/umbradesktop
scope       <backoffice path>/
display     standalone
name        resolved per §4.3
short_name  derived from it, cut at a separator
icons       resolved per §4
theme_color from the active theme
```

Every path derives from the configured backoffice path. The literal `/umbraco` appears nowhere, the
same discipline `backofficePathFromBaseHref` already applies on the client for the same reason: the
path is configurable and a site that changed it would otherwise get a manifest pointing at nothing.

### 2.1 Why `display: standalone` is the feature

The other members are bookkeeping. `standalone` is the one that pays: no address bar, no tab strip,
no browser chrome. It is the first time the desktop's illusion is not sitting inside somebody else's
window frame, and it is the reason this issue is worth doing at all rather than being a cosmetic fix
for a taskbar icon.

### 2.2 `start_url` is the section path, and no new route is needed

`<backoffice path>/section/umbradesktop` already always loads the desktop, whatever the user's
`bootIntoDesktop` preference says. Two things make that true, and both are already in
`boot-decision.ts`:

- `shouldRaiseSplash` returns true for any desktop section path on its first line, before it consults
  the browser hint, the session suppression or the crash marker. A typed or pinned desktop URL is not
  a boot and none of those apply to it.
- `shouldBootIntoDesktop` never runs, because it only fires on the backoffice *root*. Landing
  directly on the section is not a redirect, so the preference is never read.

So the URL that means "give me the desktop regardless" exists and is tested. It has simply never been
written down as a thing you can pin. A `?desktop=on` flag was considered as the sibling of the
existing `?desktop=off` and rejected: it would need a branch in both `shouldBootIntoDesktop` and
`shouldRaiseSplash` plus their tests, and it would buy nothing the section path does not already do.

`?desktop=off` keeps working unchanged, and remains the escape hatch for a desktop that will not
mount.

### 2.3 `scope` is the backoffice root, not the section

Narrowing scope to the desktop section would look tidier and would break Exit. Exit navigates to
`<backoffice path>/section/content`, and a navigation outside scope leaves the installed window for a
browser tab. Exiting the desktop would eject you from the app you installed, which is a strange thing
for a button labelled Exit to do.

The cost of the wider scope is that the whole classic backoffice is inside the app too. That is the
right trade: an installed backoffice that can only show the desktop would be less useful than the
browser tab it replaced.

### 2.4 `id`, and living beside a site's own PWA

A manifest is linked from a document, not owned by an origin. The frontend's `<link rel="manifest">`
lives in the frontend's HTML and ours only ever appears on the backoffice document, so the two never
meet.

Identity is decided by the `id` member. Different `id` means distinct applications *even when served
from the same URL*; a matching `id` means an update to an existing app even when the URL has moved;
an absent or invalid `id` falls back to `start_url`. Setting it explicitly does two things: it lets a
site's own frontend PWA and its backoffice install side by side, and it means a later change to
`start_url` updates the installed app rather than orphaning it.

The one case we cannot fix from here: a frontend manifest declaring `scope: "/"` contains `/umbraco`,
so a user already inside that installed window who navigates to the backoffice stays in it, wearing
the frontend's icon. Our manifest is never consulted. Rare on a normal Umbraco site, real on an
editor-facing headless app.

### 2.5 What happens on a phone, and why that is not a gap

Asking whether the manifest works on Android and iOS turns up a better question, which is whether it
should do anything there at all.

`start_url` opens the desktop. The desktop is a windowed shell with a taskbar, drag-to-move,
resize handles and overlapping windows, and none of that is usable on a 390px screen. So an install
on a phone that works *perfectly* still delivers a bad app. The platform we cannot test is also the
platform we would not want to ship this to, and those two facts cancel rather than compound.

That is not an argument for blocking mobile installs, which would take User-Agent sniffing in a
document the browser caches and hands to an OS — fragile in exactly the way that ages badly. It is an
argument for not treating iOS as a blocker on a feature aimed at people with a mouse and a large
monitor.

The real fix is not in this feature. A desktop that noticed a narrow viewport and stepped aside to
the classic backoffice would make the mobile install sensible, and it would also improve the browser
tab case that exists today. Its own issue, not this one.

**Consequence for the plan:** iOS and Android go on the done list as *checks*, not as gates. If
Safari turns out to need the `apple-mobile-web-app-*` meta tags, that is a small addition. If it
ignores an injected manifest entirely, the outcome is that iOS keeps behaving exactly as it does
today, which is the situation the issue was filed from and not a regression.

## 3. Serving it

### 3.1 The endpoint

Served by the C# project at a stable path, as a real HTTP resource. There is no client-only version
of this: `scope` and `start_url` resolve relative to the manifest's own URL, so a `blob:` or `data:`
manifest cannot express a scope at all.

It must be **anonymous**. A manifest fetch is not an ordinary page fetch and an install can be
started from the login screen, so it cannot depend on the backoffice cookie. That bounds what it may
contain: the site name and the icon, both of which are public on the frontend anyway.

### 3.2 Getting `<link rel="manifest">` into the head

**The bundle appends the link to `document.head` at runtime. This was spiked before the design was
settled, because if it did not work the feature was a middleware feature.**

It was worth checking. Umbraco 17 generates the backoffice HTML in C# and there is no `index.html`
in `Umbraco.Cms.StaticAssets` to extend, so the alternative was response-rewriting middleware over
the backoffice HTML — reliable, ugly, and several times the work. And the commonly cited writeup on
dynamic manifests states flatly that injecting the tag into the head does not take, and that the
link must already exist in the HTML with JavaScript only filling its `href`.

**That claim is stale.** Spiked on 2026-09-13 against Chrome 153 with a static fixture on
`localhost`, each page instrumented for `beforeinstallprompt` and watched at the server so every
fetch was recorded independently of what the page claimed. The fixture is kept at
[`spikes/2026-09-13-manifest-injection/`](./spikes/2026-09-13-manifest-injection/) so this can be
re-run rather than re-argued. All four cases pass:

| Case | What it does | Manifest fetched | Icons fetched | `beforeinstallprompt` |
| --- | --- | --- | --- | --- |
| B | Static `<link>` in the HTML (control) | yes | yes | yes |
| A | Whole link element created and appended by script on load | yes | yes | yes, 19ms after |
| C | Empty `<link>` in the HTML, `href` set by script | yes | yes | yes, 24ms after |
| D | Whole element appended **5 seconds after load** | yes | yes | yes, 21ms after |

Case D is the one that matters, because our bundle arrives long after the document does. Chrome
re-evaluates installability when the manifest link changes; it does not decide once at load and give
up. Nineteen milliseconds from appending the element to the install prompt being offered, five
seconds into the page's life.

C is the workaround the stale advice recommends, and it passes too. That matters only because it
makes the two dynamic routes equivalent, so there is no reason to prefer the one that would need the
placeholder written into Umbraco's own backoffice HTML.

So: no middleware, no C# view extension, no placeholder. The bundle appends the element and Chrome
picks it up.

Edge 153 behaves identically, which matters because the screenshots on the issue are Edge.
Firefox 155 passes as well, though only under a manual install — see §3.3.

### 3.3 What the spike does not cover

Chromium is not the whole story. Firefox has since been measured and passes; the honest position on
the rest is short.

**Firefox 155: passes, established by hand.** It never fetches the manifest on page load, not even
for the static control, because its install (back on Windows since 143) is a menu action rather than
an offered banner — it reads the manifest only when install is invoked. So the passive fixture is
blind to it and the absence of a fetch means nothing. Driven manually, its own pipeline fetched
`/manifest.webmanifest` roughly five seconds after the link was injected, and the installed app
carries the manifest's icon rather than a favicon fallback.

**Android: untested, inferred fine.** Chrome on Android is the same engine, so the same result is
likely. Likely is not measured, and it is not load-bearing — see §2.5, which argues the mobile case
should not be designed for at all.

**iOS: untested and genuinely unknown.** Safari has honoured manifests since 16.4 but still leans on
the `apple-mobile-web-app-*` meta tags, and nothing found settles whether it reads the manifest at
page load or at the moment the user taps Add to Home Screen. Only the second makes injection work.
Also §2.5.

**And the backoffice's own timing.** The link goes up after authentication rather than after a
five-second timer. Not likely to bite, given D, but not yet seen in the real thing.

**A caveat worth keeping.** This is behaviour, not specification. It could regress in a future
Chrome, and nothing in the manifest spec promises re-evaluation on link mutation. If it ever does
regress, the fallback is middleware and the fixture that proved this lives in the spike notes below.

### 3.4 Nothing here may touch the management API

**The Umbraco management API is a backoffice construct for data manipulation.** Anything consumed by
something other than the backoffice — a public page, a browser's install machinery, an OS reading a
pinned tile — must never be served from it or point at a URL inside it.

**And nothing here may require authentication either.** The two go together: the manifest and every
URL inside it are read by machinery that has no session and never will — an install pipeline, an OS
drawing a pinned tile. A frontend-facing surface that authenticates is as broken as one that routes
through the management API, and it fails the same silent way.

**An HMAC-signed image URL is not an authenticated one**, and conflating the two cost a wrong
decision here once already. Umbraco signs the *processing parameters* on a resized image so they
cannot be forged against the site; the URL remains public and anyone can fetch it, session or no
session. Signed is fine. Authenticated is not.

That covers every byte this feature emits. The manifest endpoint is a plain `ControllerBase` with
`[AllowAnonymous]` on a site-root route rather than a `ManagementApiControllerBase`. Its icons are
static `App_Plugins` paths, the site's own `/favicon.ico`, or a media file served straight off disk
by static file middleware. Not one of them is a management route, and not one of them authenticates
or validates anything.

The test is **"who consumes this?"**, not "is it authenticated?". Getting that wrong is how the app
icon URL was first specified as
`/umbraco/management/api/v1/media/{key}/thumbnail?width=512` — which needs the backoffice session,
so the anonymous manifest fetch could never have loaded it, and a manifest whose 192 and 512 do not
load is not installable at all. The weaker test would have caught that eventually, by accident. The
right one catches it immediately.

The backoffice's own settings screen reading and writing the stored icon *through* the management
API (§4.5) is the correct use of it and is unaffected.

### 3.5 No service worker

MDN is explicit that installability does not require one. Chrome's old service-worker criterion is
gone. This keeps caching — and every question caching brings to a backoffice — out of scope.

## 4. The icon and the name

### 4.1 Why it is a setting and not a shipped file

A PWA install is per origin, so an agency running five Umbraco sites installs five backoffices. An
icon baked into the package makes five identical tiles, which is the complaint this issue opens with,
restated with better artwork.

The package's NuGet icon is doubly unsuited. It is an `LP` publisher monogram that only reads as
anything sitting next to the package name, and on a taskbar there is no package name. And at 128px it
is below the sizes a manifest wants, so it would ship upscaled and soft next to every other pinned
app.

### 4.2 Three modes

- **Default** — the UmbraDesktop mark (§5).
- **Favicon** — the site's own favicon, with `sizes: "any"`, accepting whatever the site has. The one
  mode where five installed backoffices look like five different apps without anyone doing work.
- **Custom** — a media item, chosen with Umbraco's own picker, requested at each size through
  Umbraco's own URL generation.

**There is no separate upload control, and the picker is not a compromise to avoid one.** Umbraco's
`media-picker-modal` embeds `umb-dropzone-media`, so dropping a file into the picker uploads it to
the library *and* selects it in one gesture. A second upload path would duplicate that with its own
storage, a serving endpoint, permissions, resizing and cleanup — everything the Media Library
already provides, behind a URL that Umbraco knows how to generate correctly whether the site stores
media on disk or in blob storage. Wallpapers already use `UMB_MEDIA_PICKER_MODAL` for the same
reasons.

**Custom mode's URLs are generated by Umbraco, never assembled — and that is what makes resizing
available rather than what prevents it.**

Two things are true at once and they are easy to confuse. The manifest must reach the icon with **no
authentication**, because it is read by machinery that has no session. But Umbraco 17's processed
image URLs are **HMAC-signed**, and a signature is not authentication: it signs the *processing
parameters* so arbitrary resize requests cannot be forged against the site, and the resulting URL is
still public and fetchable by anyone, install pipelines included. `IImageUrlGenerator` applies that
signature itself — `ImageSharpImageUrlGenerator` takes ImageSharp's `RequestAuthorizationUtilities`
in its constructor precisely to do so.

So the icon is asked for at the sizes we actually want:

```
IPublishedUrlProvider.GetMediaUrl(key)              →  the media's own URL
IImageUrlGenerator.GetImageUrl(options)             →  resized, signed, ready to serve
```

The same source image can therefore yield a real 192 and a real 512, and a different encoding if
that is ever wanted, rather than one unresized original.

**Umbraco must generate the URL even when no resizing is involved.** This is the part that has
nothing to do with signing: the media file system is an abstraction, and under Azure Blob Storage
the provider resolves media entirely differently from local disk. A hand-built `/media/...` path is
a local-disk assumption that silently breaks on every blob-backed site. Asking Umbraco is the only
form that is correct on both.

**A `sizes` value is the member that is genuinely load-bearing.** Probed against Chrome 153:

| icon declaration | installable |
| --- | --- |
| `sizes: "any"` | yes |
| `sizes: "512x512"` alone, no 192 present | yes |
| `sizes` omitted entirely | **no** |

Worth keeping even though we now supply real sizes, for two reasons. MDN's "must contain both 192
and 512" is stricter than Chrome's actual criterion, so that requirement is not the thing forcing
any decision here. And omitting `sizes` costs installability with no error anywhere, which is the
failure mode to actually guard against.

### 4.3 The name has the same problem, and the same shape

`name` was originally just `IHostingEnvironment.SiteName`, and on a real instance that produced
`Umbraco.Community.UmbraDesktop.TestInstance` on the taskbar.

That is not a quirk of the test instance. `IHostingEnvironment.SiteName` substitutes the
**application** name when nothing is configured, and most sites never set
`Umbraco:CMS:Hosting:SiteName` — so most sites would ship an assembly identifier as the name of
their app. Worse, it is invisible from inside: the value is non-null and non-blank, so no fallback
fires and nothing looks wrong until someone installs it and reads their own taskbar.

Two changes follow, and they cost almost nothing on top of the icon work:

**Read the configured value, not the substituted one.** `IOptions<HostingSettings>.Value.SiteName`
is null when nobody set it, where `IHostingEnvironment` has already filled it in. That restores the
distinction between "this site is called Contoso" and "nobody said", which is what lets a fallback
exist at all.

**Let an admin override it.** The name resolves through exactly the chain the icon does —
appsettings, then the key-value store, then Umbraco's own site name, then a fallback — and is edited
in the same **Site** category, under the same gate. Blank means "stop overriding" at every level, so
clearing the field returns to the site's own name rather than naming the app nothing.

One resolver answers both and one stored document holds both, because they are one decision made in
one place. Splitting them would duplicate the whole chain to express a distinction nobody setting
them perceives — with the consequence that a write must always carry both, or saving an icon would
blank the name as a side effect.

### 4.4 Two sources, in order

1. **appsettings**, when present. Set through CI, consistent across environments, and unaffected by a
   database restore.
2. **Umbraco's key-value store**, edited in the backoffice. No redeploy, discoverable.
3. **Default**, when neither says anything.

Both exist because they answer different questions. A database-stored icon travels with a restore, so
staging recovered from production comes back wearing production's icon and the two tiles are
identical again — the original complaint, reintroduced. A config-only icon needs a developer and a
deploy to change, and nobody finds it without the README.

When appsettings supplies the value the UI shows it and says it is locked by configuration, rather
than accepting edits it will silently ignore.

### 4.5 Where it is edited

Desktop settings grows a **Site** category, visible only to users with Settings section access.

This is the first thing in that dialog that is not a per-user preference, and the category has to say
so plainly: everything in it applies to every user, not to the person reading it. The gate matters
for the same reason — without it, an editor changing their wallpaper could change everyone's taskbar
tile.

## 5. The artwork

The default icon is the boot splash standing still: the Umbraco mark inside the loader's ring. It is
**generated**, not drawn — `backoffice/scripts/appicon-art.mjs` reads the mark path out of
`desktop/loader-ring.ts` so the icon cannot drift away from the animation it is meant to echo. The
composition ratios are the icon's own, and each one carries its reasoning on the constant.

What ships:

- **192 and 512 PNGs**, transparent, the disc running edge to edge.
- **A separate 512 marked `maskable`**, artwork inset to the safe boundary. A genuinely different
  drawing, not the same file re-exported.
- **A 180 `apple-touch-icon`**, flattened onto white. The one render that must be opaque, because
  iOS does not composite transparency — it renders it black. Flattened onto white and not onto the
  theme blue, because the mark is blue and would vanish.

### 5.1 Three things this cost, and what they teach

**No background at all.** Every platform that shows an installed app supplies its own container, so
a painted tile nests one container inside another and is what makes an icon look imported rather
than native. The consequence is that the mark must carry its own contrast: the logo path is a disc
with the U cut *out* of it, so left alone the U is a hole showing whatever is behind the icon.
Measured on light, dark and mid grounds, a white mark vanished on light and an all-blue one went
muddy on dark. Filling the hole white is what makes it independent of its surroundings.

**A bounding box is not a size.** Two rounds were spent pushing the artwork outward while it
measured 94% of its box and still looked small on a real taskbar. The number that actually predicts
perceived size is **ink** — the share of the canvas that is not transparent. A thin ring around a
transparent gap measured 94% and inked about 25%; filling the disc took it to 78.8%, which is π/4
and the ceiling for a circle in a square. **Measure ink, and render the alternatives side by side
before changing anything.** Describing them does not work; the comparison sheet settled in one look
what three edits had not.

**Change one ratio at a time.** Enlarging the disc while re-basing the mark's ratio from the ring's
interior onto the disc shrank the mark at the same moment the disc grew, and the logo ended up
adrift in a field of blue looking like the wrong icon rather than a bigger one.

### 5.2 Still open

The icon is **good enough to ship and worth revisiting** (agreed 2026-09-16). Two things for whoever
picks it up:

- `npm run appicons:sheet` writes contact sheets at 512/192/64/32 plus a simulated circle crop. An
  icon is a drawing and no assertion can tell you it looks right; look at the 32.
- **One suspicion was never tested.** The manifest offers the maskable render alongside the plain
  one, and its artwork is inset to 80% by definition. If Chrome prefers it when generating the
  Windows shortcut, then the plain icon's size is irrelevant and every adjustment to it is invisible
  — which would explain why the icon still read small at 94% of its box. Dropping the maskable entry,
  rebuilding and re-pinning would settle it in minutes.

## 6. Testing

Two pure functions carry the logic, and both get tests before implementation:

- **Building the manifest** from (backoffice path, site name, resolved icon). Every path derivation
  is a branch here, including a configured backoffice path and one with a trailing slash.
- **Resolving the icon** through appsettings, then key-value, then default, across all three modes.

Everything else is plumbing around those two. The link injection in §3.2 is not a test and cannot be
made into one; it has to be a browser, which is why it was spiked rather than specified.

### 6.1 The spike fixture

Lives at [`spikes/2026-09-13-manifest-injection/`](./spikes/2026-09-13-manifest-injection/), with its
own README covering how to run it and the two traps that cost time. Committed rather than thrown away
because §3.2 rests on browser behaviour rather than on anything specified, so the useful thing to
leave behind is not the conclusion but the means of re-testing it.

## 7. Things that will be assumed and are not true

Worth stating in the docs, because both will be assumed by someone:

- **An install is not a second browser profile.** Same origin, same cookies, same storage. This
  matters more here than it would elsewhere, because the multi-environment work died on
  `SameSite=Strict` and someone will reach for a PWA install as the way around it. It is not.
- **The manifest endpoint is public.** It has to be, so it carries only the site name and the icon.

## 8. Definition of done

- [x] `npm run build`, `npm test`, `dotnet build -c Release` and `dotnet test` all pass
- [x] **README.md** — the Features list *and* a new section covering installing, the name, the icon,
      and the appsettings alternative. Markdown only, no raw HTML
- [x] **`umbraco-marketplace-umbraco.community.umbradesktop.json`** — `Tags` gains the PWA terms.
      **`Description` unchanged**, at 165 characters: this does not alter what the package
      fundamentally is
- [x] **`docs/`** — this design doc for the reasoning, and
      [`spikes/2026-09-13-manifest-injection/`](./spikes/2026-09-13-manifest-injection/) for the
      browser behaviour nobody should have to rediscover
- [x] **`backoffice/public/umbraco-package.json`** — **did not change**, as predicted. Everything is
      wired up in TypeScript and no new bundle is registered
- [ ] A screenshot of the installed app in `docs/screenshots/` and the marketplace `Screenshots`
      array. Deferred deliberately: it wants a window somebody likes the look of, captured at the
      size it should display, since the README cannot resize an image
- [ ] Safari on iOS and Chrome on Android checked against an HTTPS deployment. **Checks, not gates**
      — see §2.5 for why a phone is not this feature's audience
- [x] Artwork accepted as good enough to ship (2026-09-16), with a revisit agreed. See §5.2 for the
      one untested suspicion and the tool for judging a replacement

**One thing deliberately not written:** a separate `docs/installed-app.md` guide. The repo's rule is
that a user-facing feature belongs in the README and a contributor-facing one gets its own guide, as
theming does. Choosing a name and an icon is entirely user-facing, and a second document would have
split one short explanation across two files.
