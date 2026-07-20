# UmbraDesktop — Design

> An OS-style windowed desktop for the Umbraco backoffice, delivered as an installable
> package. Open the content library, the media library, your permissions editor and your
> access viewer as real, draggable windows — side by side.

- **Status:** Approved design / pre-implementation
- **Date:** 2026-07-20
- **Target:** Umbraco CMS **v17** (backoffice extension package, RCL)
- **Package:** `Umbraco.Community.UmbraDesktop` · display name **UmbraDesktop** · npm `umbradesktop`

---

## 1. Vision & motivating use case

Umbraco's backoffice is single-surface: one section is active at a time, one workspace fills
the main area. That's fine for linear editing, but it fights you the moment two tools are
*meant* to be looked at together.

The motivating case: a package that ships an **advanced permissions editor** and an
**access viewer**. They're only truly useful side by side — edit a permission on the left,
watch the resulting access on the right. Today that means constant back-and-forth navigation.

**UmbraDesktop** turns the backoffice into a desktop: a start menu / app drawer launches
"apps" into floating windows you can place next to each other — content + media, or a
permissions editor next to an access viewer.

---

## 2. Non-negotiable constraints

These were settled during design and frame every decision below.

| # | Constraint | Consequence |
|---|-----------|-------------|
| C1 | **No changes to Umbraco core.** Pure installable package. | Rules out modifying the router engine; drives the iframe approach. |
| C2 | **Reuse the existing backoffice**, don't rebuild it on the Management API. | Windows host the real backoffice UI, not bespoke re-implementations. |
| C3 | **Windows may be relatively isolated.** | Iframes are acceptable; no shared in-memory state required between windows. |
| C4 | **No cross-window drag & drop** (for now). | Removes the hardest interop requirement. |
| C5 | **Cross-window freshness via Umbraco's own mechanisms** (observers + server events / SignalR). | No custom cross-window sync layer. |
| C6 | **Native-first & Umbraco-consistent styling.** Reuse Umbraco/UUI; any custom UI must visually match the backoffice. | See §5.2 — the desktop must read as part of Umbraco, not bolted on. |

---

## 3. Feasibility findings (why the design is shaped this way)

Research against the Umbraco v17 backoffice source (`src/Umbraco.Web.UI.Client`) established
two decisive facts. *(File references are into the CMS source, not this repo.)*

### 3.1 Multiple live workspaces — state isolation is essentially free ✅

- The **Context API resolves by walking *up* the DOM** and stopping at the nearest provider
  (`libs/context-api/consume/context-request.event.ts`, `provide/context-provider.ts`). Two
  separate DOM subtrees therefore resolve to their **own** isolated context instances.
- **Every `<umb-workspace>` provides its own instance-scoped context** with its own dataset,
  validation and dirty-state (`packages/core/workspace/workspace.element.ts`,
  `entity-detail/entity-detail-workspace-base.ts`). Two Content workspaces editing two
  different documents do not collide.
- Shared stores are **`unique`-keyed caches** (`packages/core/store/detail/detail-store-base.ts`),
  so sharing data across windows *helps* rather than corrupts.
- **Proof it already works:** the backoffice mounts a full second workspace of the *same*
  entity type inside a modal today (`packages/core/workspace/modals/workspace-modal.element.ts`).

### 3.2 The one real constraint is routing 🚧

- The router reads a **single global `window.location`**, broadcasts over the **global
  `window` event target**, and **monkey-patches History globally**
  (`packages/core/router/router-slot/config.ts`, `router-slot/util/url.ts`,
  `router-slot/util/history.ts`). Only **one** route tree can own the URL.
- There is **no in-memory / virtual routing mode**. Building one would be a core change → ruled
  out by **C1**.

**Conclusion:** in a single backoffice instance you cannot give many windows their own
independent navigation. But an **`<iframe>` has its own `window`, its own `location`, its own
History and its own event bus** — so each iframe is a fully independent, deep-linkable
backoffice with zero core changes. That is the crux that makes the whole design possible
without touching Umbraco.

---

## 4. Chosen approach: iframe windows

Each window hosts an **`<iframe>`** whose `src` is a deep link into the backoffice.

- **Same origin** as the host (the package is served from the Umbraco site), so the desktop
  shell can reach into each iframe's document.
- **Auth is shared automatically** via the secure `__Host-` cookies — each iframe boots an
  authenticated backoffice like an extra tab (see risk R2).
- **Independent navigation, state and lifecycle** per window, for free.

Accepted cost: each window re-boots the backoffice shell (heavier than in-process). Given
C3/C4 and "a handful of windows", this is an acceptable trade.

### 4.1 Chrome stripping

A window should not show the *entire* backoffice (top header with every section tab) inside a
little frame. Because the iframe is same-origin, the desktop injects a stylesheet into each
iframe's document on load, keyed off **stable custom-element tags** rather than brittle CSS
classes — the shell is literally `<umb-backoffice-header>` + `<umb-backoffice-main>`
(`apps/backoffice/backoffice.element.ts`).

**Chrome profiles** (how much of the shell a window keeps):

| Profile | Keeps | Strips | Typical use |
|---------|-------|--------|-------------|
| `full-section` | section sidebar + tree + workspace | top header | Content, Media (tree-driven) |
| `workspace-only` | just the workspace/main | top header **and** sidebar | a single menu-item tool |
| `bare` | the target view only | everything else | dashboards, single-view tools |

Confidence tier (§6.3) picks the **default** profile: the less we trust a target, the more
chrome we leave intact so it still works.

### 4.2 Cross-window freshness

No custom sync. Each iframe runs its own observers and its own server-events/SignalR
connection. Save in Window A → the server fires notifications → Window B refreshes **itself**.
This is exactly Umbraco's existing model, just running in N iframes. *(Assumption A1 —
verify the server-events channel actually carries the entity-changed signals we rely on.)*

---

## 5. The desktop shell

A new **"Desktop" section** registered by the package.

- **Fullscreen when active:** while the Desktop section is open it hides the outer
  `umb-backoffice-header` (same-origin, reversible) for a true OS feel, with a **"return to
  classic backoffice"** control. Leaving the section restores the header.
- **Taskbar:** start button → fullscreen app drawer · running-window chips · clock · return
  to classic.
- **Window manager:** drag (title bar), resize (edges/corners), minimize / maximize / restore,
  focus & z-order, close. **Multiple instances** of an app are allowed when the app declares
  it (two Content windows on different nodes is the whole point). Tiling/snap is roadmap.

### 5.1 Window model (conceptual)

```
Window {
  id: string                 // instance id
  appAlias: string           // which desktopApp
  title: string
  icon: string
  url: string                // backoffice deep link for the iframe
  chromeProfile: 'full-section' | 'workspace-only' | 'bare'
  rect: { x, y, w, h }
  z: number
  state: 'normal' | 'minimized' | 'maximized'
}
```

### 5.2 Design language

**Native-first.** Prefer Umbraco's own building blocks over anything custom: register through
the extension registry (section, dashboards, conditions) and build UI from **UUI**
(`@umbraco-ui/uui-*`) web components. When custom UI is unavoidable (window frames, taskbar,
launcher) style it with Umbraco's **design tokens** — `--uui-color-*`, `--uui-size-*`,
`--uui-font-*`, `--uui-shadow-*` — and the existing icon set, so it reads as part of the
backoffice rather than bolted on.

**The start button *is* the Umbraco logo.** The taskbar launcher trigger uses the Umbraco
logo — the one unmistakable "home" affordance, and it keeps the desktop unmistakably Umbraco.

**Desktop idiom: Linux / Windows, never macOS.** Model the window decorations, the
taskbar/panel and the launcher on widely-used **Linux desktop environments** (GNOME, KDE
Plasma) — which overlap heavily with Windows — not on macOS. Concretely:

- a **bottom taskbar/panel** with running-window buttons and the launcher trigger — *not* a
  magnifying macOS dock;
- **window controls on the right** of the title bar (minimize / maximize / close) — *not*
  macOS traffic-lights on the left;
- a **full-screen app grid/launcher** (GNOME Activities / KDE Kickoff style);
- **no** macOS dock, **no** global/top menu bar, **no** traffic-light buttons.

---

## 6. The app model

### 6.1 `desktopApp` — a manifest extension type

Apps are a first-class **manifest extension type** any package can register. UmbraDesktop's
own tools (permissions editor, access viewer) self-register; third parties extend the desktop
with a single manifest. Conceptual shape:

```
manifest desktopApp {
  type: 'desktopApp'
  alias, name, weight
  meta: {
    icon
    url                       // backoffice deep-link the window opens
    chromeProfile             // default view profile (§4.1)
    defaultSize?: { w, h }
    allowMultiple?: boolean   // may open >1 instance
    category?                 // drawer grouping override
  }
  conditions                  // reuse Umbraco's condition system (e.g. section/permission)
}
```

Reusing **conditions** means an app hides automatically when the user lacks permission — no
bespoke authorization code.

### 6.2 Auto-derivation (so hundreds of packages aren't left out)

Most core and community functionality will never ship an explicit `desktopApp`. UmbraDesktop
**derives** apps from what's already registered. An *app* is defined as **a self-contained
destination you can land on and do a coherent job**.

| Umbraco surface | An app? | Granularity | Default chrome |
|---|---|---|---|
| Section backed by a **tree** (Content, Media) | ✓ | 1 app = the section | `full-section` |
| **Menu item → a tree** (Settings ▸ Data Types, Document Types, Templates…) | ✓ | 1 app **per menu item** | `full-section` (that tree) |
| **Menu item → single view** (Log Viewer, Examine, Profiling, Webhooks…) | ✓ | 1 app per menu item | `workspace-only` / `bare` |
| **Dashboard** | ✓ | 1 app per dashboard | `bare` |
| Custom / package **section** | ✓ | recurse with the same rules | by confidence |
| **Singleton workspace** (no tree, e.g. Log Viewer) | ✓ | 1 app | `bare` |
| Workspace **views** (Content/Info/Actions tabs) | ✗ | part of a whole | — |
| **Collection view** | ✗* | it's the inside of a menu item/workspace (*its menu item is the app) | — |
| **Entity / bulk / create actions** | ✗ | act *on* a node, not a place | — |
| **Header apps**, property editors, property/workspace actions, modals, conditions, kinds, repositories | ✗ | infrastructure | — |
| Bare **entity workspace** (needs a target node) | ✗ | reached *through* a tree — the tree is the app | — |

Reach of auto-derivation: **sections + menu items + dashboards** (everything with a routable
deep link). The **section is a drawer *category***, not automatically a single app.

### 6.3 Confidence tiers

Nothing routable is left out — it just gets an honest badge. The badge also drives the
default chrome profile (lower confidence → keep more chrome → higher chance it just works).

| Tier | Source | Badge | Default chrome |
|------|--------|-------|----------------|
| **Verified** | explicit `desktopApp` manifest (author vouched) | ✓ | may strip aggressively |
| **Auto** | derived from a registered section | ~ | `full-section` |
| **Experimental** | derived, unvouched (community) | ⚠ | keep sidebar, strip only header |

The ⚠ badge is also an incentive flywheel: a package author who sees their tool listed as
"experimental" is nudged to add a one-line `desktopApp` manifest to earn the ✓.

---

## 7. The app drawer

- **Fullscreen launchpad** opened from the taskbar start button.
- **v1 scope: auto + fuzzy search only.** Collapsible category per section; menu items shown
  as sub-groups (e.g. Settings → *Templating* → Templates / Partial Views / Stylesheets);
  confidence badges on tiles.
- **No user customisation in v1** (pinned/favourites, custom groups, drag-to-arrange are
  roadmap).

---

## 8. Persistence

- **Per-browser `localStorage`.** Open windows + positions/sizes are written continuously and
  restored on load, so an accidental **F5 doesn't lose your desktop**.
- A **"close all / reset desktop"** control lets you deliberately start clean.
- Not a permanent saved session and not server-roaming (both roadmap).

---

## 9. Risks & assumptions to validate during planning

| # | Item | Note |
|---|------|------|
| A1 | Server-events / SignalR coverage | Confirm the real-time channel carries the entity-changed signals windows rely on for §4.2. |
| R2 | Multi-iframe auth / token refresh | N iframes = N backoffice instances, like N tabs. Umbraco documents cross-tab token cautions (never call `validateToken` per request — ID2019). Shared `__Host-` cookies *should* cover it; verify refresh doesn't fight. See `src/Umbraco.Web.UI.Client/docs/edge-cases.md` (Auth & Cross-tab). |
| R3 | Chrome-strip selector stability | Targets stable tags (`umb-backoffice-header`) not classes; still a soft coupling to shell structure across the v17 line. |
| R4 | Deep-link discoverability | Confirm section / menu-item / dashboard routes are resolvable from the extension registry to build the iframe `url`. |
| R5 | Iframe boot cost | Each window re-boots the shell; fine for a handful of windows, watch memory with many. |

---

## 10. Out of scope for v1 (roadmap)

- Cross-window drag & drop
- Tiling / window snapping
- Pinned / favourites and user-defined custom drawer groups; drag-to-arrange home screen
- "Open any backoffice path" address-bar launcher (always ⚠)
- Server-side, per-user, cross-device roaming layouts
- Desktop-as-default-landing option

---

## 11. Suggested build phases

1. **Desktop shell + window manager + one hard-coded iframe app.** Prove an iframe window
   drags/resizes and a deep link renders with the header stripped.
2. **`desktopApp` extension type + the two first-party apps** (permissions editor, access
   viewer) side by side — the motivating use case, end to end.
3. **Auto-derivation + confidence tiers + fullscreen drawer (auto + search).**
4. **Persistence (localStorage) + reset + taskbar polish.**
5. **Harden the risks** (A1/R2 especially), then pick roadmap items.

---

## 12. Appendix — mockups

Interactive mockups produced during brainstorming are archived under
[`docs/design/mockups/`](./mockups). They were built as fragments for a visual brainstorming
companion, so they render best inside that tool; the blueprint (`blueprint.html`) is the
end-to-end overview.
