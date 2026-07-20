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

The original design made apps a **manifest extension type** that third-party packages would
self-register, plus **auto-derivation** across four surface types.

We are **replacing that with a curated catalogue** maintained inside the UmbraDesktop package,
where each entry **references a registered extension by alias and infers its URL from the
registry** — falling back to a hand-authored URL only for the few surfaces that aren't
inferable. Plus one safe automatic section fallback. Rationale:

- **Package authors won't self-register.** A PR adding one file to UmbraDesktop is a far lower
  bar than "learn our manifest API", and the maintainer can *certify* the result works.
- **URLs are inferred, not hand-typed.** Section and dashboard deep-links are reliably built
  from the registry (§5.1), so a catalogue entry is usually just "point at this alias, show it
  here" — not a hand-maintained URL.
- **"Certified" is a fact, not a claim.** It means "we opened it and it works well framed",
  stronger than "the author added a manifest".
- **Far less code and maintenance** than a manifest type + condition evaluation + fragile
  multi-surface URL derivation.

**The door stays open.** The internal app model is *source-agnostic*: the catalogue is one
source of `UmbraDesktopApp`s. A manifest-based source can be added later (roadmap) as another
producer feeding the same pipeline, with no downstream rework.

---

## 2. The app model

### 2.1 Sources
All sources emit the same runtime type, `UmbraDesktopApp`. Phase 2 ships:
1. **The curated catalogue** — hand-authored entries that reference registry aliases
   (URL inferred) or, for un-inferable tools, carry an explicit hand-verified URL.
2. **The section fallback (auto)** — every permitted section with no catalogue entry still
   appears, so nothing routable silently disappears.

### 2.2 Confidence — two tiers
The original three tiers collapse to two.

| Tier | Source | Meaning | Default chrome |
|------|--------|---------|----------------|
| **certified** | a catalogue entry exists | maintainer opened it; it works | as authored |
| **uncertified** | section fallback (no entry) | untested; safest framing | `full-section` |

Confidence is a data attribute in Phase 2; its **badge UI** arrives with the Phase 3 drawer.

---

## 3. Data model

### 3.1 The two axes
- **Gate** — decides whether the app is shown at all: its backing section must be
  **installed *and* permitted for the current user** (§6). For a section/dashboard entry the
  gate section is known from the reference; for an explicit-URL entry it is stated.
- **Display (`categoryAlias`)** — the free-form header where the maintainer wants it shown,
  fully decoupled from Umbraco's section/menu structure. A Log Viewer that lives in Settings
  can appear under a "Security" header.

### 3.2 A catalogue entry references an alias (URL inferred)
Each entry links to *what it opens* in exactly one of three ways:

- **`section: <sectionAlias>`** — a whole-section app. URL inferred: `/umbraco/section/{pathname}`.
  This entry *is* that section's root app (there is at most one per section).
- **`dashboard: <dashboardAlias>`** — a dashboard app. URL inferred from the dashboard's
  `meta.pathname` + its owning section.
- **`url: <string>` (+ `section: <sectionAlias>` for the gate)** — an explicit, hand-verified
  URL, used only for surfaces that aren't inferable (single-view/tree tools; §5.1).

Plus presentation + placement (all optional except placement):
```
UmbraDesktopCatalogueEntry {
  alias                       // our stable app id
  section | dashboard | url   // the link (exactly one form, per above)
  section?                    // also the permission gate for url-form entries
  name?; icon?                // override; default inherited from the referenced extension
  chromeProfile?              // default by link kind (section→full-section, etc.)
  defaultSize?; allowMultiple?; weight?
  categoryAlias; groupAlias?  // DISPLAY placement
}
UmbraDesktopCategory { alias; label; weight?; icon? }                              // header
UmbraDesktopGroup    { alias; label; categoryAlias; weight?; collapsedByDefault? } // collapsible sub-group
UmbraDesktopCatalogue { categories; groups; entries }                             // collated fragments
```

Runtime output type (what the launcher lists / the window manager opens):
```
UmbraDesktopApp {
  alias; name; icon; url; chromeProfile; defaultSize?; allowMultiple?
  weight?; categoryAlias; groupAlias?; confidence
}
```

### 3.3 Grouping — two levels
Launcher structure is **header → optional collapsible group → apps**, ordered by `weight`,
empty headers dropped. A header may contain apps directly and/or collapsible groups (the
Settings → *Templating* → Templates / Partial Views / Stylesheets pattern). No deeper nesting.
The collapse **interaction** is minimal in Phase 2's placeholder launcher and fully realised
in the Phase 3 drawer; the **data** driving it is modelled now.

### 3.4 The fallback bucket
Fallback (uncertified) apps collect under a **single reserved "More" header** (a reserved
`categoryAlias`, weight sorted last), keeping curated headers pristine.

---

## 4. Catalogue file layout
A `catalogue/` directory, **one fragment file per area or package**, each exporting
`{ categories?, groups?, entries? }`, collated by `catalogue/index.ts` — mirroring
`bundle.manifests.ts`.
```
backoffice/src/desktop/catalogue/
  index.ts            // collate all fragments
  categories.ts       // curated headers + collapsible groups (Security, Scaffolding, …)
  content.ts          // Content / Media / Members section entries
  settings.ts         // Settings section entry + a dashboard entry + one explicit-URL tool
  …                   // room for one file per package/plugin later (e.g. uSync.ts)
```
A package/plugin gets a self-contained file that can declare its own header *and* entries; an
external contributor PRs one file + one import line. Small diffs, low-friction contribution.

---

## 5. Derivation & grouping — the pure, tested core

### 5.1 URL inference (which surfaces, how reliable)
Confirmed against the v17 backoffice source:

| Surface | Inferable? | Rule |
|---|---|---|
| **Section** | ✅ reliable | `/umbraco/section/{section.meta.pathname}` (`UMB_SECTION_PATH_PATTERN`) |
| **Dashboard** (pathname set) | ✅ reliable | `/umbraco/section/{sectionPathname}/dashboard/{dashboard.meta.pathname}`; section resolved from the dashboard's `Umb.Condition.SectionAlias` |
| Tree tool w/ `{entityType}-root` workspace | ⚠️ convention | e.g. `/umbraco/section/settings/workspace/data-type-root` — not guaranteed (Templates has none) |
| Single-view workspace tool (Log Viewer) | ⚠️ partial | `/umbraco/section/{section}/workspace/{meta.entityType}` — section prefix is cosmetic |
| Individual entity node | ❌ never | needs a runtime GUID — correctly not an app |

The ✅ rows are inferred automatically from the referenced manifest. The ⚠️ rows are handled by
an **explicit `url:` entry** whose value the maintainer verifies against a running backoffice —
that verification *is* the certification. URL strings are composed by simple, tested string
building from primitives (pathname etc.) the adapter extracts from manifests, keeping the pure
functions free of backoffice imports (matching Phase 1's test approach).

### 5.2 `deriveApps(catalogue, resolvedContext) → UmbraDesktopApp[]`
`resolvedContext` = the permitted sections (`{alias, label, pathname}[]`) + any resolved
dashboard/tool primitives the adapter looked up (§6), all as plain data.
1. **Certified section entries:** for each `section:` entry whose section is permitted, emit a
   certified `full-section` app (inferred URL), with overrides + placement.
2. **Certified dashboard / url entries:** emit certified apps (inferred or explicit URL),
   gated by their section being permitted, placed as specified. (Skipped + logged if the
   referenced extension isn't registered / section not permitted.)
3. **Section fallback:** for each permitted section with **no** `section:` entry, synthesize an
   uncertified `full-section` app in the "More" header.
4. Return the flat, tagged app list.

### 5.3 `groupApps(apps, categories, groups) → display tree`
Builds `header → (loose apps + collapsible groups → apps)`, sorts by `weight`, drops empties,
"More" last. Phase 3's drawer consumes this unchanged.

### 5.4 `allowMultiple` enforcement
Opening an app with `allowMultiple: false` when an instance exists **focuses the existing
window** instead of duplicating — a small, tested addition to the pure window-model +
window-manager (Phase 1 always allowed multiple).

---

## 6. Runtime resolution & lazy loading

**Permitted sections come for free.** `UMB_BACKOFFICE_CONTEXT.allowedSections`
(`@umbraco-cms/backoffice/backoffice`) is already the registered section list filtered by the
current user's `allowedSections`. We consume it directly — a forbidden section never yields an
app. (Underlying source: `UMB_CURRENT_USER_CONTEXT.allowedSections`, section aliases.)

**Resolution is a thin impure adapter** — the only impure part. It: reads
`allowedSections`; for each catalogue `dashboard:`/`url:` entry looks up the referenced manifest
(`umbExtensionsRegistry`) to extract pathname/section primitives; then feeds plain data into
the pure `deriveApps`. An `UmbraDesktopAppCatalogueContext` (provided by the desktop element,
beside the window manager) runs adapter → `deriveApps` → `groupApps` and exposes observable
`apps` / display tree.

**Lazy loading (zero Umbraco boot cost).** The desktop bundle already loads only when the
section mounts (`element: () => import(...)`). Catalogue resolution + derivation + iframe boots
all happen **on entering the Desktop section**, never at backoffice boot. A first-open loading
screen is expected and acceptable. Nothing in Phase 2 registers work that runs at boot.

---

## 7. Integration & changes vs Phase 1

| File | Change |
|------|--------|
| `desktop/types.ts` | **Modify** — add `UmbraDesktopConfidence`, `…CatalogueEntry`, `…Category`, `…Group`, `…Catalogue`; extend `UmbraDesktopApp` with `confidence`, `categoryAlias`, `groupAlias?`, `weight?`. |
| `desktop/constants.ts` | **Modify** — reserved "More" category alias + label + sort weight. |
| `desktop/catalogue/*` | **Create** — fragments + `index.ts` (§4). |
| `desktop/derive-apps.ts` (+ `.test.ts`) | **Create** — URL inference helpers + `deriveApps` (§5.1–5.2). |
| `desktop/group-apps.ts` (+ `.test.ts`) | **Create** — `groupApps` (§5.3). |
| `desktop/window-model.ts` (+ test) | **Modify** — `allowMultiple` helper (§5.4). |
| `desktop/window-manager.context.ts` | **Modify** — respect `allowMultiple` in `open`. |
| `desktop/app-catalogue.context.ts` / `.context-token.ts` | **Create** — runtime resolution (§6). |
| `desktop/components/desktop.element.ts` | **Modify** — provide the catalogue context. |
| `desktop/components/taskbar.element.ts` | **Modify** — placeholder launcher lists grouped available apps (replaces hard-coded `apps[0]`). Phase-2 placeholder; Phase 3 = fullscreen drawer. |
| `desktop/apps.ts` | **Delete** — replaced by the catalogue. |

Phase 1's window/taskbar chrome, drag/resize, and section registration are otherwise untouched.

---

## 8. Testing strategy
- **Unit (TDD, web-test-runner):**
  - URL inference — section + dashboard URL composition from primitives.
  - `deriveApps` — gate filtering by permitted sections; certified tagging for
    section/dashboard/url entries; section fallback for uncatalogued sections; **no** fallback
    when a `section:` entry exists; confidence assignment; fallback lands in "More".
  - `groupApps` — header→group→apps tree; weight sorting; empty dropping; "More" last.
  - `window-model` — `allowMultiple:false` focuses existing; `true` opens anew.
- **Manual (Test Instance):** each certified core app opens to the right place with the right
  chrome; an uncatalogued section shows under "More"; permission filtering (drop a section from
  the user group → its app disappears); `allowMultiple:false` focuses instead of duplicating.

---

## 9. Risks
| # | Item | Mitigation |
|---|------|-----------|
| R4′ | Non-inferable tools (tree tools w/o root workspace, single-view workspaces) | Handled by explicit `url:` entries, hand-verified (= certification). Start the catalogue with ✅-inferable surfaces + a couple of verified tools; grow deliberately. |
| R6 | Chrome injector only strips sidebars sharing the header's shadow root (Phase 1 note) | `workspace-only`/`bare` may not fully strip deep sidebars. Own task to extend the injector; **escape hatch**: ship affected entries as `full-section` and defer aggressive stripping. |

(Old R7 — permission resolution — is **resolved**: `UMB_BACKOFFICE_CONTEXT.allowedSections`, §6.)

---

## 10. Out of scope (roadmap)
- Fullscreen app drawer + fuzzy search + confidence **badge UI** (Phase 3 — consumes `groupApps`).
- localStorage persistence + reset (Phase 4).
- Manifest-based app source / third-party self-registration (roadmap — plugs in as a source).
- Pinned / favourites, user-defined custom groups, drag-to-arrange (roadmap).
