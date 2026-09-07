# Commercial packages in the catalogue — Design

> Explicit catalogue support for the eight Umbraco commercial packages. Sixteen curated entries
> across eight fragment files, every one resolved by `ref` so it appears only where the package is
> installed. Two changes to the resolver make that safe: per-entry condition evaluation, so an entry
> gated on a permission or a feature flag cannot open a blank window, and the removal of `optional`,
> which turned out to promise something the catalogue cannot keep.

- **Status:** Implemented; amended in review (see §9)
- **Date:** 2026-09-06
- **Branch:** `feature/10_commercial_packages_catalogue`
- **Target:** Umbraco CMS **v17** and **v18**, package `Umbraco.Community.UmbraDesktop`
- **Issue:** [#10](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/10)

---

## 1. Goal & scope

The catalogue reaches into third-party packages already — uSync in `synchronisation.ts`, Advanced
Permissions in `advanced-security.ts` — but not into the packages Umbraco itself sells. On an
install with Forms, Deploy and Commerce, three of the most-used surfaces in the backoffice reach the
launcher only through the uncertified section fallback: an `icon-box` tile in "More", at the default
size, with no chrome profile.

This design closes that, and fixes the two resolver assumptions that closing it exposes.

**In scope**

- Sixteen catalogue entries across eight new fragment files, one per package.
- One new curatorial group, `marketing-sales`, for the two packages no existing group fits.
- **Per-entry condition evaluation** (§4): an entry may name the conditions on its referenced
  manifest that the desktop should answer before showing the app.
- **Removal of `optional`** (§5) and the `unknown-ref` diagnostic it silenced.
- Localisation, README, marketplace listing.

**Out of scope** — §10. Most notably `inferUrl` support for the `entityContainer` menu-item kind,
and any general evaluation of manifest conditions beyond what an entry opts into.

**Everything here is frontend.** No controllers, no DTOs, no migrations; the global "test-first for
all backend code" rule has nothing to bind to. §7 sets out the frontend approach the repo uses.

### 1.1 The survey

Every alias below was read from the package's own source on its v17 branch, and re-checked against
v18 where one exists. This table is the reason the design is as small as it is.

| Package | Section | Other statically referenceable surfaces |
|---|---|---|
| Forms | `Umb.Section.Forms` (`forms`) | `forms.dashboard`; `Forms.MenuItem.Analytics`. Its other four menu items are `kind: 'tree'` |
| Deploy | none | **v17:** dashboards `Deploy.Management.Dashboard`, `Deploy.Environments.Dashboard`. **v18:** those are gone; `Deploy.MenuItem.Status` / `.Schema` / `.Configuration` instead |
| Workflow | `Umb.Section.Workflow` (`workflow`) | Content-section dashboards `workflow.editor.dashboard`, `Workflow.AdvancedSearch.Dashboard`, `Workflow.ReleaseSets.Dashboard`; four default-kind menu items inside its own section |
| Commerce | `commerce` (`commerce`) | `Umb.Dashboard.Commerce`, which *is* the section root |
| Engage | `Umb.Section.Engage` (`engage`) | `Engage.MenuItem.Configuration` in Settings |
| UI Builder | generated at runtime | `UiBuilder.MenuItem.Settings` in Settings |
| Automate | `Ua.Section.Automate` (`automate`) | `Ua.Dashboard.Automate` / `.Runs` / `.Approvals`; tree-kind menu items |
| Umbraco AI | `ai` (`ai`) | `UmbracoAI.MenuItem.Settings` / `.Analytics` / `.AuditLogs`; seven more of kind `entityContainer` |

### 1.2 Why most packages get exactly one tile

The curated depth agreed for this work is "section root plus the genuinely daily destinations". For
six of the eight packages that resolves to the section root alone, and not as a shortcut — the
source leaves nothing else to point at:

- **Commerce** navigates by a custom `ucStoreMenuItem` type, and every destination below the section
  is scoped to a store id. There is no store-independent URL to put on a tile.
- **Engage** replaces the section element wholesale with its own `engageSection` kind and navigates
  internally by a bespoke `engageScreenElement` type. Its one `sectionView`,
  `Engage.SectionView.Root`, is the section root.
- **UI Builder** generates its sections, trees and dashboards from server configuration at runtime,
  with aliases like `UiBuilder.Section.{alias}`. Nothing can know them ahead of time — and nothing
  needs to, because the existing uncertified fallback surfaces them in "More", which is the correct
  answer for a section whose alias is unknowable.
- **Forms**, **Automate** and **AI** navigate by menu items that the section's own sidebar already
  presents. A tile per menu item would duplicate the sidebar into the launcher.

Deploy is the exception in the other direction: it has no section at all, so every entry is a
dashboard or a menu item. Workflow is the exception in both directions — a section for the
administrator, plus three dashboards in the *Content* section aimed at the editor, which is a
genuinely different audience reaching a genuinely different place.

---

## 2. Settled decisions

| # | Decision | Why |
|---|---|---|
| D1 | Every entry resolves by **`ref`**, never `url` | An alias is checked against the registry, so an absent package drops the app; a URL is not, so it ships a dead tile. `advanced-security.test.ts` already locks this invariant, and Automate proves the second half: a live branch renames its section pathname from `automate` to `automation`, which a section `ref` survives because the pathname is read from the manifest at runtime. |
| D2 | **One fragment file per package**, spreading into existing groups | The catalogue's `index.ts` only concatenates fragments and `groups.ts` is separate, so a file need not correspond to a group. When Deploy v19 renames something, the diff is one file. |
| D3 | Deploy's v17 and v18 surfaces both ship, as five entries | They are disjoint: an install resolves either the two dashboards or the three menu items. This is the Advanced Permissions pattern (one catalogue, two package majors, no version detection) and it works for the same reason — D1. |
| D4 | The conditions the desktop evaluates are named **per entry**, in `evaluateConditions` | §4.2. A global denylist is fail-closed on the unknown, and the CMS alone ships 54 condition implementations before any package adds its own. |
| D5 | A condition that has not reported is **permitted** | §4.4. The desktop's standing rule is that a missing affordance is a bug; a condition that is merely slow, or whose manifest belongs to a package we have never seen, must not remove an app. |
| D6 | **`optional` is removed**, along with the `unknown-ref` warning | §5. It gated nothing but a `console.warn`, and its inverse cannot be expressed honestly: a package may unregister a core extension, so no `ref` is ever guaranteed. |
| D7 | One new group, **`marketing-sales`**, at weight 15 | Commerce and Engage fit no existing group. "Marketing and sales" names one business function rather than bolting two product names together, and leaves room for a future marketing package without a rename. |
| D8 | Names are **ours** wherever the inherited label is generic or collides | `workflow.editor.dashboard`'s label is `#workflow_workflow`, identical to the Workflow section's; Deploy v18 offers "Status", "Schema" and "Configuration". Both would produce tiles you cannot tell apart. Product names — Forms, Commerce, Engage, Automate, AI — are inherited, because the package translates them and we should not. |
| D9 | `inferUrl` is **not** taught the `entityContainer` kind | §10. It builds the identical href to the default kind, so it would work, but nothing in this catalogue needs it and adding it would encode a third-party kind's routing rule on spec. |
| D10 | Condition evaluation ships **before** the entries that depend on it | The two condition-gated Workflow entries would otherwise be exactly the dead tiles this design exists to avoid. |
| D13 | A second new group, **`workflow`**, at weight 12 | Four Workflow entries would swamp Editing's three core apps if merged in. Sits directly after Editing (10) and before `marketing-sales` (15) because content approval is editorial work, not administration — the same shape as Advanced Permissions getting its own group beside Security. |
| D14 | A third new group, **`ai`**, at weight 45 | AI ships one tile today, but the package already sells Agent and Prompt add-ons that will earn their own entries, and none of that is System's administrative plumbing. Sits between Diagnostics (40) and System (50). |
| D15 | A fourth new group, **`automation`**, at weight 43 | Automate moved out of System for the same reason as AI (D14): it is a capability platform shipping its own add-ons, not administrative plumbing. It sits directly beside AI rather than elsewhere, so the two platform groups read as a pair, with System left as the administrative catch-all it has always been. Supersedes D14's original claim that Automate had nothing pulling it out. |

---

## 3. Surface inventory

The detail behind §1.1, recorded because it is the expensive part to rediscover and none of it is
visible from this repository.

### 3.1 Forms

Section `Umb.Section.Forms`, pathname `forms`, no condition on the section manifest itself. Its menu
lives at `Umb.Menu.Forms` and holds five items, four of which are `kind: 'tree'`
(`Forms.MenuItem.Form`, `.DataSource`, `.PrevalueSource`, `.Security`) and therefore refused by
`inferUrl` by design (§5.1 of the [Phase 2 design](2026-07-20-phase-2-app-model-design.md)). Only
`Forms.MenuItem.Analytics` is default-kind, entity type `forms-analytics-root`.

Identical on v17 and v18, including the entity types. Forms registers no icons of its own, but
`icon-umb-contour` ships with the CMS.

A trap for anyone verifying that, here or for `icon-umb-deploy`: neither appears in
`icon-registry/icon-dictionary.json`, which is what you would naturally grep. Both are in the
generated `icon-registry/icons.ts` with `hidden: true`, which suppresses them from the icon
*picker* only — `icon.registry.ts` resolves by name from that list, so `<umb-icon>` renders them
normally. Absence from the dictionary is not absence from the registry.

### 3.2 Deploy — two different products

The single most important finding here, because a catalogue written against either major alone would
be half dead on the other.

**v17** registers two dashboards and no section:

| Alias | Section | Pathname |
|---|---|---|
| `Deploy.Management.Dashboard` | `Umb.Section.Settings` | `deploy` |
| `Deploy.Environments.Dashboard` | `Umb.Section.Content` | `environments` |

**v18** removes both. The client is restructured around a `Deploy.Workspace.Overview` and a
`Deploy.Menu.Settings` sidebar menu in Settings, holding three default-kind menu items generated by
one factory:

| Alias | Entity type | Inherited icon |
|---|---|---|
| `Deploy.MenuItem.Status` | `deploy-status` | `icon-medical-emergency` |
| `Deploy.MenuItem.Schema` | `deploy-schema` | `icon-swatch-book` |
| `Deploy.MenuItem.Configuration` | `deploy-configuration` | `icon-settings` |

None of the six carries a condition beyond its section. `Deploy.Workspace.Overview` is reached from
content rather than from a menu, so it is not a launchable destination and gets no entry.

### 3.3 Workflow

Section `Umb.Section.Workflow`, pathname `workflow`. Four default-kind menu items in its own menu
(`Workflow.MenuItem.ActiveWorkflows`, `.ApprovalGroups`, `.History`, `.ContentReviews`) which the
section sidebar already presents, so none gets a tile.

Three dashboards in the **Content** section do:

| Alias | Pathname | Conditions beyond section |
|---|---|---|
| `workflow.editor.dashboard` | `workflow` | none |
| `Workflow.AdvancedSearch.Dashboard` | `advanced-search` | `Workflow.Condition.UserPermission` |
| `Workflow.ReleaseSets.Dashboard` | `release-sets` | `Workflow.Condition.UserPermission`, `Workflow.Condition.SettingEnabled` |

A content-calendar dashboard exists in the source but is **commented out**; it is not registered and
must not be referenced.

### 3.4 Commerce

Section alias is the bare string **`commerce`**, not `Umb.Section.Commerce`, with pathname
`commerce`. This looks like an oversight and is not; a test asserts it, because it is exactly the
kind of thing a well-meaning reviewer corrects.

The `dev` branch is already 18.x, and `main` is 18.1.4 — the alias is the same on both.

### 3.5 Engage

Section `Umb.Section.Engage`, pathname `engage`, registered with a custom `engageSection` kind whose
element is Engage's own tabbed layout. Everything inside is an `engageScreenElement`, a type the
registry adapter has no case for and should not grow one for.

`Engage.MenuItem.Configuration` is a plain default-kind menu item in Settings, entity type
`engage-settings`, inherited icon `icon-settings`.

Engage registers its own icon set, including one named simply `engage` — no `icon-` prefix. The
launcher passes `app.icon` straight to `<umb-icon name>`, so this was expected to work exactly as
uSync's `usync-logo` does today.

**It does not.** Verified in the shipped package: the icon *is* registered under exactly that name,
via `Engage.Icons.Backoffice`, and its module exports the SVG correctly. It nonetheless renders
blank in the launcher, and the cause could not be pinned down without browser access — this
repository's implementation pass did not have one. uSync's `usync-logo` renders correctly through
the identical mechanism, so this is a specific failure of Engage's icon, not evidence against
package-registered icons generally. The entry now uses the core `icon-megaphone` instead, so the
tile is never empty while the real cause remains open. Revisit with a browser available.

### 3.6 UI Builder

Sections, section views, menus and dashboards are all generated at runtime from a
`SectionDisplayModel` returned by the server, with aliases interpolated from the configured section
alias. The only static surface is `UiBuilder.MenuItem.Settings`: default kind, entity type
`uibuilder-root`, in `Umb.Menu.AdvancedSettings`, inherited icon `icon-tools`.

### 3.7 Automate

Section `Ua.Section.Automate`, pathname `automate`. Its `Ua.Dashboard.Runs` and `.Approvals`
dashboards are both gated on `Ua.Condition.WorkspacesExist`; its menu items are tree-kind.

**The pathname is being renamed.** Branch `v18/feature/rename-automate-section-url` changes
`UA_SECTION_PATHNAME` from `automate` to `automation` while leaving the alias alone. A section `ref`
reads the pathname from the manifest, so the entry survives; a hardcoded URL would break silently on
upgrade. This is D1's clearest justification in the wild.

### 3.8 Umbraco AI

Section alias is the bare string **`ai`**, pathname `ai`. Three menu items are default-kind
(`UmbracoAI.MenuItem.Settings`, `.Analytics`, `.AuditLogs`); seven more use a kind the package
defines itself, `entityContainer`, across the AI, AI Agent and AI Prompt sub-packages.

That kind is worth recording even though nothing here uses it. Its element builds
`section/${pathname}/workspace/${entityType}` — byte-identical to the default kind's route. So
`inferUrl` *could* accept it, and would then resolve all seven. It does not, per D9.

AI entity types carry a colon (`uai:connection-root`). Legal in a URL path, but surprising.

---

## 4. Conditions

### 4.1 The axis is the mount point, not satisfiability

The resolver answers two questions today: is the `ref` registered, and is its gate section permitted
for this user. It never looks at the referenced manifest's own `conditions`. That is why
`Workflow.ReleaseSets.Dashboard` cannot simply be added — its tile would appear on installs where
release sets are switched off, and open an empty window.

The tempting fix is to evaluate every condition and skip a small list of troublesome ones. That is
wrong twice over. It is fail-closed on anything unfamiliar, and the list is not small: the CMS ships
54 condition implementations, covering blocks, collections, workspaces and content types, before a
single package adds its own.

The real distinction is **whether a condition's answer depends on where the extension is mounted**:

- **Mount-dependent** — `Umb.Condition.SectionAlias`, `Umb.Condition.WorkspaceAlias`, the block and
  collection conditions. These are not unsatisfiable; they are answered relative to the section or
  workspace the extension renders in. The desktop shell is mounted in its own section, so evaluating
  them here returns false for every entry in the catalogue, including the four core dashboards that
  ship today and work. The **iframe** is mounted in the right place and answers them correctly, which
  is precisely where that answer belongs.
- **User- or install-dependent** — a permission check, a server setting, "does any workspace exist".
  These give the same answer in the host and in the iframe. Answering them in the host is not
  duplicating the iframe's work; it is doing it early enough to not open the window.

The desktop should therefore answer only the second kind, and it should be told which those are
rather than inferring it.

### 4.2 `evaluateConditions`, per entry

A new optional field on `UmbraDesktopCatalogueEntry`:

```ts
/**
 * Condition aliases on the referenced manifest that the desktop should answer before showing
 * this app. Only conditions whose answer is independent of where the extension is mounted
 * belong here — a permission, a server setting, an existence check. A mount-dependent
 * condition (section, workspace, collection) is answered by the iframe, which is mounted in
 * the right place; naming one here hides the app everywhere. Omit the field to evaluate
 * nothing, which is how every entry behaved before this existed.
 */
evaluateConditions?: string[];
```

Three aliases across the whole catalogue:

| Alias | Package | What it reads |
|---|---|---|
| `Workflow.Condition.UserPermission` | Workflow | the current user's workflow permission verbs |
| `Workflow.Condition.SettingEnabled` | Workflow | a named server setting |
| `Ua.Condition.WorkspacesExist` | Automate | whether any Automate workspace exists |

The judgment then sits in the diff beside `section` and `chromeProfile`, reviewed the same way,
instead of in a global list somebody has to remember to update. The failure modes are asymmetric in
the right direction: forget an alias and you get a tile that may open blank, which is visible and
recoverable; the only way to make an app disappear is to actively name a mount-dependent alias, and
§7 has a test for that.

`WorkflowUserPermissionCondition` confirms the shape is sound — it extends `UmbConditionBase`,
consumes `UMB_CURRENT_USER_CONTEXT`, and reports through `permitted`. Nothing section- or
workspace-bound, and the desktop element is a perfectly good controller host for it.

### 4.3 The gate

A new `condition-gate.ts` beside the adapter, split the way the rest of the desktop is — pure core,
thin impure shell.

Pure, unit-tested without a registry:

```ts
/** The condition configs on a manifest this entry has opted into evaluating. */
export function evaluableConditions(
  configs: ReadonlyArray<{ alias: string }>,
  evaluate: ReadonlyArray<string> | undefined,
): Array<{ alias: string }>;

/** Permitted unless some condition has explicitly reported false. `undefined` is not yet known. */
export function isPermitted(states: ReadonlyArray<boolean | undefined>): boolean;
```

Impure, a controller on the desktop element: for each entry with `evaluateConditions`, observe
`registry.byTypeAndAliases('condition', aliases)`, instantiate each matching config with
`createExtensionApi(host, conditionManifest, [{ host, config, onChange }])`, and recompute the
catalogue whenever a verdict changes. This mirrors how `UmbBaseExtensionInitializer` does it
internally, minus the parts that assume a mount context.

`#resolveEntry` gains one check, after the manifest lookup and before URL inference: if the gate's
verdict for this entry is explicitly `false`, resolve to a null URL and drop the app. Everything
else in the resolver is untouched.

### 4.4 Unknown is permitted

`isPermitted` returns false only on an explicit `false`. A condition whose manifest has not
registered yet, one whose api fails to load, one that has been created but has not yet reported —
all count as permitted, and the app shows.

This is deliberate and it is the same reasoning as the adapter's existing observation model. A
condition arriving late must make an app *appear*, never make one vanish and come back; a flicker in
that direction reads as a bug in the desktop, and in the worst case a permanently unresolvable
condition would silently delete a working app. The cost is a window that may open empty for a user
the condition would have excluded, which is what the design already accepts everywhere else.

---

## 5. Removing `optional`

`optional` appears in exactly one place in the resolver:

```ts
if (!entry.optional) {
  this.#diagnose(`unknown-ref:${entry.alias}`, `… references unknown extension "${entry.ref}".`);
}
```

It gates a `console.warn` and nothing else. The app is dropped either way, so every entry is already
always evaluated. What the flag really said was "absence is expected here, don't warn" — a
development diagnostic, not behaviour.

Two things kill it. First, after this change 25 of 41 entries would carry `optional: true` — uSync,
the eight Advanced Permissions tools and all sixteen added here — so the flag would be set in the
majority case and the default would be the exception. Second, and
decisively, its inverse cannot be stated honestly: a package can unregister a core extension, so
there is no `ref` the catalogue can require. A flag named `required` would be a promise the
catalogue is not in a position to make, and one named `optional` is then just noise on nearly every
line.

The typo it guarded against — a mistyped `ref` on a core entry — surfaces as a missing tile during
development, which is where a typo gets made.

**What survives:** the `unresolved` diagnostic, which fires when a `ref` *does* resolve to a
manifest but no URL can be inferred from it. That is the failure a missing tile does not explain,
because an app absent for an unsupported kind looks exactly like one absent for an uninstalled
package. The five-second quiet window stays with it, since both the manifest and the section gate
can still arrive late.

Removing the field touches `types.ts`, `app-catalogue.context.ts` and its test fixture,
`synchronisation.ts`, `advanced-security.ts` and `advanced-security.test.ts` — whose *marks every
entry optional* case goes, while the load-bearing *references every tool by ref* case stays.

---

## 6. The catalogue

### 6.1 Module layout

```
catalogue/
  forms.ts        deploy.ts       workflow.ts     commerce.ts
  engage.ts       ui-builder.ts   automate.ts     ai.ts
  commercial.test.ts
```

Each exports `entries`, spread into `index.ts` in group order. No fragment declares a group; groups
stay in `groups.ts`, as they are today.

### 6.2 Groups

Three additions:

- `{ alias: 'marketing-sales', label: '#umbraDesktop_groupMarketingSales', weight: 15 }`, sorting
  between Editing (10) and Development (20).
- `{ alias: 'workflow', label: '#umbraDesktop_groupWorkflow', weight: 12 }` (D13), sorting between
  Editing (10) and `marketing-sales` (15).
- `{ alias: 'automation', label: '#umbraDesktop_groupAutomation', weight: 43 }` (D15), sorting
  between Diagnostics (40) and `ai` (45).
- `{ alias: 'ai', label: '#umbraDesktop_groupAi', weight: 45 }` (D14), sorting between `automation`
  (43) and System (50).

Every other entry lands in a group that already exists.

### 6.3 Entries

All sixteen are `ref`-resolved. Sections take `1100×760` (matching the tree tools, which are denser
than Content's `960×680`); dashboards and workspaces take `1200×780` with a `900×540` floor, matching
every existing `bare` and `workspace-only` entry. Sections set `allowMultiple`.

| Alias | Ref | Section gate | Chrome | Group | Notes |
|---|---|---|---|---|---|
| `forms` | `Umb.Section.Forms` | — | full-section | editing | name + `icon-umb-contour` |
| `workflow` | `Umb.Section.Workflow` | — | full-section | workflow | `icon-stamp` |
| `workflow-tasks` | `workflow.editor.dashboard` | — | bare | workflow | ours: "Workflow tasks" |
| `workflow-search` | `Workflow.AdvancedSearch.Dashboard` | — | bare | workflow | evaluates `UserPermission` |
| `workflow-release-sets` | `Workflow.ReleaseSets.Dashboard` | — | bare | workflow | evaluates `UserPermission`, `SettingEnabled` |
| `deploy` | `Deploy.Management.Dashboard` | — | bare | synchronisation | v17; `icon-umb-deploy` |
| `deploy-environments` | `Deploy.Environments.Dashboard` | — | bare | synchronisation | v17 |
| `deploy-status` | `Deploy.MenuItem.Status` | Settings | workspace-only | synchronisation | v18 |
| `deploy-schema` | `Deploy.MenuItem.Schema` | Settings | workspace-only | synchronisation | v18 |
| `deploy-configuration` | `Deploy.MenuItem.Configuration` | Settings | workspace-only | synchronisation | v18 |
| `ui-builder` | `UiBuilder.MenuItem.Settings` | Settings | workspace-only | development | inherits name + icon |
| `commerce` | `commerce` | — | full-section | marketing-sales | `icon-shopping-basket` |
| `engage` | `Umb.Section.Engage` | — | full-section | marketing-sales | `icon-megaphone` (§3.5) |
| `engage-configuration` | `Engage.MenuItem.Configuration` | Settings | workspace-only | system | ours: "Engage configuration" |
| `automate` | `Ua.Section.Automate` | — | full-section | automation | `icon-lightning` |
| `ai` | `ai` | — | full-section | ai | `icon-wand` |

`workflow` (D13) and `ai` (D14) are the two groups added after this design's first pass; see §6.2.

A dashboard `ref` needs no `section`: the adapter derives the gate from the manifest's own
`Umb.Condition.SectionAlias`. A menu-item `ref` does need one, since nothing in the manifest says
which section it belongs to.

### 6.4 Chrome profiles

Sections are `full-section` for the same reason Content is: the sidebar *is* the navigation, and
these packages put their whole tree there. Deploy's v18 menu items and the Engage and UI Builder
Settings items are `workspace-only` — each is a self-contained workspace and the Settings tree beside
it is noise, exactly as for Log Viewer. The dashboards are `bare`, which additionally strips the tab
strip their host section would show when deep-linked.

---

## 7. Testing

`commercial.test.ts`, following `advanced-security.test.ts`:

- Every entry resolves by `ref` and hardcodes no `url` (D1). The load-bearing invariant.
- Every alias is unique across the whole catalogue — aliases key pinned favourites.
- Every entry's `group` exists in `groups.ts`.
- Every menu-item entry declares a `section`, because nothing in a menu-item manifest says which
  section it belongs to. No dashboard or section-root entry declares one, because both derive it.
- Every alias named in an `evaluateConditions` appears in a documented set of three, so naming a
  mount-dependent condition fails the suite rather than emptying the launcher (§4.2).
- The Deploy fragment carries both majors, and each entry declares a `section` only if its ref is a
  menu item. That the two sets are *disjoint at runtime* is a property of the packages, not of this
  catalogue, so nothing here asserts it — a fake registry serving one major at a time would be
  testing Deploy's release history rather than our code.
- Every `full-section` entry is sized as a section and every `bare` / `workspace-only` entry as a
  dashboard. Added after review caught Commerce and Engage carrying a dashboard's resize floor.
- Commerce's ref is `commerce` and AI's is `ai`, spelled out, so neither is "corrected" (§3.4).
- `marketing-sales` sorts between Editing and Development.
- `workflow` sorts between Editing and `marketing-sales`; all four Workflow entries land in it and
  nowhere else (D13).
- `automation` sorts between Diagnostics and `ai`; the Automate entry lands in it, not System (D15).
- `ai` sorts between Diagnostics and System; the AI entry lands in it, not System (D14).
- Engage's entry carries `icon-megaphone`, not the package's own `engage` icon — pinned so a future
  "fix" back to the package icon does not silently reintroduce the blank tile (§3.5).

For the gate: `evaluableConditions` and `isPermitted` are pure and tested directly, including that
an empty state list and an all-`undefined` list both permit. The controller is tested against a fake
registry, the way `app-catalogue.context.test.ts` already fakes one — an entry drops when its
condition reports false, appears when it reports true, and is present throughout while it reports
nothing.

Both `npm run build` and `npm test` must pass; per CLAUDE.md neither subsumes the other.

---

## 8. Definition of done

- **`README.md`** — the Features list mentions commercial-package support, and a new section names
  the eight packages and what each contributes. Markdown only; it is the NuGet package readme.
- **`umbraco-marketplace.json`** — `Description` names the packages, since "works with Forms,
  Commerce and Deploy" is a reason to install this and nobody will discover it otherwise. `Tags`
  gain all eight package names.
- **Screenshot — deliberately not retaken.** The DoD asks for one when a feature changes what the
  package looks like, and this one plainly does. It was still declined, for a reason worth recording:
  a launcher showing eleven groups and all eight commercial products misrepresents the install
  almost everyone has. Most sites have none of these packages, a few have one or two, and a shot of
  the maximal case reads as overwhelming rather than inviting. `docs/screenshots/launcher.png` keeps
  showing a stock install, which is the honest advertisement.

  Note this is a decision about *this* screenshot, not a general exemption. If the launcher's own
  chrome changes — the width did change here, from 960px to 1180px — the stock shot is genuinely
  stale and worth retaking on a stock install.

  Its README alt text was corrected in passing: it had described groups the image does not contain
  ("Users & Members", renamed to Security and Advanced security a release earlier), which had been
  wrong since that rename.
- **`docs/theming.md`** — untouched; no theme surface changes.
- **Localisation** — `en.ts` and `nl.ts` gain `groupMarketingSales` and the nine app names we author
  (§6.3): three Workflow, five Deploy, one Engage. The other seven entries inherit a label the
  package translates itself, and need no entry.
- **This document** records the v17/v18 Deploy divergence, the Automate pathname rename, the
  `entityContainer` finding and the mount-dependence rule — the four things a build taught that the
  code will not show.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| A mount-dependent alias is named in `evaluateConditions` and the app vanishes everywhere | The documented-set test (§7). The failure is total and obvious in the launcher, not subtle. |
| A package renames an alias between majors | Same exposure the catalogue already has with uSync and Advanced Permissions: the entry drops silently and the section fallback still covers a section root. D1 keeps that quiet rather than broken. |
| Sixteen entries make the launcher long on a fully-loaded install | They spread across five groups and most installs have one or two of these packages. Pinning already exists for the ones a person actually uses. |
| Merge conflict with the desktop-apps design | It also adds a group to `groups.ts`, and its D3 turns `app.url` into a discriminated union in `derive-apps.ts`. This design touches `#resolveEntry` and new fragment files, so the overlap is two files and no shared logic. Whichever lands second rebases. |
| `evaluateConditions` is a field only two entries use | It is opt-in and absent everywhere else, so it costs nothing to ignore. The alternative was a global list that every future package would have to be checked against. |
| The gate's duplicate-construction and stale-config guards are untested | Both were added after review found the windows. Reaching them deterministically needs a controllable delay inside `createExtensionApi` so the interleaving can be forced, which is disproportionate to a fault whose worst outcome is an orphaned api firing redundant recomputes. The window is real, though: `workflow-release-sets` names two conditions from the same Workflow bundle, so they can register in adjacent ticks. Pin them if that file grows a third condition or the gate is refactored. |
| A denied **section-root** entry reappears in "More" rather than hiding | `deriveApps` only records a section as covered when its certified entry resolved, so a section-root entry the gate denies falls through to the uncertified fallback — the server still lists it in `allowedSections`. The gate therefore hides `dashboard` and `menuItem` refs cleanly but only *degrades* a section ref to a generic tile. No entry here relies on it (none of the six section roots names a condition), but anything that does needs an `excludedSections` entry as well. |

---

## 10. Out of scope

- **`entityContainer` in `inferUrl`** (D9). Unlocks seven Umbraco AI menu items; revisit only if we
  ever curate below AI's section root.
- **General condition evaluation.** The resolver evaluates what an entry opts into and nothing else.
  Evaluating conditions by default would need the mount-dependence question answered for all 54 CMS
  conditions, and would be fail-closed while that work was wrong.
- **Deploy's v18 `Deploy.Workspace.Overview`.** Reached from content, not a launchable destination.
- **UI Builder's generated sections.** Unknowable aliases, correctly handled by the existing "More"
  fallback.
- **A Commerce group of its own.** If Commerce add-ons ever justify more than one tile, extract them
  from `marketing-sales` then.
- **Third-party catalogue entries by PR.** Unchanged, and covered by
  [the desktop-apps design](2026-09-06-desktop-apps-design.md) §1.1.
