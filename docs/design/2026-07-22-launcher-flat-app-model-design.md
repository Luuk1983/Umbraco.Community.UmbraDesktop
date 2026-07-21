# UmbraDesktop — Launcher & flat app-model design

> **Date:** 2026-07-22
>
> **Supersedes** the category/group **tree** in the Phase-2 app-model design
> ([`2026-07-20-phase-2-app-model-design.md`](./2026-07-20-phase-2-app-model-design.md)) and the
> launcher shape in §7 of [`umbradesktop-design.md`](./umbradesktop-design.md), **for the
> launcher's data model and UI**. The curated-catalogue principle stands; what changes is that
> apps become a **flat pool** and the launcher becomes grouped, pinnable tiles rather than a
> section tree. The window/taskbar chrome from the 2026-07-21 polish pass is unaffected.

## 1. Motivation

The section → app hierarchy was an artefact of Umbraco's structure, not something the launcher
needs. By our own definition an *app* is "a self-contained place to do a coherent job", and by
that test a **section is just an app** (with `full-section` chrome). "Content" is the
**Content editor** app; "Media" is the **Media library** app; Log Viewer is a smaller app with
`workspace-only` chrome. They are peers.

Dropping the hierarchy:

- removes the "open the section vs open a tool inside it" split-button problem;
- lets us **group apps for humans** (e.g. a *Diagnostics* group holding Log Viewer, Examine,
  Health Check and Profiling) instead of mirroring where they happen to live in Umbraco;
- matches how the **primary user — a content editor — actually works**: a few repeated tasks,
  rarely browsing Settings. So the launcher optimises for *"my few things, one click"*, which
  makes **Favourites + Recent** first-class rather than deferred.

## 2. The flat app model

**Everything is an app. Grouping is a separate, optional, curatorial layer, decoupled from
Umbraco sections.**

### 2.1 App

| Field | Notes |
|---|---|
| `alias` | Stable id. |
| `name` | **Localization token** (e.g. `#umbraDesktop_appContentEditor`) → the friendly display name. Falls back to the referenced extension's own (already-localized) label when not overridden. |
| `icon` | **Native Umbraco icon alias only** (`icon-*`). Inherited from the referenced extension when not overridden. |
| `ref` / `url` | Destination (registry alias whose URL is inferred, or an explicit URL). Unchanged from today. |
| `chromeProfile` | `full-section` \| `workspace-only` \| `bare`. A "section" is simply an app with `full-section`. |
| `group` | **Optional** curatorial group token (§2.2). |
| `sourceSection` | Section alias — used for **permission gating** (hide if the user lacks it) **and** as the **default group** for uncurated apps. Metadata, not a display parent. |
| `weight`, `allowMultiple`, `defaultSize`, `minSize` | As today. |
| `confidence` | `certified` (curated) \| `uncertified` (auto). Drives the badge + default chrome, as in the 2026-07-20 design. |

### 2.2 Grouping

- A **single, flat, optional** grouping level: an app may declare a `group` (a localization
  token label, e.g. `#umbraDesktop_groupDiagnostics`). No nesting, no section tree.
- Groups are **curatorial and decoupled** from Umbraco's section structure.
- A group *may* declare a default collapsed state later; not required for v1.

### 2.3 Not every section is exposed

Whether a section gets a `full-section` app is a **curation choice, not an automatic rule**.
Content and Media clearly warrant theirs. "Umbraco settings" as a giant catch-all is rarely
what an editor wants — expose it for admins, or skip it and surface only its useful tools as
focused apps.

### 2.4 The auto "More" group

Anything routable that the user can reach but we have **not curated** is derived automatically
(sections, menu-items, dashboards — as in the 2026-07-20 derivation rules) and placed in a
reserved **auto-generated "More"** group, marked with an `auto` badge and the `uncertified`
tier. Each uses its **own native icon** (sections/menu-items already have one); a generic
`icon-box` is the fallback only when an extension ships no icon. Curated apps override freely.

## 3. Launcher UI

### 3.1 Form factor

**Primary: a substantial anchored panel** rising from the start button (editor-first — Favourites
+ Recent + the first group visible immediately, scroll / "All apps" for the rest, no full-screen
takeover to open Content). **Fullscreen launchpad** remains a supported alternative/toggle for
pure browsing and stays the §7 long-term end-state. *(Open point — see §11.)*

### 3.2 Zones (top → bottom)

1. **Search** field (§4).
2. **Favourites** — user-pinned app tiles (native icon + friendly name + pin marker). A deep
   tool (e.g. Log Viewer) can be pinned here to one click, out of its rarely-visited section.
3. **Recent** — recently opened apps.
4. **Curated groups** — each a labelled band of tiles.
5. **More** — the auto group (§2.4).
6. **Footer strip** (§5).

### 3.3 Tiles & interactions

- Tile = native icon + short **friendly (localized) name**. Icon-tile density lets a screen hold
  many apps.
- Click = open (or focus an existing instance when `allowMultiple` is false).
- **Pin / unpin** to Favourites (context action). Drag-to-reorder Favourites is a later nicety.
- Manifest can **pre-pin** a sensible starter set (e.g. Content editor, Media library).

## 4. Search

- The launcher's search field **fuzzy-filters the app tiles live** (over friendly names + group
  labels) — fast for repeat users ("log" → Log Viewer).
- **Content search reuses Umbraco's own modal**: `Umb.Modal.Search` (opened via `umbOpenModal`),
  which owns both the query UI and the results — we do not build a results view. Exposed as a
  "Search content" affordance (recommended: a row/button surfaced from the same field, e.g.
  "Search content for '…'"). *(Open point — unified field vs separate button; see §11.)*

## 5. Session & system actions (footer)

- **User** (avatar + name) → opens Umbraco's native `Umb.Modal.CurrentUser`, which renders every
  `userProfileApp` (edit profile, change password, appearance/theme, history, MFA…) plus its own
  logout. This reuses the whole native user experience — we implement none of it — and largely
  resolves the previously-deferred "session/identity" question.
- **Log out** — a *dedicated* action (the same logout), so it's one click without opening the
  modal.
- **Exit desktop** — a *distinct* action: leave desktop mode back to the classic backoffice
  (the existing behaviour). "Log out" ends the Umbraco session; "Exit desktop" only leaves the
  desktop shell — deliberately separate, like a "Sign out" vs "Shut down".
- **Desktop settings** — reserved slot (gear) for a later panel (wallpaper picker, etc.).

## 6. Localization

First-class. **English + Dutch to start, extensible to every backoffice-supported language.**

- **Derived/uncurated app names are localized for free** — they come from core section/menu-item
  labels that Umbraco already ships in many languages.
- **What we localize:** our chrome strings (Open apps, Minimize/Maximize/Restore/Close,
  Favourites, Recent, More, Search, Log out, Exit desktop, the exit-confirm dialog) and our
  **curated friendly names + group labels**. These are localization keys resolved via
  `this.localize.term()` / `localize.string('#key')`, in an `umbraDesktop` area.
- **Delivery:** register `localization` manifests, one dictionary per culture (`en`, `nl` now).
  Adding a language later = one more dictionary file, no code change.
- **Also localize the existing chrome** built in the 2026-07-21 pass (taskbar, window controls,
  launcher, exit modal) — it is currently hard-coded English. Folded into the plan so the whole
  desktop is consistent.

## 7. Icons

- **Manifest uses native `icon-*` aliases only**; generic `icon-box` fallback for the rare
  extension shipping no icon.
- **Window-control glyphs remain custom inline SVG** (Umbraco has no minimize/maximize/restore
  icon) — consistent with "manifest uses native icons", since controls are chrome, not manifest.

## 8. Persistence (Favourites & Recent)

- **Favourites** = a user-pinned set; **Recent** = a short usage log of recently opened apps.
- **v1 storage:** browser `localStorage`, keyed by current user id — simplest, no server work.
  **Later:** a user-scoped server store for cross-device consistency. *(Open point — see §11.)*
- Manifest-declared **default favourites** seed the set before the user pins anything.

## 9. Games

Solitaire and Minesweeper are simply **pinnable apps** in a *Games* group, opening in windows
like any other app. Their actual implementation is a **separate spec / sub-project** (fun, later)
and is **not** part of the launcher build — the launcher only needs the group + tiles.

## 10. Out of scope / deferred

Header-app tray (still its own future discussion); drag-to-reorder favourites; group-collapse
persistence; fullscreen window overview; edge/corner snap-tiling; content-search beyond opening
the native modal; the Desktop-settings panel + wallpaper picker; the Games implementations.

## 11. Open points for review

1. **Form factor** — anchored panel (recommended primary) vs fullscreen as the default surface.
2. **Persistence** — `localStorage` (v1) vs a user-scoped server store.
3. **Favourites + Recent density** — showing both may be tight; validate in-browser, and if so
   make Recent compact or collapsible. (Flagged by the maintainer.)
4. **Search** — one field that both filters apps and escalates to content search, vs a separate
   "Search content" button.
