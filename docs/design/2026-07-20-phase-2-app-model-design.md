# UmbraDesktop — Phase 2: The app model (curated catalogue)

- **Status:** Approved design / pre-implementation
- **Date:** 2026-07-20
- **Phase:** 2 (design doc §11.2/§11.3 — the app *model/catalogue*)
- **Relationship to the main design doc:** This document **supersedes §6.1** (the
  `desktopApp` manifest extension type) and **refines §6.2/§6.3 and §7** of
  [`umbradesktop-design.md`](./umbradesktop-design.md). The vision, constraints (§2),
  iframe approach (§4), and chrome profiles (§4.1) are unchanged.

---

## 1. The decision & why

The original design made apps a **manifest extension type** that third-party packages
would self-register, plus **auto-derivation** from the extension registry across four
surface types (sections, menu-item→tree, menu-item→view, dashboards), tiered by confidence.

We are **replacing that with a curated catalogue** maintained inside the UmbraDesktop
package, plus one safe automatic fallback. Rationale:

- **Package authors won't self-register.** A manifest API optimises for an audience that,
  realistically, won't use it. A PR that adds one file to UmbraDesktop is a far lower bar
  than "learn our manifest API", and the maintainer can *certify* the result actually works.
- **It dissolves risk R4 (deep-link discoverability).** You cannot reliably turn an
  arbitrary menu-item/dashboard manifest into a working URL. In a curated catalogue every
  entry's URL and chrome profile is **hand-verified against a running backoffice** before it
  ships — verification *is* the certification.
- **"Certified" becomes a fact, not a claim.** It means "we opened it and it works", a
  stronger guarantee than "the author added a manifest (untested by us)".
- **Far less code.** One typed data catalogue + two pure functions, instead of a manifest
  type + registry enumeration + condition evaluation + fragile multi-surface URL derivation.

**The door stays open.** The internal app model is *source-agnostic*: the catalogue is one
source of `UmbraDesktopApp`s. A manifest-based source can be added later (roadmap) as another
producer feeding the same pipeline, with no downstream rework.

---

## 2. The app model

### 2.1 Sources

All app sources emit the same runtime type, `UmbraDesktopApp`. Phase 2 ships:

1. **The curated catalogue** — hand-authored, maintainer-tested app definitions.
2. **The section fallback** — a synthesizer that surfaces installed sections we haven't
   curated, so nothing routable silently disappears.

### 2.2 Confidence — two tiers

The original three tiers (verified / auto / experimental) collapse to two. The
"auto vs experimental" split only earned its keep when derivation was the main engine.

| Tier | Source | Meaning | Default chrome |
|------|--------|---------|----------------|
| **certified** | curated catalogue | maintainer opened it; it works | as authored (may strip aggressively) |
| **uncertified** | section fallback | untested; safest framing | `full-section` (Phase 1's proven path) |

Confidence is a data attribute in Phase 2. Its **UI** (badges) arrives with the Phase 3 drawer.

---

## 3. Data model

Two **independent axes** — this is the crux of the flexibility:

- **`sectionAlias`** — the **gate**. Decides whether an app is shown at all (its section must
  be installed *and* permitted for the current user). Never affects display.
- **`categoryAlias`** — the **display header**. Where the maintainer *wants* the app shown,
  completely free-form and decoupled from Umbraco's section/menu structure. A Log Viewer that
  lives in Settings can appear under a "Security" header; a Document-Types tool under
  "Scaffolding".

### 3.1 Types (conceptual)

```
UmbraDesktopConfidence = 'certified' | 'uncertified'
UmbraDesktopChromeProfile = 'full-section' | 'workspace-only' | 'bare'   // unchanged

// Curated catalogue data
UmbraDesktopCatalogueEntry {
  alias           // stable id
  name; icon
  url             // hand-verified backoffice deep link
  chromeProfile
  defaultSize?; allowMultiple?
  weight?         // ordering within its group/header
  sectionAlias    // GATE: section that must be installed + permitted
  categoryAlias   // DISPLAY: header it appears under
  groupAlias?     // DISPLAY: optional collapsible sub-group
  isSectionRoot?  // true = this entry represents the whole section (fallback dedup)
}

UmbraDesktopCategory { alias; label; weight?; icon? }                       // a header
UmbraDesktopGroup    { alias; label; categoryAlias; weight?; collapsedByDefault? } // collapsible sub-group

UmbraDesktopCatalogue { categories; groups; entries }                       // collated fragments

// Runtime (what the launcher lists and the window manager opens)
UmbraDesktopApp {
  alias; name; icon; url; chromeProfile; defaultSize?; allowMultiple?
  weight?; categoryAlias; groupAlias?
  confidence      // 'certified' | 'uncertified'
}
```

### 3.2 Grouping — two levels

Launcher structure is **header → optional collapsible group → apps**, ordered by `weight`,
empty headers dropped. A header may contain apps directly *and/or* collapsible groups (the
Settings → *Templating* → Templates / Partial Views / Stylesheets pattern). No deeper nesting.

The collapse **interaction** is minimal in Phase 2's placeholder launcher and fully realised
in the Phase 3 drawer; the **data** that drives it (`groupAlias`, `collapsedByDefault`) is
modelled now, so Phase 3 is pure UI.

### 3.3 The fallback bucket

All fallback (uncertified) apps collect under a **single reserved "More" header**
(`categoryAlias` = a reserved constant, weight sorted last), keeping curated headers pristine
and clearly separating tested from untested apps.

---

## 4. Catalogue file layout

A `catalogue/` directory, **one fragment file per area or package**, each exporting
`{ categories?, groups?, entries? }`. A small `catalogue/index.ts` collates them into one
`UmbraDesktopCatalogue` — mirroring how `bundle.manifests.ts` already collates manifests.

```
backoffice/src/desktop/catalogue/
  index.ts            // collate all fragments
  categories.ts       // curated headers + collapsible groups (Security, Scaffolding, …)
  content.ts          // Content / Media / Members entries
  settings.ts         // Settings section-root + a single-view tool + a dashboard
  …                   // room for one file per package/plugin later (e.g. uSync.ts)
```

Consequences: small focused diffs; a package/plugin gets a **self-contained file** that can
declare its own header *and* its entries; an external contributor PRs one file + one import
line. This is the low-friction contribution path — no manifest API to learn.

---

## 5. Derivation & grouping — the pure, tested core

Two pure functions (TDD), each in its own file:

### 5.1 `deriveApps(catalogue, availableSections) → UmbraDesktopApp[]`
1. **Certified:** emit each catalogue entry whose `sectionAlias` ∈ `availableSections`;
   `confidence: 'certified'`.
2. **Fallback:** for each available section with **no** `isSectionRoot` certified entry,
   synthesize one `full-section`, `uncertified` app (`/umbraco/section/{pathname}`) placed in
   the reserved "More" header.
3. (No display tree here — just the flat, tagged app list.)

### 5.2 `groupApps(apps, categories, groups) → display tree`
Builds `header → (loose apps + collapsible groups → apps)`, sorts everything by `weight`,
drops empty headers/groups. The reserved "More" header is always ordered last. Phase 3's
drawer consumes this unchanged.

### 5.3 `allowMultiple` enforcement
Opening an app with `allowMultiple: false` when an instance already exists **focuses the
existing window** instead of opening a second. This is a small, tested addition to the pure
window-model + window-manager (Phase 1 always allowed multiple).

---

## 6. Runtime resolution

`availableSections` = **registered ∩ permitted**:

- **Registered:** `umbExtensionsRegistry.byType('section')` → each section's
  `alias`, `meta.label`, `meta.pathname`.
- **Permitted:** filtered to the current user's allowed sections (exact API —
  current-user context `allowedSections` vs a section-permission condition — is resolved in
  the plan's first task; if permission resolution proves fiddly, Phase 2 may ship
  registered-only filtering and add permission filtering as a fast-follow, but permitted is
  the goal).

A thin **impure adapter** resolves this and is the *only* impure part; it feeds plain data
into the pure `deriveApps`. An `UmbraDesktopAppCatalogueContext` (provided by the desktop
element, alongside the window manager) runs the adapter + `deriveApps` + `groupApps` and
exposes an observable app list / display tree.

---

## 7. Integration & changes vs Phase 1

| File | Change |
|------|--------|
| `desktop/types.ts` | **Modify** — add `UmbraDesktopConfidence`, `…CatalogueEntry`, `…Category`, `…Group`, `…Catalogue`; extend `UmbraDesktopApp` with `confidence`, `categoryAlias`, `groupAlias?`, `weight?`. |
| `desktop/constants.ts` | **Modify** — reserved "More/Uncertified" category alias + label + sort weight. |
| `desktop/catalogue/*` | **Create** — fragments + `index.ts` (§4). |
| `desktop/derive-apps.ts` (+ `.test.ts`) | **Create** — `deriveApps` (§5.1). |
| `desktop/group-apps.ts` (+ `.test.ts`) | **Create** — `groupApps` (§5.2). |
| `desktop/window-model.ts` (+ test) | **Modify** — `allowMultiple` helper (§5.3). |
| `desktop/window-manager.context.ts` | **Modify** — respect `allowMultiple` in `open`. |
| `desktop/app-catalogue.context.ts` / `.context-token.ts` | **Create** — runtime resolution (§6). |
| `desktop/components/desktop.element.ts` | **Modify** — provide the catalogue context. |
| `desktop/components/taskbar.element.ts` | **Modify** — placeholder launcher lists grouped available apps (replaces hard-coded `apps[0]`). Explicitly a Phase-2 placeholder; Phase 3 = fullscreen drawer. |
| `desktop/apps.ts` | **Delete** — replaced by the catalogue. |

The window/taskbar chrome, drag/resize, and section registration from Phase 1 are otherwise
untouched. `UmbraDesktopApp` gains fields but stays open-compatible.

---

## 8. Testing strategy

- **Unit (TDD, web-test-runner):**
  - `deriveApps` — gate filtering by available sections; certified tagging; fallback synthesis
    for uncatalogued sections; **no** fallback when an `isSectionRoot` certified entry exists;
    confidence assignment; fallback lands in the "More" bucket.
  - `groupApps` — header→group→apps tree; weight sorting; empty header/group dropping; loose
    vs grouped apps; "More" header ordered last.
  - `window-model` — `allowMultiple: false` focuses the existing instance; `true` opens anew.
- **Manual (Test Instance):** each certified core app opens to the right place with the right
  chrome; an uncatalogued section shows under "More/Uncertified"; permission filtering (drop a
  section from the user group → its app disappears); `allowMultiple:false` focuses instead of
  duplicating.

---

## 9. Risks

| # | Item | Mitigation |
|---|------|-----------|
| R4′ | Deep-link URLs for single-view tools / dashboards may be non-trivial | Verified manually per entry — that *is* certification. Start the catalogue with surfaces whose URLs are known-good; grow deliberately. |
| R6 | Chrome injector only strips sidebars sharing the header's shadow root (Phase 1 note) | `workspace-only`/`bare` may not fully strip deep sidebars. Own task to extend the injector; **escape hatch**: ship affected entries as `full-section` and defer aggressive stripping — catalogue still works. |
| R7 | Section-permission resolution API | Resolved in the plan's first task; registered-only fallback exists if needed (§6). |

---

## 10. Out of scope (roadmap)

- Fullscreen app drawer + fuzzy search + confidence **badges UI** (Phase 3 — consumes
  `groupApps`).
- localStorage persistence + reset (Phase 4).
- Manifest-based app source / third-party self-registration (roadmap — plugs in as another
  source).
- Pinned / favourites, user-defined custom groups, drag-to-arrange (roadmap).
