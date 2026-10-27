# Launcher search — Design

> Typing in the launcher searches the desktop's apps and Umbraco's own search sources together,
> and every result opens as a desktop window. The native search modal is no longer used, which is
> what fixes issue #6: its results navigated the whole backoffice away from the desktop.

- **Status:** Implemented
- **Date:** 2026-10-13
- **Issue:** [#6](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/6)

---

## 1. Why not just fix the modal's links

Issue #6 proposes catching the native modal's result clicks in the capture phase and opening a
window instead. That would work, but it leaves the search itself as it is, and it is not what a
desktop's search should be:

- It cannot find the desktop's apps. On every OS the launcher's search finds apps first.
- It searches one source at a time (Documents, or Media, or Data Types), chosen by tab, so you have
  to know where a thing lives before you can find it.
- It is a modal laid over the desktop rather than part of it, and it does not follow the theme.
- The fix leans on two core internals: the `search-item` class on the result anchor, and
  router-slot's `data-router-slot` opt-out.

Owning the results removes the problem rather than intercepting it: a result the desktop draws is
opened by the desktop, so nothing reaches the router.

## 2. How other systems do it

- **Windows 11.** Type in Start. A best match, then results grouped by kind, with filter tabs (Apps,
  Documents, Settings) along the top to narrow to one kind.
- **macOS Spotlight.** One bar in the middle of the screen, a top hit, results grouped by category.
  Recent versions add filters and actions on a result.
- **GNOME.** Type anywhere. Apps in one row first, then one row per application that supplies
  results, each opening into its full list. This is the closest match to Umbraco's model, where
  each search source is registered separately.
- **Raycast and Alfred.** Results can be actions as well as things to open.

What this design takes: apps first (all of them), grouped sections per source (Windows, GNOME), and
drilling into one source (Windows' tabs, GNOME's rows). What it leaves: actions (§8), and a separate
surface for search (option B below).

## 3. Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | **Search lives inside the launcher.** Typing replaces the launcher's body with results; an empty field is the launcher as it is. | Matches Windows Start and GNOME, and the way All apps already works. A separate Spotlight-style bar was considered and is a new surface for five themes to style. |
| D2 | **Apps, Documents and Media are full sections; every other source gets a compact section of its own.** Revised in §11: this first said every other source folds into one "Also in" line with counts. | Data Types, Templates and the rest are rarely what someone is looking for, so they get fewer results each. Umbraco already hides each source from users without its section, so most editors never see the settings sources at all. |
| D3 | **Sources come from core's `globalSearch` registrations**, not a list of our own. | The section-permission conditions are on those manifests, not on the providers, so reading them gives the same gating as the native modal. Third-party sources appear without any work here. |
| D4 | **Each source's provider is called directly with paging**, not through the `globalSearch` api. | `UmbGlobalSearchBase.search` passes only `{ query }`, so the server's default `take=100` applies. Ten sources at 100 items per keystroke is heavy; full sections ask for 5, folded ones for 1, because they need only the total. |
| D5 | **Help pages are a folded source.** | Help already has a search over the docs. Whether its results are useful next to content is to be judged in a running backoffice; removing it is one line. |
| D6 | **Open windows are not searched.** | Opening a result that is already open focuses its window, through the window manager's existing `allowMultiple: false`. That is enough. |
| D7 | **No desktop actions** (settings, themes, log out). | To be useful, "dark" would have to land on the exact setting, and Desktop settings cannot open on one box today. They are rare tasks; Help covers "how do I change the theme". |
| D8 | **No keyboard shortcut** in this version. | A key pressed inside a window goes to that window's document, so a desktop-wide shortcut needs a listener in every frame. It pairs with the taskbar button (§8). |

## 4. Behaviour

**The field.** The launcher's search button becomes a text field, focused when the launcher opens,
so opening Start and typing searches straight away.

**Empty and not.** An empty field shows the launcher as it is now. As soon as there is text, the body
below the header row is replaced by results. The panel holds its height (the launcher's existing
`holdHeight`, as in All apps) so it does not jump as results come and go.

**The mixed view, top to bottom:**

1. **Apps.** Matched locally and instantly, with no server call. Up to 6.
2. **Documents.** The best 5. Each shows its location ("Home › News") from the ancestors the document
   provider already returns.
3. **Media.** The best 5.
4. **Also in.** One line listing every other source that found something, with its count:
   "Document Types 2 · Templates 1 · Help 3". A source with no results is not listed.

A full section with no results is not shown. When nothing at all is found, one line says so.

**Drilling down.** Each full section's header carries **Show all (24)**, and each "Also in" entry
opens its source the same way: the source's full list inside the launcher, loading more as you
scroll to its end. **Back** returns to the mixed view, with the text kept.

**Keyboard.** The arrow keys move through results across sections, and Enter opens the selected one.
The first result is selected as results arrive, so typing and pressing Enter opens the best match.
Escape clears the text (the existing `escapeClearsFilter`); with the field empty it closes the
launcher, as anywhere else. In a drilled-down list, Escape goes Back first.

**Opening.**

- An app launches as from a tile.
- A content result opens a window showing only its editor (`workspace-only`), titled and iconed from
  the result. Already open: that window is focused.
- A Help result opens Help on that page and heading.
- A result with no `href` is shown but cannot be opened, as in the native modal.

The launcher closes after anything is opened.

## 5. Architecture

A new `search/` folder beside `launcher/`. Each unit can be understood and tested on its own.

### 5.1 Sources (`search/search-sources.ts`)

Observes `globalSearch` manifests through an extension initializer, which respects their conditions,
and resolves each one's `meta.searchProviderAlias` to its provider api. Produces a list of
`{ alias, label, weight, prominence, search(query, paging) }`, ordered by weight.

- `prominence` is `full` for `Umb.GlobalSearch.Document` and `Umb.GlobalSearch.Media`, `folded`
  for everything else. One constant holds the two aliases.
- Documents and media are passed the backoffice's current culture, as their own global search
  wrappers do from `UMB_VARIANT_CONTEXT`.
- The Help source is added here as a folded source whose `search` runs Help's existing
  `help-search.ts` over the docs, loaded on its first query.

### 5.2 Engine (`search/search-engine.ts`)

Takes the query and the user's apps and produces one state object for any view to draw:
`{ query, apps, sections: [{ source, items, total }], folded: [{ source, total }], pending }`.

- Waits 300 ms after the last change before asking the server, as the native modal does. Apps are
  matched on every change without waiting.
- Numbers each query and drops an answer for a query that is no longer current.
- A source that throws or returns an error is left out of the state; the rest still show.
- `more(source)` fetches the next page of one source, for the drilled-down list.
- App ranking: a name starting with the query, then a word in the name starting with it, then
  containing it. Matched on the translated name, as All apps filters.

The engine knows nothing about the launcher. That is the seam for the taskbar button and a Search
app (§8).

### 5.3 Opening a result (`search/open-result.ts`)

Pure: turns a result item into an `UmbraDesktopApp` for the window manager.

- URL: the item's `href` resolved under the backoffice path. The built-in hrefs are relative
  (`section/content/workspace/document/edit/{id}`), except member type's, which has a leading
  slash; both normalise to `/umbraco/section/...`. Anything that does not land under
  `UMBRADESKTOP_BACKOFFICE_SECTION_PATH` is refused.
- Alias `umbraDesktop.search:<entityType>:<unique>`, with `allowMultiple: false`, so the same item
  twice is one window.
- `chromeProfile: 'workspace-only'`, with the size and resize floor the AI tool already uses for
  the same shape.
- The AI chat's `ai/open-window.ts` builds the same thing for documents and media. It moves onto
  this function, so the two cannot drift.

### 5.4 Launcher view (`launcher/search.controller.ts`)

A controller rendering into the launcher's own shadow root, as `drawer.controller.ts` does, so the
theme's launcher sheet reaches it without changes to any theme. It adds a `search` mode beside
`launcher`, `drawer` and `arrange`, and a drilled-down sub-state. Result rows reuse the drawer's row
look and the existing search-field tokens; no new theme tokens unless a theme proves to need one.

### 5.5 What is removed

The taskbar's `UMB_SEARCH_MODAL` import and `#onSearch`, and the launcher's `search` event. The
launcher-events test that asserts the event changes with it.

## 6. Error handling

- A failing source is silent: it does not appear, and the others do. A search that finds nothing
  says "No results"; it does not distinguish "nothing" from "every source failed", because the
  editor can do nothing different either way.
- A result whose href is missing or outside the backoffice cannot be opened (§5.3).
- Help's docs failing to load leaves Help out of "Also in" for that session.

## 7. Testing

Tests first, as always. Unit tests:

- **Engine**, with fake sources: grouping into full and folded; counts; app ranking; the debounce;
  a late answer to an old query is dropped; a failing source is left out; `more` appends the next
  page.
- **Opening a result**: every built-in href shape, including member type's leading slash; an href
  outside the backoffice is refused; the alias makes the same item one window.
- **Launcher**: typing switches to results and clearing switches back; Show all and Back; arrow keys
  and Enter; Escape clears, then closes; Escape in a drilled-down list goes Back.

Then a real backoffice. Only that proves the section gating, the real providers' paging and totals,
the document location line, and that a result opens a window rather than navigating. Check with an
admin and with an editor without the Settings section.

## 8. Later, not now

- **A taskbar search button** opens the launcher straight into search, like the Windows 11 taskbar
  search. No new search code: the launcher already is the search.
- **A keyboard shortcut** for the same, which needs a key listener in every same-origin frame (D8).
- **A Search app**: a window on the same engine, with room for paging, several filters at once and
  sorting. A drilled-down list in the launcher could then offer "Open in Search".
- **Desktop actions** (D7) and **recent items** on an empty field, each as one more source.

## 9. Docs and listing

- User guide: `docs/user/launcher/searching.md`, added to the category README and linked from
  `using-the-launcher.md`.
- `umbraco-marketplace-umbraco.community.umbradesktop.json`: `search` in `Tags`.
- README: no change.

## 10. What a real backoffice taught

Checked on a copy of the TestInstance database, as an admin and as a user with only Content, Media
and the desktop, under all five themes. The editor saw Documents, Media and Help only, so the section
gating works as D3 expected. Three things only showed there, and each now has a test:

- **The result Enter opens was unreadable under Windows 98.** It was marked with the hover fill, but a
  theme pairs its hover fill with a text colour under `:hover` only, so Windows 98 drew its navy bar
  behind dark text. It is marked with a ring in the emphasis border colour instead. No token needed.
- **macOS centred every section on its own.** Its sheet centres the children of `.body` for its group
  cards, and the results body is a `.body` too, so each section shrank to its widest row. The base
  now stretches `.body.search-results`, which outranks a theme's `.body`. The list runs the panel's
  full width under macOS; a results-width token could centre it under the search band if that is
  wanted.
- **A short drilled-down list stopped after its first page.** Show more watches for coming into view,
  and an observer reports only changes: when the button was already in view, it reported once, while
  the first page was still loading, and never again. It is observed afresh after every page.

Also worth knowing:

- **Speed.** Results show about 0.36 s after the last key on a warm instance, 0.3 s of which is the
  debounce. The first search after the backoffice starts took about 1.5 s.
- **Help results (D5).** Useful for words about the desktop: "snap" puts Snapping first, and
  "wallpaper" and "theme" find the right pages. For content words they only add a count to Also in
  ("product": Help 5), and a single letter matches most pages. Folded, that costs one entry, so Help
  stays. Some snippets show a table row's pipes, which is Help's own snippet code.
- **Culture.** Search uses the top frame's app language, which core reads from local storage only when
  the backoffice starts. Switching the content language inside a Content window changes that window,
  not the desktop's search, until the desktop reloads. Found by reading core's
  `app-language.context.js`, not measured.
- **Reopening the launcher straight after opening a result** can close it again: when the new
  window's editor finishes loading it takes focus, and the launcher closes when focus moves into a
  window. The same happens after opening any app from a tile, so it is not new here.

## 11. Revised after the owner tried it (2026-10-16)

Two changes, both about the list moving and the room it left unused.

- **One update per pause in typing.** Reversed for apps in §12. Apps were matched on every keystroke while the other sources
  answered after the 300 ms debounce, so the list moved twice for each pause. Now nothing changes
  until the sources answer, and then apps and sources change together. The launcher also keeps its
  own body until the first answer arrives, instead of showing an empty results body first. Apps
  appear about 0.3 s later than before, which nobody notices while typing. Windows 11 Start updates
  in two steps as we did; Raycast and Alfred update once, and feel calmer for it.
- **No "Also in" line.** The panel holds its height while searching, so most of it stayed empty
  while Data Types, Templates and Help showed only a count behind a click. Every source now gets its
  own section, with its first results: more for Documents and Media (full), fewer for the rest
  (compact); the numbers and the layout are in the next point. Show all (N) on any section opens its
  full list as before. D2 is revised accordingly.
- **Results side by side, categories stacked, every app.** On the wide launchers (Umbraco, macOS,
  Windows 11) one list down the left edge left most of the panel empty. The categories stay one band
  each, top to bottom, which is how Windows and Spotlight read: down to the kind of thing, then
  across. Within a band the results are a grid at the launcher's own card width
  (`UMBRADESKTOP_LAUNCHER_CARD_MIN_WIDTH`), best first along the top row: four or five columns in
  Umbraco and macOS, two in Windows 11, one in the 450 px Start menus of Windows 98 and Umbraco 4,
  which stay as they were. Putting the categories themselves side by side was tried first and
  rejected: it mixed them into one grid that no longer read as categories. Apps are no longer
  capped: they are matched locally, there are at most a few dozen, and an app cut off is one a
  person cannot find any other way. Documents and Media now show up to 12 and every other source up
  to 6, enough to fill a few rows; still small against core's default of 100 (D4). The numbers are
  the same for every theme: a narrow Start menu scrolls, as its launcher does, and per-theme numbers
  would need a theme token or search code that knows about themes. The cost is a one-letter search,
  which matches most apps (a name matches when it contains the text anywhere) and pushes the other
  categories down.

## 12. Apps first again (2026-10-27)

§11's one update per pause is reversed for apps. In use it made the commonest search, typing part
of an app's name to open it, wait for a server round trip it never needed: the 300 ms debounce plus
however long the slowest source took. The owner found that more annoying than the list moving.

- **Apps update on every keystroke**, from memory, and the launcher switches to the results body as
  soon as there is text. Enter opens the best app straight away.
- **The sources' results are emptied when the text changes**, not kept until the next answer as §11
  did. Keeping them would put documents found for the old text beside apps for the new one.
- **A loader stands where the sources' bands go** while they answer: `uui-loader` with
  **Searching…**, as a `role="status"` so it is announced. It replaces the empty note until the
  answer says there is nothing.
- **Text that differs only by spaces at its ends is not a new search**, so the space before a
  second word does not empty the results and ask the server for the same ones again.

The cost §11 avoided comes back in a smaller form: after each pause the source bands appear below
the apps, so the list grows once. The apps above them do not move, which is the part a person is
reading while the rest loads.
