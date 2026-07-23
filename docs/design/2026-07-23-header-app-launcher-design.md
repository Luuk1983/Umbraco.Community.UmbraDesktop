# UmbraDesktop — Header-app launcher & hidden section entry (v1)

> **Date:** 2026-07-23
>
> **Scope:** changes only *how you enter* the desktop. The desktop shell, launcher, windows,
> taskbar and app-model (see [`2026-07-22-launcher-flat-app-model-design.md`](./2026-07-22-launcher-flat-app-model-design.md))
> are unaffected.
>
> **Relates to** the section registration in
> [`backoffice/src/desktop/manifest.ts`](../../src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/manifest.ts)
> and the shadow-root injection utilities in
> [`backoffice/src/desktop/chrome-injector.ts`](../../src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/chrome-injector.ts).

## 1. Motivation

Today the only way into desktop mode is to visit the **Desktop section** in the section nav.
That miscasts the desktop as if it were a content section (like Content or Media), when it is
really a *global mode* that wraps the whole backoffice — the same category of thing as Search,
Help, and the current-user menu. Those live as **header apps** in the top-right. The desktop
launcher belongs there too: a global, always-reachable icon rather than a destination buried in
the section list.

This change moves the **front door** to a header app, and removes the now-redundant section tab
from the nav — while keeping the section itself as the v1 engine.

## 2. Decision & alternatives considered

**v1 keeps the desktop as a `section`.** Making it independent of the backoffice (a routeless
overlay, or a standalone page at a fixed path) was explored in depth and **deferred** — it is a
larger, riskier build and runs outside the officially supported backoffice shell. See the
`umbradesktop-entry-point-decision` memory for the full reasoning and the verified constraints.
The load-bearing facts:

- Only a `section` (and nested `workspace`) owns a top-level backoffice route. A `headerApp`
  owns **no** route — it can only *link* to one. So the section stays as the route owner.
- Route-access and nav-visibility are the **same** `allowedSections` bit
  ([`apps/backoffice/backoffice.context.js`](../../src/Umbraco.Community.UmbraDesktop/node_modules/@umbraco-cms/backoffice/dist-cms/apps/backoffice/backoffice.context.js) ~L33-42):
  a granted, routable section is always listed in the nav, and there is no per-section "hide"
  flag. Hence we hide the tab **presentationally** (§5) rather than looking for a manifest option
  that does not exist.
- A freshly-registered custom section is invisible by default (opt-in per user group), so nothing
  leaks on a clean install until an admin grants access.

## 3. Design overview

Three parts, all additive except the small entry-point hook:

1. **Section** — unchanged. Remains the route owner and fullscreen host.
2. **Header app** (§4) — a new top-right icon that navigates into the section route; shown only
   to users who have desktop access.
3. **Hidden section tab** (§5) — the redundant nav tab is hidden via scoped CSS, reusing the
   existing shadow-root injection utilities.

Both #2 and #3 key off the **same** section permission, so they stay in sync automatically:
no access → no tab **and** no launcher; access → launcher only.

## 4. Header app (the launcher)

### 4.1 Manifest

A new `headerApp` extension, gated by the section-permission condition:

| Field | Value |
|---|---|
| `type` | `headerApp` |
| `alias` | `Umbraco.Community.UmbraDesktop.HeaderApp` |
| `name` | `UmbraDesktop Launcher Header App` |
| `element` | a small custom element (§4.2) |
| `conditions` | `[{ alias: 'Umb.Condition.SectionUserPermission', match: UMBRADESKTOP_SECTION_ALIAS }]` |

`Umb.Condition.SectionUserPermission` resolves against `currentUser.allowedSections`, so the
launcher renders **only** for users who can actually reach the desktop route.

### 4.2 Element

- Icon-only button to sit naturally alongside Search / Help / current-user (chosen over the
  built-in `button` kind, whose `look="primary"` styling reads as a filled button, not a header
  glyph).
- **Icon:** `icon-tv` (or a chosen native `icon-*`; final glyph is an open point, §10).
- **Localized tooltip/label:** `#umbraDesktop_launchDesktop` (§7).
- **On activate:** navigate to the section route `section/${UMBRADESKTOP_SECTION_PATHNAME}`
  (i.e. `section/umbradesktop`), implemented as an anchor / router navigation so it uses the
  backoffice client-side router (no full page reload). Exiting the desktop is unchanged (the
  taskbar's existing *Exit desktop* action).

## 5. Hiding the redundant section tab

Each section tab renders with a stable, per-section marker
([`backoffice-header-sections.element.js`](../../src/Umbraco.Community.UmbraDesktop/node_modules/@umbraco-cms/backoffice/dist-cms/apps/backoffice/components/backoffice-header-sections.element.js)):

```
<uui-tab data-mark="section-link:${section.alias}" href="section/${pathname}" ...>
```

### 5.1 Mechanism

Reuse the existing utilities in `chrome-injector.ts` — no new technique:

```js
const selector = `uui-tab[data-mark="section-link:${UMBRADESKTOP_SECTION_ALIAS}"]`;
const root = findShadowRootWith(document, selector);       // BFS across nested shadow roots
injectStyle(root, document, 'umbradesktop-hide-section-tab',
  `${selector}{display:none!important}`);                  // keyed <style> into that shadow root
```

The tabs live in `umb-backoffice-header-sections`' own shadow root; `findShadowRootWith` already
handles reaching nested roots (it is used today to find `umb-section-main`). A small
`buildSectionTabHideCss(alias)` pure helper produces the selector + rule (kept pure for testing,
§8).

### 5.2 Where it runs

From the backoffice entry point
([`entrypoints/entrypoint.ts`](../../src/Umbraco.Community.UmbraDesktop/backoffice/src/entrypoints/entrypoint.ts))
`onInit`, so it applies as soon as the backoffice loads and stays applied everywhere in the
classic UI. The section shell mounts asynchronously, so — mirroring `injectChromeStyles` — poll
until the target shadow root appears (bounded, ~10s) then inject once.

### 5.3 Lifecycle & no-access behaviour

- Always-on while in the classic backoffice. When the desktop section is active the outer header
  is already hidden by the existing fullscreen behaviour, so the rule is simply inert there.
- If the user lacks desktop access there is no tab to hide — the selector matches nothing and the
  poll simply times out harmlessly. (Optional refinement: skip the injection when the current
  user's `allowedSections` excludes the desktop alias, to avoid the idle poll. Not required for
  v1.)

### 5.4 Safety & reliability

- **Safe:** CSS-only, keyed `<style>`, fully reversible, no data/behaviour impact — identical in
  kind to the chrome stripping already shipped.
- **Reliable, with one bounded caveat:** it depends on the `data-mark="section-link:<alias>"`
  convention. `data-mark` is a deliberate, test-backed selector convention (Umbraco's own e2e
  helpers rely on it), so it is low-churn. A future Umbraco *major* could rename it — the **same**
  upgrade risk the existing chrome-stripping already carries — and it would be a one-line patch.

## 6. Gating & synchronisation

The header-app condition (`SectionUserPermission`) and the tab-hide both derive from the desktop
section being in the user's `allowedSections`. There is a single source of truth (the grant), so
the two can never drift: a granted user sees the launcher and no tab; an ungranted user sees
neither.

## 7. Localization

- Add `#umbraDesktop_launchDesktop` (launcher tooltip/label) to the existing dictionaries
  [`desktop/localization/en.ts`](../../src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/localization/en.ts)
  and [`nl.ts`](../../src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/localization/nl.ts).
- No new area or manifest — reuse the registered `umbraDesktop` localization.

## 8. Testing (test-first)

Extract the pure logic and test it before wiring, consistent with the existing `*.test.ts` suite:

- `buildSectionTabHideCss(alias)` → returns the expected selector + `display:none` rule; escapes
  / interpolates the alias correctly. **New unit test.**
- `findShadowRootWith` already has coverage in
  [`chrome-injector.test.ts`](../../src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/chrome-injector.test.ts);
  add a case for locating a `uui-tab[data-mark=...]` in a nested shadow root fixture.
- The header-app manifest condition (alias + match) is asserted in a manifest test.

DOM-timing (the poll) and live navigation are integration concerns, validated manually in-browser
(launcher appears only when granted; click enters desktop; tab absent from nav; ungranted user
sees neither).

## 9. Files touched

- **New:** `backoffice/src/headerapps/manifest.ts` (+ element), `headerapps/section-tab-hide.ts`
  (the `buildSectionTabHideCss` helper), and matching `*.test.ts`.
- **Edit:** `bundle.manifests.ts` (register the new header-app manifests);
  `entrypoints/entrypoint.ts` (invoke the tab-hide in `onInit`);
  `desktop/localization/{en,nl}.ts` (new string). The section-tab-hide may import
  `findShadowRootWith`/`injectStyle` from `desktop/chrome-injector.ts` (consider promoting them to
  a shared module if the coupling feels wrong — minor).

## 10. Out of scope / deferred

- **Standalone / independent desktop** (fixed-path page, or routeless overlay) — the bigger
  architectural bet; revisit post-v1.
- **Header-app tray + session/identity** (logout/username/profile in the header) — still its own
  separate discussion.
- Any change to the *exit* flow, the desktop shell, launcher, or app model.

## 11. Open points for review

1. **Launcher glyph** — which native `icon-*` best reads as "desktop / launch" in the header
   (`icon-tv`, `icon-display`, …).
2. **Tab-hide home** — entry point `onInit` (recommended) vs. driving it from the header-app
   element's lifecycle. Entry point keeps it independent of the launcher element and always-on.
3. **Idle-poll refinement** — whether to gate the injection on the current user's `allowedSections`
   to avoid the harmless timeout when the user lacks access (§5.3).
