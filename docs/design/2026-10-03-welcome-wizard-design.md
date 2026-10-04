# Welcome wizard: design

> The first time somebody opens the desktop, a full-screen wizard says welcome and asks three
> things: which language, which theme, and whether the desktop should open when they sign in. Every
> page is already answered, and one button in one place gets you through all of it.

- **Status:** Designed and built 2026-10-03, uncommitted
- **Date:** 2026-10-03
- **Branch:** `claude/first-time-setup-screen-a6c41e`
- **Issue:** [#60](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/60), narrowed to
  the wizard. The "what changed" half moves to
  [#41](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/41), see §9
- **Target:** Umbraco CMS **v17**, package `Umbraco.Community.UmbraDesktop`

---

## 1. Goal & scope

Five themes ship and most people never find out. Opening the desktop on sign-in is the setting that
turns the desktop from a place you visit into the place you work, and it sits in a settings panel
nobody opens on day one. The language matters most for people whose backoffice is not in their own
language, and for the wizard itself as more languages arrive. A wizard puts these in front of a new
user once, at the one moment asking is welcome rather than intrusive.

**In scope:**

- A welcome animation, then three pages: **Language**, **Theme**, **Open the desktop when I sign
  in**.
- Deciding who is new, and showing the wizard to them once.

**Out of scope, on purpose:**

- More pages. Install as an app, pinning apps, regional format and clock, and a "where things are"
  tour were all considered and cut (§8). Lean is the requirement, not a starting point.
- Telling existing users what changed after an update. That is #41.
- Asking existing users a question after an update (#60's old "migration prompts"). Dropped, see §9.
- An admin switch to turn the wizard off for a whole site. Possible later, not needed to ship.
- An extension point. Packages cannot add pages.

## 2. Settled decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | **Full screen**, covering the desktop, and finished before the desktop is usable. | It is a setup step, not a notice. A popup over a usable desktop invites closing it unread. |
| D2 | **Three pages:** Language, Theme, Open on sign-in. | Each changes the first day noticeably and is hard to find later. Anything else can wait for the settings panel. |
| D3 | **Language first.** | Everything after it is then in the person's own language, which matters more with every language the desktop adds. |
| D4 | **Every page shows its default visibly selected, and the one main button reads Next**, **Done** on the last page. It sits bottom right, never moves and is always filled. **Back** sits bottom left, from the second page on. There is no Skip. | A choice visibly selected on screen is a choice made, so going on with it is Next, not Skip. That is also what Windows and macOS do: a pre-selected region gets **Yes** or **Continue**, and Skip appears only where nothing is selected (§4). The alternative, nothing selected plus Skip, does not fit: an empty theme page looks unfinished, and a switch cannot show "nothing". Three clicks in one spot still finish the wizard. Revised the same day: the first version read Skip until the page changed, GNOME's pattern, and was dropped for this reason. |
| D5 | **Never comes back once finished.** There is no "remind me later". | A setup screen that returns is a nag. Everything it asks is in Desktop settings. |
| D6 | **New means: no desktop settings on the account and none in this browser.** | The account is the durable record (#29), so a second browser does not re-onboard anybody. A browser cache without an account record is an existing user that migration `0001` is about to move, not a new one. |
| D7 | **No wizard when the account cannot be reached.** | The wizard could not record that it was finished, so it would return on every load. |
| D8 | **Theme-neutral**, like the boot splash and the migration screen. | The wizard is choosing the theme. Painting it in one of the five would prejudge the answer, and it is the machine talking about itself, not desktop chrome. |
| D9 | **One animation:** the boot ring closes and **Welcome to UmbraDesktop** fades in, with one line under it. | It continues the splash the person may just have seen, so loading turns into arriving. Option 2 (welcome cycling through languages) was cut because the language page follows immediately. |
| D10 | **Picking a theme also sets that theme's wallpaper**, once. `wallpaperFollowsTheme` stays off. | A theme on the wrong wallpaper is a poor first look. Turning the follow switch on would mean managing the wallpaper for good, which nobody asked for. |
| D11 | **No "setup done" flag.** The settings record existing is the mark. | Done writes the record, and nothing else writes it while the wizard is up (§6.2). A flag would be a second answer to the same question, and existing users would not have it. |
| D12 | **The welcome animation moves on by itself** after about 5 seconds (2.5 at first, see §3.1). A click or any key skips the wait. | Nobody should have to press a button to get past a greeting. |
| D13 | **A three-dot step indicator**, centred on the button row, on the three pages. | It shows the wizard is short, which is half of why people do not skip it. On the row rather than above it, so the row is the one place to look. |
| D14 | **Every backoffice language is listed, alphabetically, by its own name only.** A language the desktop is not translated into ends its row in the desktop icon and **English**, with hover text saying what that means for that language. | The page sets the user's backoffice language, the same setting as their Umbraco profile, and every window is the backoffice, so listing only the desktop's languages would stop a German editor choosing German here. Alphabetical is where people look for their language, and their own name is what they look for, as on Windows and Android. Marking only the rows that fall back makes the exception stand out; a mark on every row would mostly repeat the row (Nederlands saying Nederlands). The icon is `icon-desktop`, the one on the header button that opens the desktop, so it already means "the desktop". The subtitle explains it once, so no legend is needed. Grouping into "fully translated" and "desktop in English" was mocked and dropped: a heading over one group made the list lopsided, and two headed boxes were heavier than one quiet mark. |

## 3. The pages

### 3.1 Welcome

The boot splash's mark and arc, drawn by the wizard itself rather than handed over from the splash,
because somebody entering through the header icon never sees the splash. The arc slows, closes into
a full ring, and **Welcome to UmbraDesktop** fades in under the mark, then a line saying three quick
choices follow. About 5 seconds, then the language page follows by itself. A click or any key goes
straight to it.

Revised after the first build: one word for 2.5 seconds went by before it read as a first visit
rather than as more loading, even for somebody who had just opened the desktop on purpose.

Reduced motion: the closed ring and both lines, still, for the same time.

The word is in the backoffice's current language, which on a default install is English. That is
fine: the next page fixes it.

### 3.2 Language

The backoffice languages the Language and region settings category already offers, alphabetical by
their own name, with the current language selected and the list scrolled to it. One name per row,
the language's own. A language the desktop is not translated into ends its row in `icon-desktop`
and **English** (D14). Hovering that mark explains it for that language: "The desktop isn't
translated into Spanish yet, so it shows in English. The backoffice in its windows uses Spanish." The
same text is the mark's accessible name, so a screen reader and a keyboard user get it too, not only
a mouse. The subtitle says it once for the whole list: "Where the desktop isn't translated yet, it
shows in English."

Which languages are translated comes from the desktop's own localization registrations, not from a
list kept by hand, so a new translation removes its mark without anyone touching this page.

Choosing one saves it to the user's Umbraco profile straight away and switches the wizard to it.

The Language settings page asks to reload after a change, because every open window holds its own
copy of the backoffice. No window is open behind the wizard, so the shell's own strings should
switch in place. **This has to be measured in a real backoffice before it is relied on** (§7). If
the shell does not switch live, the fallback is a reload straight back into the wizard on the theme
page, which costs nothing with no windows open.

### 3.3 Theme

The five themes as the same drawn miniatures the theme picker uses (#58), each on its own wallpaper,
with the current theme selected. Nothing behind the wizard changes while choosing; the choice shows
when the wizard closes (§3.5).

Under the five, **Backoffice theme**: Umbraco's own Light, Dark and High contrast, read from the
theme registry as Desktop settings reads them. Added 2026-10-03 after the first build, at Luuk's
request: they are part of choosing a look, so they share this page rather than adding a fourth. A
choice applies at once, through the desktop's theme context into core's, because core owns and
stores it per browser, as the language goes to the profile at once. The miniatures repaint in it.

Each section is headed by its name and the part of the screen it changes: **Desktop theme**, the
desktop around the windows; **Backoffice theme**, everything inside them. Umbraco calls its setting
"Theme", so the desktop now uses "Backoffice theme" everywhere, Desktop settings included, where it
used to say "Backoffice colours" to avoid two things called theme. Saying which part of the screen
each one changes does that job better than a different word.

Under high contrast the miniatures split their window black and white. Umbraco's high contrast is a
light scheme, so painted from its tokens four themes looked like Light and macOS, which states its own
colours, looked dark: nothing in the row said "contrast". The theme picker in Desktop settings does
the same.

### 3.4 Open the desktop when I sign in

One switch, off, with the same label Desktop settings uses, and one line under it saying it takes
effect from the next visit. That is not a limitation to hide: the setting is read during boot,
before the desktop exists, so it cannot apply to the visit that set it.

### 3.5 Done

Saves the theme, its wallpaper and the sign-in switch in one write, then fades the wizard out over
the desktop in the chosen theme. That reveal is the payoff for the theme page.

A small three-dot step indicator sits centred on the button row on the three pages (D13).

## 4. What other systems do

Checked 2026-10-03, so the button behaviour is familiar rather than invented:

- **Windows 11:** the main button is always bottom right. Pages you are expected to skip (a second
  keyboard layout) put **Skip** in that slot; others put **Skip for now** to its left with **Next**
  on the right.
- **macOS:** **Continue** bottom right, **Back** bottom left. Skipping is a secondary button
  (**Set Up Later**, **Not Now**), sometimes with a confirmation.
- **Android (Pixel):** a bottom bar with **Skip** as a text button on the left and **Next** filled
  on the right.
- **GNOME Initial Setup:** one button, top right, that reads **Skip** until the page is done, then
  turns into a highlighted **Next**.

D4 follows Windows and macOS: every page here has a visible default, which is the case where both of
them say Next or Continue rather than Skip. GNOME's Skip-until-changed button was the first design
and was dropped (D4).

## 5. Who sees it

| Account record | Browser cache | Account reachable | Result |
| --- | --- | --- | --- |
| present | any | yes | No wizard. Existing user. |
| absent | present | yes | No wizard. Migration `0001` moves the cache to the account. |
| absent | absent | yes | **Wizard.** |
| any | any | no | No wizard. Desktop as today for the session. |

One known consequence: settings are written only when something changes, so a current user who has
never changed a single setting has no record and sees the wizard once. Accepted. It is three
pre-answered pages, and that user never chose a theme either.

Closing the tab halfway leaves no record, so the wizard shows again next time. Correct: it was not
finished. The language, if changed, is already on the profile and the language page shows it
selected.

## 6. How it fits the code

### 6.1 Owner

The desktop element owns the wizard, exactly as it owns the migration screen, and makes the desktop
behind it `inert`. Never the launcher: `launcher.element.ts` explains at the top why a modal opened
from the launcher loses its context on the first click and then hangs silently.

### 6.2 Detection

`UmbraDesktopSettingsPersistence.load()` currently collapses "the account answered and has nothing"
and "the account did not answer" into one outcome (`source: 'defaults'` or `'cache'`). The wizard
needs them apart, so `load` also reports what the account said, as `account: 'present' | 'empty' |
'unreachable'`, beside `source` rather than as a new value of it: `source` still answers where the
painted settings came from, and the §5 table needs both. `welcome/detection.ts` is that table. The settings context
decides `welcome` the same way it decides the migration screen today: before `loaded` flips, so the
wizard is part of the first painted frame rather than a beat later, and the boot splash lifts onto
it rather than onto a desktop about to be covered.

The wizard and the migration screen never coincide: the migration needs a browser cache and the
wizard needs none.

Nothing writes the settings record while the wizard is up. The desktop is covered and inert, so no
setting can change, and migration `0001` has nothing to move. This is what lets the record stand in
for a flag (D11); a test pins it.

### 6.3 Saving

Language through the same `updateProfile` call the Language settings category uses. Theme, its
wallpaper (`themeWallpaper`) and `bootIntoDesktop` through the settings context's existing save, in
one write, on **Done**. A failed save leaves the choices applied for the session and no record, so
the wizard returns next time. Saving through the context also writes the browser cache, which is
what `bootIntoDesktop` is read from at boot.

### 6.4 Files

A new `welcome/` folder beside `migrations/`: the screen element, one element per page, and the pure
parts (the button label rule, the detection table) in files of their own with tests beside them.

## 7. To measure before relying on

- **Live language switching** with no windows open (§3.2). Measure in a real backoffice, not the
  test runner, which has no backoffice localization behind it.
- **The splash handoff** when a new user arrives with the splash up (an installed app always opens on
  the desktop). The wizard's ring has to sit where the splash's ring was, at the same size, or the
  continuity in D9 becomes a jump.
- All five themes behind the reveal, and the theme previews under a dark backoffice.

Measured 2026-10-03 in the TestInstance (Umbraco 17, headless Chrome, 1440x900):

- **The language switches live.** Choosing Nederlands saved the profile and turned the wizard Dutch,
  head, list marks and button, in about 1.2 seconds, with no reload. The fallback in §3.2 is not
  needed. Umbraco does the work: `updateProfile` refreshes the current user, and the current-user
  context loads that user's language.
- **The ring sits where the splash's does:** centred on the viewport, 150px. The hand-off from a
  real splash was not seen, because a new user has no browser cache and so never boots under one.
- **Done** wrote one settings record (theme, its wallpaper, `wallpaperFollowsTheme` off), and a reload
  did not show the wizard again. macOS and Windows 98 were checked behind the reveal, and the theme
  previews under a dark backoffice.
- **A bug the tests had passed:** the hidden radio in each row was positioned against the screen,
  outside the list's scroll area, so choosing a language far down the list scrolled the whole wizard
  off its head and buttons. Each row now positions its own radio, and a test pins it.

## 8. Considered and cut

- **Install as an app.** Useful, but installing raises the app's name and icon, which is too much
  for a first visit. Chrome and Edge only, too.
- **Pin a few apps.** The biggest page by far. Can be added later.
- **Regional format and clock.** Language alone on the language page; the rest stays in settings.
- **A "where things are" page.** Help covers it, and a tour is the page people skip hardest.
- **Welcome in every language, handwritten welcome, the desktop building itself, an iris through the
  mark.** One animation (D9).
- **Skip and Next as two buttons**, **a button that reads Skip until the page changes**, and **a
  "Skip setup" escape** in a corner. With a visible default on every page, Next is the honest label
  (D4).
- **Listing only the languages the desktop is translated into**, **grouping them under headings**,
  **an EN badge with a legend**, and **the language's name in the current language on every row**.
  See D14.
- **#60's prompt store** (answered/declined/pending per prompt id, a first-seen version stamp). It
  existed for migration prompts, which are dropped. Nothing left needs it.

## 9. What happened to the rest of #60

#60 described two features sharing one store: this wizard, and "migration prompts" asking existing
users to decide something after an update. They are different jobs, and the second rested on a rule
(a prompt only when no default can be picked) that has had no case yet. It is dropped rather than
deferred. Telling people what changed, which is what an update notice is actually for, is #41: a
window after an update that you close.

## 10. Testing

Tests first. The cases worth writing before anything else:

- The detection table in §5, every row, including the unreachable account.
- The main button reads Next on every page but the last, Done there, and never moves.
- Next on every page without changing anything leaves the defaults and still writes the record.
- The list is alphabetical by native name; a language without a desktop translation carries the
  mark with its explanation as accessible name, and one with a translation does not.
- Done writes theme, wallpaper and `bootIntoDesktop` in one save; a failed save leaves no record.
- Nothing writes the settings record while the wizard is open (D11).
- The desktop behind is inert while the wizard is up, and focus lands on the main button.
- The wizard renders under all five themes and no theme hides it.

Then `npm run build` and `npm test`, and the measurements in §7 in a real backoffice.

## 11. Definition of done

- A user guide page, `docs/user/getting-started/welcome.md`, linked from `first-steps.md` and the
  category README.
- README: no change. It does not change what someone deciding whether to install would want to know.
- Marketplace: `onboarding` in `Tags`. A screenshot of the theme page if it is good enough to sell.
