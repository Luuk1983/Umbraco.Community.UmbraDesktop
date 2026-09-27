# Desktop label: design

> The site's name, written large in a corner of the desktop, so it is the first thing you see when
> you land and hard to mistake for another environment. The domain can go underneath it. It sits on
> the wallpaper behind the windows, and it is a site-wide setting in the Site category, off until an
> admin turns it on.

- **Status:** Implemented and verified in a browser 2026-09-27, except the screenshot (§10). Three
  corrections from the build and from review are in §3.1, §3.3 and §7, and the rest of what the
  build taught is in §12
- **Date:** 2026-09-27
- **Branch:** `claude/umbraco-desktop-env-name-5105cc`
- **Issue:** [#93](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/93).
  Deliberately separate from [#23](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/23),
  see §9
- **Target:** Umbraco CMS **v17**, package `Umbraco.Community.UmbraDesktop`

---

## 1. Goal & scope

Local, staging and production look identical, and the desktop fills the viewport, so the URL is the
only thing that tells them apart. Nobody reads the URL, and a full-screen desktop or an installed
backoffice does not show one at all. This puts the site's name on the desktop in letters large
enough to register without being read.

**In scope:**

- One label, drawn on the wallpaper in a corner of the desktop.
- Three site-wide settings: show it, which corner, and whether the domain goes underneath.
- A read endpoint every backoffice user can call, and a write endpoint for users with Settings.
- New theme tokens, so every theme draws the label in its own lettering.

**Out of scope:**

- Anything about multiple environments: no environment list, no host matching, no switching. That
  is [#23](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/23) and the issues
  built on it, and whether it can work at all is an open question. See §9.
- A label per user. The name belongs to the site.
- appsettings keys for the new switches. See §5.3.

## 2. Settled decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | The label shows the existing **App name**. There is no separate instance name. | App name shipped in 17.2.0, as a backoffice setting and as the `AppName` key in appsettings. A second name with a fallback between the two would be confusing in both places. |
| D2 | One style: a large **watermark**. No style setting. | It has to stand out. Every style has to be built and checked under five themes, so a second one doubles that for as long as it exists. |
| D3 | The **corner** is a setting, **top right** by default. | Top right is the only corner nothing else uses (§3.2). |
| D4 | **The domain underneath** is a setting, off by default. | A full-screen desktop and an installed app have no address bar. The domain is also the one line a database copy cannot make wrong. |
| D5 | **Off** until an admin turns it on. | A permanent name on every desktop is noise on a site with one environment. |
| D6 | It sits **behind windows**. | It belongs to the desktop, like the faint Umbraco logo already there. Over the windows it would sit on somebody's content. |
| D7 | Stored in the **database**, like the App name. The database-copy risk is accepted. | A database copied from staging to production brings "Staging" with it. `AppName` in appsettings is the way out for anyone who copies databases between environments, and the README already says so for the app name. |
| D8 | An empty name falls back to Umbraco's site name, then to the **domain**. | The chain the installed app already uses, except the last step: the app falls back to "Umbraco", which says nothing on a desktop. |

## 3. What it looks like

### 3.1 The watermark

Large, bold, and stronger than a classic watermark.

- **Sized to the screen:** `clamp(28px, 3.1vw, 72px)`, which is 40px on a 1280px desktop and 60px
  on 1920px. A fixed size is either lost on a large monitor or crowding a laptop.
- **70% white with a full-strength dark halo, the same under every theme.** A classic 30% watermark
  disappeared over the white of a light photo in the mock. The white carries the label on a dark
  wallpaper and the halo carries it on a pale one, so it reads on any ground, a user's own photos
  included.
- **Faded in the ink, never as a whole.** The first build faded the whole label to 60%, which faded
  the halo with it, and on Umbraco 4's own grey the label went faint. With the fade in the ink alone,
  the halo keeps its full strength. It also shows through the translucent white, so the letters read
  as light grey lettering rather than as a see-through watermark.
- **One line**, cut off with an ellipsis rather than wrapping, and capped at 48% of the desktop's
  width, so a long name cannot reach the middle of the screen.
- **The domain**, when shown, sits under the name at 40% of its size.

It never takes a click (`pointer-events: none`). It is plain text in the accessibility tree rather
than `aria-hidden`, because which site you are on matters as much to a screen reader user as to
anybody.

### 3.2 The corner

Measured in the mock and checked against the code:

| Corner | What is already there |
| --- | --- |
| Top left | Where new windows open: (40, 40), cascading down and to the right |
| Bottom left | The start button and the launcher. Windows 11 and macOS centre theirs |
| Bottom right | The clock, Umbraco's own notifications (about 69px up and 24px in) and, on a plain desktop, the faint Umbraco logo |
| Top right | Nothing |

So top right is the default. The other three stay available. None of them breaks anything; a label
under a notification or under the open launcher is covered for a moment, which is what happens under
a window anyway.

The inset from the edges is one constant in `constants.ts` that both the CSS and the geometry test
read. The bottom corners also add `--umbradesktop-taskbar-reserve`, the token the window surface and
the logo already sit on, so macOS's floating dock (67px reserve) keeps the label clear of it without
a special case.

On a 1280px screen the first Content window, 960px wide, covers the start of a top-right label.
From about 1440px up it is clear. That is accepted: the label lives behind windows by design.

### 3.3 Themes

A theme sets the label's lettering and nothing else. Nothing in the theme contract was meant for text
drawn on the desktop, so this adds two tokens, and every theme other than the base sets them.

| Token | What it controls |
| --- | --- |
| `--umbradesktop-desktop-label-font` | The font stack |
| `--umbradesktop-desktop-label-weight` | The font weight |

**Corrected in review: the ink is not a theme's to choose.** The first build gave themes the ink,
opacity and shadow as well, and Umbraco 4 used its own dark ink because its plain desktop and its
own wallpaper are pale. That assumed the label sits on the theme's own ground. It sits on whatever
wallpaper the user picked, and the default, Aurora Flow, is dark under every theme, so the dark ink
vanished for everyone who never changed wallpapers. The fix was to take the choice away: one white
with a dark halo, which reads on any ground, and the two lettering tokens above.

**Corrected in the build: the font is a token of its own.** This section first said the label would
read `--umbradesktop-app-font`. It cannot: that is an app token, for apps inside windows, and
`tokens.test.ts` refuses any `--umbradesktop-*` a chrome component reads that is not in the chrome
list, which is how a chrome name is kept out of the app namespace. The themes put fonts on the rest
of their chrome through their own stylesheets, so a fifth token set to the same font constant is the
chrome equivalent. Under the Umbraco theme it falls through to the backoffice's Lato.

| Theme | Font | Weight |
| --- | --- | --- |
| Umbraco | the backoffice's Lato | 900 |
| Umbraco 4 | Verdana | 700 |
| macOS | San Francisco | 800 |
| Windows 11 | Segoe UI | 700 |
| Windows 98 | MS Sans Serif | 700 |

The tokens join `UMBRADESKTOP_TOKENS` in `theme/types.ts`, and `tokens.test.ts` then fails until a
chrome component reads them, which is how the list and the CSS are kept in agreement.

## 4. Where the text comes from

- **The name** is `IAppIdentityResolver.ResolveName()`, unchanged: `AppName` from appsettings, then
  the stored App name, then `Umbraco:CMS:Hosting:SiteName`.
- **When that is null** the label shows the domain in its place, and does not repeat it underneath.
- **The domain** is the browser's `location.host`, never the server's idea of it. The Connections
  status screen does the same for its local row, for the same reason: behind a proxy, an instance
  does not reliably know its own public address.

One pure function decides it, `(name, host, showDomain) → { name, domain | null }`, in its own file
with its own test, following `group-apps.ts`.

## 5. Settings

### 5.1 The Site screen

- **App name.** The existing field, with a new hint, because the name now does two jobs. Something
  like "What this site is called, on the installed app and on the desktop. Leave empty to use the
  site's own name."
- **Show the name on the desktop.** A `uui-toggle`, like the switches under General and Taskbar.
  - **Corner:** Top right, Top left, Bottom left, Bottom right.
  - **Show the domain underneath:** a `uui-toggle`, with a hint that it helps full screen or in an
    installed app, where no address bar shows it.
- **App icon.** Unchanged.

Corner and domain show only while the label is on. Every control saves on change and then re-reads,
as the name and icon already do. All terms go in both `en.ts` and `nl.ts`.

**Corrected in review: the screen is grouped, and nothing on it hides.** Built as above, the screen
read as one run of headings and hints with no edges: the label's options were indented under a side
rule, the icon's button and guidance appeared only in Custom mode, and the preview hung off the end
of the icon setting. Luuk's call, made against a second mock: the screen became four `uui-box`es.

1. **Preview.** The desktop with the label on it, and the tile the installed app gets. Its own box
   and first, because it shows all three groups below it at once, and at the top it stays in view
   while the name is typed. The desktop is the user's own, in the theme and wallpaper in force (Luuk's
   explicit ask), because the label is white with a halo precisely so it reads on any wallpaper, and
   only the real one shows whether it does. It is the theme picker's miniature with the real label
   component slotted into it, so it is drawn by the same code at desktop scale. Always drawn: with
   the label off the miniature stays, with a caption saying the name is not shown.
2. **Name.** The App name alone, because the label and the installed app both use it.
3. **Desktop label.** The switch, the corner and the domain as three rows. Corner and domain are
   disabled while the label is off, not hidden, so switching it does not rearrange the screen under
   the pointer.
4. **Installed app.** The icon: the two radios, then the chosen image and its button, always there
   and disabled until "Your own image" is picked, then a shortened guidance line.

The option indent went with the regrouping. Inside a box, a row of its own is what says the corner
belongs to the label.

One bug surfaced with it: renaming the site left the old name on the desktop until a refresh,
because the label context read the name when the desktop loaded. The Site screen now reads the label
again after every save.

### 5.2 Storage

A second key-value document, `Umbraco.Community.UmbraDesktop.DesktopLabel`, holding
`{ Show, Corner, ShowDomain }` with enum names in the JSON. It deliberately does not join the app
identity document:

- **Every user reads this one.** The app identity GET is Settings-only, and it carries lock flags
  and a preview URL that an editor has no use for.
- **One document means every write carries every field.** The app identity document already lives
  under that rule. Adding three fields to it would widen the rule for no gain.

It is read field by field and tolerantly, the way `AppIdentityResolver` reads its document, so an
unreadable corner costs the corner (back to top right) and not the switch. With nothing stored: off,
top right, no domain.

### 5.3 No appsettings for the switches

Only the name differs between environments, and `AppName` already covers that. The switches can be
the same everywhere, so a database copy carrying them is harmless. If CI control is ever wanted, the
options class gets a nullable property per switch, with a lock in the UI, exactly as `AppName` and
`AppIcon` have.

## 6. API

One controller, `Api/DesktopLabelController.cs`, on `umbradesktop/desktop-label`. The segment must
stay `umbradesktop` with no hyphen: `generate-openapi.js` filters on that prefix, and a mismatch
produces an empty client silently.

- **GET** returns `{ name, show, corner, showDomain }` and is gated on
  `AuthorizationPolicies.BackOfficeAccess`. It is the first endpoint in the package that is not
  Settings-only, and it has to be: an editor with nothing but Content is exactly who the label is
  for. The name is already public in the anonymous manifest, so nothing new is exposed.
- **POST** takes `{ show, corner, showDomain }` and adds `SectionAccessSettings`, as the app
  identity write does. It returns 204 rather than an empty 200, which the generated client cannot
  read, and 400 for a corner it does not know.

The client is regenerated with `npm run generate-client`, which needs the test instance running.

## 7. Components

**Front end:**

- `desktop/desktop-label/desktop-label-text.ts` and its test: the text decision in §4.
- `desktop/desktop-label/desktop-label.context.ts` and its token: fetches the label on creation,
  exposes it as observable state, and has a `save` that posts and re-reads. The desktop element
  provides it beside the settings context, so the Site screen reaches it from the settings modal the
  way the Appearance screen already reaches the settings context. The two server calls sit behind a
  small source interface, so the tests hand it a stand-in server rather than mocking the client.
- `desktop/desktop-label/desktop-label.element.ts`: draws the label. `components/desktop.element.ts`
  places it between the logo and the window surface, so windows paint over it.
- `settings/categories/site/desktop-label-settings.element.ts`: the three controls, in the Site
  screen's Desktop label box.
- `settings/categories/site/site-preview.element.ts`: the Preview box's contents. It consumes the
  settings, theme and label contexts itself and takes the name and icon from the Site screen, which
  holds them as just saved. The miniature is `umbradesktop-theme-preview`, which gained a slot: what
  is slotted in lands in its scene before the window, laid out in desktop pixels and shrunk with the
  rest. It also declares the taskbar reserve the way `desktop.element` does, so a bottom corner
  clears the miniature's taskbar.

**Corrected in the build: the label is a chrome component of its own.** This section first said the
desktop would draw it itself, on the grounds that `tokens.test.ts` counts five components. It
counts seven, and its own comment makes adding a new one the standing rule. A separate element can
also be mounted under each theme's palette and measured, which is what the geometry tests in §8 do.
For the same reason the Site screen's controls are an element of their own: that screen shows
nothing but a loader until the app identity has loaded from the server, so nothing inside it could
be tested.

A failed GET draws no label, quietly. The desktop must never fail to paint because of an optional
extra. Other users see a change on their next load. There is no push, and a label is not worth one.

**Server:**

- `Api/DesktopLabelController.cs`, and a `DesktopLabel/` folder holding the stored document and its
  reader.
- Tests beside the existing ones in `Umbraco.Community.UmbraDesktop.Tests`.

## 8. Tests, written first

**Front end**, in web-test-runner:

- The text: the name when there is one; the domain when there is none; the domain line only when it
  is switched on and a name exists; never the domain twice.
- The element: nothing when off; each corner where it should be; bottom corners measured above the
  taskbar reserve under every theme, because deriving a number only makes it consistent with itself
  (`docs/theming.md` §4); a long name cut off rather than wrapped; under every theme and variant, an
  ink at least half strength, the label as a whole never faded, and at least 28px.
- In a real desktop: the label placed after the logo and before the window surface, with no z-index
  of its own; and under every theme the same white ink with a halo at least 70% strong that
  contrasts with it at 3:1. The ground is deliberately not measured, because it is whatever
  wallpaper the user picked: the ink stands out on a dark one and the halo on a pale one. The first
  version measured each theme's ink against its own desktop, which is what let Umbraco 4's dark ink
  pass while it vanished on the default wallpaper.
- The context: it reads on creation, holds nothing when the read fails, and after a save holds what
  the server kept rather than what was sent.
- The controls: each one saves all three switches, with only its own changed; corner and domain
  stay drawn and disabled while the label is off.
- The preview: the wallpaper, theme and variant in force; the real label slotted into the
  miniature, under the Site screen's name rather than the context's; the miniature kept with the
  label off; following the label as it changes; fitted to the width it is given; the icon and name
  on the tile.
- The Site screen: four boxes in order; the image button always there, disabled on the default icon
  and when configuration owns it; the preview handed the server's name and icon; the label read
  again after a rename.
- The theme miniature: slotted content before the window at desktop scale, and a taskbar reserve.
- `tokens.test.ts` passing with the two new tokens, and the label added to the components it scans.
- `parity.test.ts` passing with the new terms in both languages.

The contrast helpers that `app-tokens.test.ts` kept to itself moved into `theme/contrast.ts`, so the
halo test measures with the same formula rather than a second copy of it.

**Server**, in `dotnet test`:

- The defaults when nothing is stored.
- A round trip of each field.
- A stored document with a bad corner reads as top right and keeps its other fields.
- An unknown corner on POST is a 400.
- The GET is not Settings-gated.

Then `npm run build`, `npm test`, `dotnet build -c Release` and `dotnet test`. `npm test` does not
type-check and `tsc` renders nothing, so neither run stands in for the other.

### 8.1 The mock

The decisions above were made against an HTML mock: all five themes, three styles, four corners,
five wallpapers (none, the default Aurora Flow, the theme's own, a dark photo and a light photo),
with a Content window where new windows open. It is built from a template, with the real Umbraco
mark read from `loader-ring.ts` and the package's own wallpapers inlined, and it pre-renders every
view so it still shows them in a viewer that runs no scripts.

It is not in the repository yet. The two photos come from the test instance's media rather than
from anything this repository owns, so committing it would mean either dropping them or checking
where they came from first.

## 9. Considered and dropped

- **The taskbar badge from [#23](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/23).**
  Always visible, but small, and the taskbar is filling up, with a full-screen button proposed in
  [#90](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/pull/90). A badge by the clock
  reads as status. A name across the desktop reads as identity, which is what was asked for.
- **An environment list with host matching**, the configuration #23 designed. It only pays off once
  switching ([#28](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/28)) is built,
  and whether multi-environment works at all is uncertain. A "match environment name" toggle can
  join the name chain in §4 later without changing anything here.
- **A separate instance name** beside the App name. Two names with a fallback between them, in the
  UI and in appsettings, for a distinction nobody setting them would feel (D1).
- **Storing the label per domain**, so a copied database shows nothing rather than the wrong name.
  Safe, but more to explain, and a site reached on two domains needs it set on each. The risk was
  accepted instead (D7).
- **A tag or a caption.** The tag reads on any wallpaper but is small and quiet. The caption fails on
  the light photo and under Umbraco 4. Both are in the mock.
- **A style setting.** D2.
- **On by default.** #23 decided the opposite for its badge. For something this large, on every
  desktop of every site with only one environment, opt-in is the better default (D5).
- **Over the windows.** Always visible, but it would sit on somebody's content (D6).
- **The domain only when there is no address bar**, through the `display-mode` media queries.
  Clever, but a switch is predictable, and a switch is what was asked for.

## 10. Definition of done

- [x] `npm run build`, `npm test` (1155 passing), `dotnet build -c Release` and `dotnet test` (182
      passing) all pass, and none of the Release build's warnings is from this work
- [x] Verified in a browser against the test instance: the label reads the server's answer, and
      the switch, the corner and the domain each save through the Site screen and redraw the label
      in place. The corner measured 20px in and 70px up, the 50px reserve plus the inset. The
      regrouped Site screen checked the same way: its preview follows the theme and wallpaper in
      force (Umbraco over Aurora Flow, Windows 98 over Golden Valley), and corner and domain grey out
      while the label is off
- [x] **README.md**: a line in the Features list, and a section after "Installing the backoffice as
      an app" that points back to the App name for where the text comes from. The paragraph on
      restoring databases mentions the label too, and the Documentation section links this file
- [x] **`umbraco-marketplace-umbraco.community.umbradesktop.json`**: `Tags` gain "site name",
      "environment name", "environment label" and "watermark". `Description` unchanged: this does not
      change what the package is
- [ ] **A screenshot** in `docs/screenshots/` and the `Screenshots` array, since it changes what the
      desktop looks like. Left for a person to take, as the installed app's was: it wants a desktop
      somebody likes the look of, captured at the size the README should show it, since Markdown
      cannot resize an image
- [x] **`docs/theming.md`**: the label in the palette table in §3, saying a theme sets its lettering
      only, and a line in the §7 checklist to look at the label over the theme's own wallpaper and a
      photo
- [x] **`docs/design/`**: this file
- [x] **`backoffice/public/umbraco-package.json`**: did not change, as predicted
- [ ] **Seen by an editor with Content and nothing else.** Covered by the controller test that pins
      the read to `BackOfficeAccess` and keeps `SectionAccessSettings` off it, but not tried as such a
      user in a browser, which would have meant creating one

## 11. Open questions

- **High contrast.** The label could draw in fully opaque white under high contrast. The resolved
  theme already knows (`highContrast`), but nothing passes that to the desktop's CSS yet. Not done:
  it is small, but it is new plumbing, and the halo already carries the label on any ground.

The corner control was settled in the build as a `uui-select`, the same control the Language screen
uses for its choices.

## 12. Notes from the build

- **A fresh worktree has to build its front end before its first `dotnet build`.** The running
  instance serves a package's `wwwroot` from the static web assets manifest written at build time,
  and files that did not exist then are not served. Build the .NET side first and the instance
  serves none of `App_Plugins/Umbraco.Community.UmbraDesktop/`, so the package is never registered
  and the Desktop section simply does not exist, with no error anywhere. `npm run build` and then
  `dotnet build` fixes it.
- **`ManagementApiControllerBase` already requires backoffice access.** The read-permission test
  passed against a stub with no `[Authorize]` at all, which is why it was checked the other way
  round as well: adding `SectionAccessSettings` to the class makes it fail. The attribute on the
  controller is redundant with the base class, and is there so the gate is a visible decision.
- **Chrome reports a computed `color-mix()` as `color(srgb r g b)`.** The Umbraco theme's desktop
  ground is one, so the shared contrast helper now reads that form.
- **A bare `UmbElementControllerHost` does not connect its controllers.** A test that provides a
  context through one has to call `hostConnected()`, or consumers never find it and the element
  quietly draws nothing, which looks exactly like a broken element.
- **`overflow: hidden` clips a `text-shadow` at the padding edge.** Each line of the label clips its
  overflow so a long name ends in an ellipsis, and the 18px outer layer of the halo stopped dead at
  the edge of each line: a hard shadow edge, easy to miss on a busy wallpaper and plain on Windows
  98's teal. Each line now pads by the halo's reach and takes it back with a negative margin, in a
  flex column so the vertical margins add rather than collapse. The halo is a list of layers in
  `desktop-label.element.ts` that builds both the `text-shadow` and that padding, and a test reads
  the computed shadow and holds every side's padding to its reach.
- **Fit a miniature by measuring a box its scale cannot resize.** The preview first observed its
  own figure, and setting the scale changed the figure's height, which the observer reported again
  in the same frame: the browser raises that as "ResizeObserver loop completed with undelivered
  notifications", and the test runner counts an uncaught error as a failure. Its symptom there was
  every test in the file timing out together while each one had finished in milliseconds. The box
  now takes its height from `aspect-ratio` and the miniature is positioned over it.
- **A background tab renders no frames.** web-test-runner runs files in parallel tabs, and in one
  that is not in front neither `requestAnimationFrame` nor a `ResizeObserver` callback ever comes.
  The preview's tests passed alone and all timed out in the full run. The preview now measures once
  in `firstUpdated`, which needs no frame, and observes only for later changes.
- **`umb-app` has a `min-width` of 920px.** In a narrower window the whole backoffice, the desktop
  included, runs off the right edge, so a label that measures past the window there is correct
  against the desktop it sits in.
