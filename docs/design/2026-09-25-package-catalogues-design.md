# Package catalogues — Design

> Any package can bring its own catalogue: launcher groups and backoffice deep links, in the same
> shape as the fragment files in `catalogue/`, registered as one extension manifest. When a package
> and the desktop both define the same alias, the package's definition is used, which turns our
> curated copy into a fallback rather than a competitor. The Entertainment package is the first
> consumer: it brings its own Games group, and the desktop stops knowing that games exist.

- **Status:** Proposed. Reviewed 2026-09-27; one blocker and five should-fixes are folded in as
  D9 and D13 to D17 (§13 lists where each landed).
- **Date:** 2026-09-25
- **Branch:** `claude/package-catalogue-manifest-f7eda8`
- **Issue:** [#85](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/85)
- **Target:** Umbraco CMS **v17**, packages `Umbraco.Community.UmbraDesktop` and
  `Umbraco.Community.UmbraDesktop.Entertainment`
- **Builds on:** [PR #82](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/pull/82)
  (Snake, and `resizable` on apps and catalogue entries), which merges first. Everything below
  assumes its state.
- **Supersedes:** D1, D2 and D5 of the [desktop apps design](2026-09-06-desktop-apps-design.md),
  and the first bullet of its §11.

---

## 1. Goal & scope

The launcher fills from two sources today. The curated catalogue in `catalogue/` holds every
backoffice deep link and every launcher group, and only this repository can add to it. Registered
`umbraDesktopApp` manifests hold self-contained apps, and any package can add those. A package that
wants a proper tile for its own section or dashboard, or a heading of its own in the launcher, opens
a pull request here and waits for our next release.

That was deliberate. The desktop apps design (its D1) kept deep links curated for two reasons:
package authors would not self-register, and the maintainer should certify that a deep link and a
chrome profile actually work. Both reasons have worn thin.

- **A curated entry goes stale in the one place its package cannot fix it.** When a package renames
  a dashboard or moves a tool, its own release is where that happens, and our copy stays wrong until
  our next one. The package is the only party that ships in step with its own screens.
- **The host already reserves groups for packages it does not ship.** `games` exists only for
  Entertainment and `advanced-security` only for Advanced Permissions. D5 of the desktop apps design
  accepted that coupling as the price of host-owned grouping. It is the part of this repository that
  most obviously belongs somewhere else.
- **Certification does not scale past the packages we already know.** A package author who tests
  their own entry on the desktop has checked it at least as well as a review here would, and the
  curated catalogue stays for every package that does not ship its own.

That design's own §11 said loosening this boundary was the cheap direction. This is that move.

**In scope**

- A `umbraDesktopCatalogue` manifest type any package may register, carrying groups and entries.
- The merge: how package catalogues combine with ours and with each other, and who wins.
- Registered apps following the same precedence rule, which reverses today's collision rule.
- Picking up catalogues and the extensions they point at when they register late.
- Entertainment registering its own Games group, and the host dropping its copy.
- The package author's guide, and every place in the docs that says a deep link needs a pull request.

**Out of scope:** §11.

**Everything here is frontend.** No controllers, no DTOs, no migrations. The repo's test-first rule
applies as always (§8).

### 1.1 The boundary moves, it does not disappear

| | A package registers it | Curated in this repository |
|---|---|---|
| Self-contained app | `umbraDesktopApp` (unchanged) | n/a |
| Backoffice deep link | `umbraDesktopCatalogue` entries (new) | `catalogue/*.ts` |
| Launcher group | `umbraDesktopCatalogue` groups (new) | `catalogue/groups.ts` |

The curated catalogue keeps two jobs: the desktop's own apps (Content, Media, the Settings tools,
Background Jobs), and a fallback for packages that do not ship a catalogue of their own. What it
loses is the monopoly.

---

## 2. Settled decisions

| # | Decision | Why |
|---|---|---|
| D1 | **One manifest per package**, `umbraDesktopCatalogue`, whose `meta` holds `groups` and `entries` in the curated fragments' shapes, published under names of their own (§3.1) | One shape for one kind of data. An entry moves between a fragment file and a package without being rewritten, it is plain JSON so a static `umbraco-package.json` can carry it, and a package may define any number of groups in it. One manifest per entry and per group was considered and rejected (§10). |
| D2 | **Numbers inside `meta` use the launcher's scale, lower first.** The manifest's root `weight` keeps Umbraco's meaning, higher first, and is used only to rank packages against each other (D6) | A package group has to land between our groups and a package entry often shares a group with ours, so both must be written on the scale ours use. Inverting them at the boundary, as `registered-apps.ts` does for an app's root weight, would make a group impossible to place between two of ours. The root weight stays Umbraco's because it is the field authors set by reflex, which is the lesson of desktop apps D16. |
| D3 | **A package's entry or group replaces ours when the alias matches**, whole, with no field-by-field merge | The package ships in step with its own screens (§1). Our copy becomes the fallback for package versions that predate their own catalogue, instead of a conflict. The alias is also what a pin is stored under, so a package that reuses our alias keeps every user's pins. Whole replacement means what shows is exactly what the package wrote: no tile with their name and our stale icon. |
| D4 | **Registered apps follow the same rule.** A `umbraDesktopApp` whose alias a curated entry owns now replaces that entry, where today it is dropped | One rule for everything a package registers. Today's curated-wins rule rested on the curated side being the verified one, which D3 no longer treats as decisive. |
| D5 | **Only catalogues in effect count.** A package catalogue whose conditions are unmet for the current user claims nothing, so that user sees our entries exactly as before | It falls out of observing through `UmbExtensionsManifestInitializer`, the same route registered apps take and the only one that evaluates conditions. Claiming aliases by registration instead needs a second observation of the raw registry, for a case nobody has: a package that gates its catalogue *and* overrides ours. The fallback it produces is today's behaviour, not a new one. |
| D6 | **Two packages defining one alias:** the manifest with the higher root `weight` wins, then the lower manifest alias compared ordinally, and the console names both unless the two agree (D13) | Package bundles load in whatever order they finish, and the initializer breaks weight ties in the order permissions happened to resolve, so "first registered wins" would differ between two loads of the same page and the sort has to be the merge's own. Ordinal means `<`, not `localeCompare`, whose answer depends on the browser's locale. Any fixed rule is fine for what is usually a mistake, as long as it gives the same answer every time and says so. Applies to entries, groups and registered apps alike. One package defining an alias twice in its own list is reported in its own words, since a message naming the same manifest twice explains nothing. |
| D7 | **A package entry pointing at the same `ref` as a curated entry, under another alias, shows both**, and the console suggests reusing our alias | Two tiles is visible and honest, and the author sees it the first time they open the launcher. Dropping ours by `ref` instead would either lose users' pins or need the package entry to silently adopt our alias, and an entry whose alias is not the one its author wrote is the harder bug to explain. |
| D8 | Package entries are tagged **`certified`** | The tier means "this will work", and nothing reads it yet (desktop apps D4). If it is ever shown to anyone, it needs a third value first, and that is the moment to add one. |
| D9 | **The merge accepts any input and never throws.** `meta`, `groups` and `entries` may be missing or of the wrong type. Items must be plain objects; `alias`, `ref`, `url`, `section`, `name`, `icon`, `group` and `label` must be strings when present; `chromeProfile` one of the three profiles; sizes finite and positive `{ w, h }`; `weight` a finite number; `evaluateConditions` an array of strings; the flags booleans. A bad required field drops the item, a bad optional field drops only that field, and both are reported. Also dropped: an entry with neither `ref` nor `url`, and a group claiming the reserved More alias | Third-party data, and nothing type-checks a static `umbraco-package.json`. One malformed package must not cost every user their launcher, and it would: an `entries` object where an array belongs, or a numeric `name` reaching the `localeCompare` tie-break in `groupApps`, makes every recompute throw, which freezes the launcher at its last good state for everyone on the install, and a throw during the initializer's disconnect flush escapes `hostDisconnected` and leaves later controllers connected. The same `localeCompare` crash exists today for a JSON `umbraDesktopApp` whose `meta.label` is not a string, so `registered-apps.ts` is hardened on the same pass. A group with no `weight` is kept and reported rather than dropped: it sorts ahead of every group we ship, which is almost never meant. |
| D10 | **Entertainment registers `games`; the host drops its `games` group and both strings** in the same release | It removes the one piece of the host that exists only for another package. An older Entertainment on a newer host shows its games under More until Entertainment is updated. That combination is not rare: the dependency is a range, `[17.0.0,18.0.0)`, so updating only the host is the ordinary way to reach it. But nothing breaks, and the fix is an update published the same day (desktop apps D13). Keeping the host's copy until v18 was considered (§10). |
| D11 | **Our group weights and curated entry aliases become a published API**: not renumbered, not renamed | A package positions a group by our weights (§3.2) and replaces an entry by our alias (D3). Entry aliases were effectively fixed already, because renaming one loses its pins. Theme ids are published the same way ([desktop-apps.md](../desktop-apps.md) §5). One alias carries more than a pin: the taskbar's AI chat button resolves `copilot-workspace`, and its one-chat-window rule relies on that entry's `allowMultiple: false`, so the guide names it as an alias a replacement must keep single-window. |
| D12 | **No `excludedSections` and no per-entry `conditions` in a package catalogue**, for now | Nobody has asked for either, and both can be added later as optional fields without breaking anyone. Per-entry conditions have a working answer today: `evaluateConditions` reuses the conditions on the screen an entry points at, or a package registers a second catalogue for its gated tiles. |
| D13 | **A replacement is reported unless it is like-for-like**: an entry that keeps its target (the same `ref`, or the same `url`), a group that keeps its `weight`. Anything else, over one of ours or over another package's, prints one line naming the manifest and the old and new target | Our aliases are bare words (`settings`, `media`, `forms`), so a package can take one over by accident: an entry aliased `settings` pointing at its own dashboard would turn the core Settings tile, and everyone's pins on it, into that dashboard in silence. A group redeclared with another weight moves or renames one of ours for everyone, which contradicts D11's promise that our weights are something to place against. A like-for-like replacement is the feature working and stays quiet. The guide adds the two habits that avoid the rest: namespace a new entry's alias, and do not redeclare a group you did not create. |
| D14 | **A package `url` must be a same-origin backoffice path**: http or https, this origin, under `/umbraco/section/`. Anything else is dropped and reported, and so is any entry that resolves to the desktop's own section | Every screen a window can host lives under `/umbraco/section/`, and the rest of `/umbraco/` is somewhere a window must not go: the login page, preview, and the management API, which is backoffice-only JSON. Every iframe feature also assumes a readable frame. A cross-origin one gets no chrome stripped, no theme, no dirty tracking, and a loader that waits out its whole twelve-second safety net, because the chrome injector returns before calling back. A `javascript:` URL is worse: the window binds `src` directly and Lit does not sanitise it, so it runs in the backoffice's origin. An installed package can already run code, so that is no new power by itself, but a package that builds its catalogue from editor-supplied data would become a stored-XSS sink in the desktop, and the AI open-window tool can launch such a tile when the model asks. Every curated `url` already satisfies the rule. The desktop's own section is refused because `excludedSections` only guards the fallback, so an entry could otherwise open a desktop inside a desktop window. |
| D15 | **A pin on a section's fallback tile follows the section.** A pinned `section:<alias>` that no longer resolves falls back to whichever app now covers that section as its root. The `section:` prefix is reserved, and a package entry claiming it is dropped | The headline adoption path would otherwise break pins. A section with no entry shows as `section:My.Package.Section` under More, and users pin it. The package then ships the entry this design sells, whose `ref` suppresses the fallback, and every such pin stops resolving without a word. D3's pin promise only covered packages that already had a curated entry, and most have none. The same gap exists today whenever this repository curates a section that used to be a fallback, so the fix is not package-specific. Reserving the prefix stops an entry for a dashboard from duplicating a fallback's alias. |
| D16 | **Watched refs follow the merged catalogue under three invariants.** A ref is marked watched before it is subscribed. While subscriptions are being set up, their synchronous callbacks only record the manifest, and one recompute follows. Nothing is subscribed once the context is destroyed, and while it is stopped the setup waits for `hostConnected` (§5) | `UmbObserverController` subscribes, and so emits and recomputes, before it registers itself as a controller. A natural "add to the watched set after `observe()`" therefore loops, observe, callback, recompute, observe, until the stack overflows, the first time any package entry introduces a ref. Deferring the setup to a microtask instead opens two lifecycle holes: an observation created after `destroy()` lives on a dead context, and one created during `hostDisconnected` is never reached by that pass, so it stays subscribed while the desktop is closed. One helper serves both the constructor and the recompute, and it turns the forty-odd synchronous recomputes that construction does today into one. |
| D17 | **This merges before [#88](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/pull/88), and Accessories registers its own `accessories` group** (weight 55) through a catalogue manifest, with its own strings, instead of adding it to the host. Confirmed by the owner 2026-09-27 | #88 adds `accessories` to the host's `groups.ts` and dictionaries "on the same contract as games", which is the coupling D10 removes, and its new host test dereferences `games`, which this deletes, so that test throws after a rebase. Landing this first means Accessories never ships a version without its own group. Landing #88 first would mean removing `accessories` from the host later, a second D10 with tools under More on a newer host. Keeping it as a desktop-wide host category any tool may use was the alternative, and was not chosen: Accessories is a package's heading, as Games is. |

---

## 3. The contract

### 3.1 The manifest

What Entertainment registers:

```ts
{
  type: 'umbraDesktopCatalogue',
  alias: 'Umbraco.Community.UmbraDesktop.Entertainment.Catalogue',
  name: 'UmbraDesktop Entertainment catalogue',
  meta: {
    groups: [{ alias: 'games', label: '#umbraDesktopEntertainment_groupGames', weight: 60 }],
  },
}
```

What a package with a section of its own might register, from a static `umbraco-package.json`:

```json
{
  "type": "umbraDesktopCatalogue",
  "alias": "My.Package.DesktopCatalogue",
  "name": "My Package desktop catalogue",
  "meta": {
    "entries": [
      {
        "alias": "My.Package.DesktopApp",
        "ref": "My.Package.Section",
        "icon": "icon-rocket",
        "chromeProfile": "full-section",
        "defaultSize": { "w": 1100, "h": 760 },
        "group": "development",
        "weight": 30
      }
    ]
  }
}
```

The host declares it beside `umbraDesktopApp` in the same way, registering it in Umbraco's
`UmbExtensionManifestMap`:

```ts
/** A launcher group a package defines. `auto` marks the desktop's own More group and is not offered. */
export type UmbraDesktopPackageGroup = Omit<UmbraDesktopGroup, 'auto'>;

/** A deep-linked entry a package defines: today exactly the curated entry's fields. */
export type UmbraDesktopPackageEntry = UmbraDesktopCatalogueEntry;

export interface MetaUmbraDesktopCatalogue {
  groups?: UmbraDesktopPackageGroup[];
  entries?: UmbraDesktopPackageEntry[];
}

export interface ManifestUmbraDesktopCatalogue extends ManifestWithDynamicConditions {
  type: 'umbraDesktopCatalogue';
  meta: MetaUmbraDesktopCatalogue;
}
```

`ManifestWithDynamicConditions` brings `conditions`, the root `weight` and Umbraco's own
`overwrites`. Nothing on the manifest loads code, so there is no `element` or `js`.

The two published names are aliases today, and they have names of their own so that a field the
curated catalogue grows for itself does not leak into the public contract by default. The contract
makes one promise that everything else leans on: **these types only ever gain optional fields.**
Nothing is removed, narrowed or given a new meaning. That is what keeps a consuming package's
hand-copied declaration honest, because a copy that lags behind still describes a valid manifest,
where a copy that contradicts the host compiles just as cleanly and fails at runtime.

Entries should be namespaced like any Umbraco alias (D13). The bare words the curated catalogue uses
are ours, and reusing one is how a package says it means to replace that entry.

### 3.2 Groups

A group is `alias`, `label` and `weight`, as in `catalogue/groups.ts`. The label should be a token
from the package's own dictionary. `auto` is not part of the published type, and is ignored if a
static manifest carries it anyway: it marks the reserved More group, which only the desktop
synthesises.

The weight places the group among ours. These are published (D11):

| Group | Weight |
|---|---|
| Editing | 10 |
| Workflow | 12 |
| Marketing and sales | 15 |
| Development | 20 |
| Synchronisation | 25 |
| Security | 30 |
| Advanced security | 35 |
| Diagnostics | 40 |
| Automation | 43 |
| AI | 45 |
| System | 50 |
| *(Accessories, the Accessories package's, D17)* | *55* |
| *(Games, now Entertainment's)* | *60* |
| Experimental | 70 |
| More (reserved, always last) | 9999 |

More stays last whatever a package asks for. A package group weighted at or above More's is placed
just before More and reported, since the table above promises "always last" and one package must
not be able to break that promise for everyone.

A weight of 1000 or more anywhere inside `meta` is almost certainly the D2 trap, an author writing
Umbraco's higher-first number in a field that sorts lower first, so it is accepted and reported. The
largest weight we use for a group is 70, and for an entry within a group well under that.

An entry or app naming a group nobody defines falls into More, as it does today, and says nothing:
the group may belong to another package that simply is not installed.

### 3.3 Entries

Every field of a curated entry, with the same meaning: `alias`, `ref` or `url`, `section`, `name`,
`icon`, `chromeProfile`, `defaultSize`, `minSize`, `allowMultiple`, `resizable` (from #82),
`weight`, `group` and `evaluateConditions`. A package entry is resolved by the same code as ours, so
it gets the same URL inference, the same section gate and the same diagnostics. In particular an
entry whose `ref` is a section suppresses that section's uncertified fallback tile, which is the
most common thing a package author wants: their section in the right group with the right icon,
instead of a generic tile under More. Pins made on that fallback tile follow the section to the new
entry (D15).

Four rules a package entry meets that the curated ones never had to state, because this repository
wrote them:

- **`url` is a same-origin backoffice path** (D14). `ref` is still the better choice wherever it
  infers, because it is existence-checked and a `url` is not.
- **`chromeProfile` is one of the three profiles.** A typo would otherwise behave like
  `workspace-only` without its path handling, which is the kind of half-working window nobody can
  diagnose from the outside, so it is dropped and reported instead (D9).
- **A menu-item `ref` needs `section`.** It is the most likely author error, and the diagnostic says
  "add a section" rather than today's suggestion of an explicit `url`.
- **Replacing one of ours means restating all of it.** Replacement is whole (D3), so an entry that
  replaces a curated one loses anything it leaves out, such as Workflow's `evaluateConditions`.
  The guide says to start from the fragment being replaced, not from a blank entry.

And one about the manifest rather than its entries: a mount-dependent condition on the catalogue
manifest itself, `Umb.Condition.SectionAlias` for instance, is answered at the desktop, where it
never passes, so the catalogue silently never applies. The guide warns about it next to D5.

---

## 4. Precedence

The whole rule is one sentence: **a package's definition beats ours for the same alias, and a clash
between two packages is settled by weight and reported.** In detail, on every recompute:

1. Start from the curated catalogue.
2. Take the package catalogues currently in effect, meaning registered with their conditions met
   (D5), and sort them by root weight descending, then by manifest alias compared ordinally. The
   initializer's own order cannot stand in for this sort: it breaks weight ties in the order
   permissions resolved, which is asynchronous (D6).
3. Validate every group and entry, dropping and reporting what fails (D9, D14, D15). Nothing past
   this step meets a value of the wrong type.
4. For each group alias, and separately for each entry alias, the first package definition in that
   order wins. A later one is dropped, and reported naming both manifests unless it agrees with the
   winner (D6, D13).
5. A package group replaces the curated group with its alias, or is added. Same for entries (D3).
   A replacement that is not like-for-like is reported (D13).
6. Registered apps take part in the entry namespace: an app whose alias a curated entry owns
   replaces it (D4), and an app whose alias a package entry owns is a clash between packages,
   settled as in step 4 using each manifest's root weight.
7. A package entry whose `ref` matches a curated entry that it did not replace gets the hint from D7.
   The hint names both entries and says that reusing the alias is how to replace ours. For a core
   `Umb.*` screen it says only that the screen already has a tile, since a package taking over a core
   tile is rarely what it meant.

The merged list keeps a fixed order, because it feeds `getApps()` and settles ties in the launcher:
curated entries in fragment order with any replacement in its place, then package additions in the
order of step 2, each package's in its own order. Groups the same way.

Group aliases and entry aliases stay separate namespaces, as they are today: `ai` is both an entry
and a group, and nothing about that is a clash.

"Reported" means one console warning naming the manifest, through the diagnostics the context
already has: held until the registry has been quiet for five seconds, so a state that was only
transient during boot never prints, and printed once rather than on every recompute. The existing
diagnostics about an entry, `ungated` and `unresolved`, now name the manifest the entry came from as
well as its alias, in the message and in the deduplication key. A like-for-like replacement of one
of ours is not reported at all. It is the feature working.

A catalogue that stops being in effect, because its conditions flip or its manifest is unregistered,
gives its aliases back, so our entries reappear on the next recompute. With conditioned catalogues
that means the winner of a D6 clash can differ from one user to the next. It reverses the reasoning
the context records for registered apps today ("reserved is reserved", so that the answer does not
depend on who is looking), and it is acceptable here only because a clash is a reported mistake,
not a state anyone should run in.

One consequence that will look like a bug unless it is written down: an app, or a dashboard or
menu-item entry, that replaces a section-root entry such as `content` or `forms` no longer covers
that section, so the section's uncertified fallback tile comes back under More. That is correct,
because nothing else opens the section any more, and it is tested.

Umbraco's `overwrites` works between catalogue manifests as it does for any extension, within two
limits. The catalogue doing the overwriting is still merged, and it removes the other only while it
is itself in effect. And removal happens within one extension type, so a catalogue cannot overwrite a
registered app, or the reverse. Our curated catalogue is not a manifest, so `overwrites` cannot reach
it: reusing an alias is how a package replaces ours.

---

## 5. Registering late

Package bundles import in whatever order they finish, so a catalogue can arrive after the desktop has
mounted, and so can the extensions its entries point at. The desktop already handles the second half
for curated entries, one `byAlias` observation per distinct `ref`, but it builds that list once in
the constructor (`#refs()` in `app-catalogue.context.ts`), from a catalogue that could not change.

That list now follows the merged catalogue, through one helper that the constructor and the
recompute both call, under D16's three invariants:

1. **Mark before subscribing.** A ref goes into the watched set before `observe()` is called. The
   observer emits synchronously from inside its own constructor, before it has registered as a
   controller, so marking afterwards re-enters the helper from its own callback and never stops.
2. **One recompute per batch.** While the helper is subscribing, the callbacks only record the
   manifest. When it is done, it recomputes once. That also collapses the forty-odd synchronous
   recomputes construction does today into one.
3. **Respect the lifecycle.** Nothing is subscribed once the context is destroyed. While it is
   stopped, having left the desktop section, the helper records what it would watch and subscribes on
   `hostConnected`: an observation created during `hostDisconnected` is never reached by that pass,
   and would stay subscribed with the desktop closed.

A `ref` that drops out stays watched, which saves re-subscribing when a condition flips back. That is
cheap rather than free: every watched ref re-scans the registry on each registry change. The count is
bounded by the refs any catalogue has named in the session, which is dozens, not hundreds.

Two pieces of teardown come with it:

- The condition gate forgets an entry that leaves the merged list, not only one whose ref has gone,
  so its condition checks stop firing.
- `#recompute` becomes a no-op once the context is destroyed. Today `destroy()` destroys the gate
  before `super.destroy()`, whose initializers then report empty lists, and the recompute that follows
  re-tracks entries on the dead gate, leaving condition checks on the desktop element that nothing
  destroys. That is pre-existing, and a second initializer makes it likelier.

Three things that are fixed at construction today move to the recompute for the same reason:

- The alias check for registered apps runs against the merged catalogue rather than a set built once.
- The static checks in `#validateCatalogue` still run for the curated catalogue, and the ones that
  apply to package entries (`url` with `evaluateConditions`) go through the quiet-window diagnostics
  instead, since a package's entries are not there at construction.
- The taskbar's AI chat feature reads the Copilot Workspace's `ref` from the merged catalogue through
  the context, not from the static curated one at module load. Otherwise a package that replaced that
  entry would leave Settings giving the wrong reason for the button being unavailable.
  `isRefRegistered` is documented as answering for any ref the merged catalogue names. Measured
  while building it, it answers within the very recompute that first names a ref, because
  `#watchRefs` records the manifest before that recompute publishes. The one gap is a ref first
  named while the desktop is closed, which answers `false` until it reopens.

One lesson from building this, recorded because it will otherwise cost the next person an hour: the
recursion D16 guards against does not fail a test that only checks the result. RxJS swallows the
stack overflow, and the case finishes with the right app after a couple of hundred nested
subscriptions. The test that holds the invariant counts `byAlias` subscriptions instead.

---

## 6. Entertainment

The games do not move. Minesweeper and Snake stay the `umbraDesktopApp` manifests the add-on already
registers, exactly as #82 leaves them, because each is code with conditions of its own and the
catalogue is data. What is new is one more manifest in the same add-on, defining the group the games
already name, so everything about games then lives in the add-on and nothing in the host. The add-on's
whole registration, comments trimmed:

```ts
// New: what the launcher is arranged into. Data only.
const catalogue: UmbExtensionManifest = {
  type: 'umbraDesktopCatalogue',
  alias: 'Umbraco.Community.UmbraDesktop.Entertainment.Catalogue',
  name: 'UmbraDesktop Entertainment catalogue',
  meta: {
    // After System (50) and before Experimental (70), on the launcher's scale (§3.2).
    groups: [{ alias: 'games', label: '#umbraDesktopEntertainment_groupGames', weight: 60 }],
    // No entries: an entry deep-links a backoffice screen, and this package has none.
  },
};

// Unchanged: each game is its own app, and names the group above.
const minesweeper: UmbExtensionManifest = {
  type: 'umbraDesktopApp',
  alias: 'Umbraco.Community.UmbraDesktop.Entertainment.Minesweeper',
  name: 'Minesweeper',
  element: () => import('./minesweeper/minesweeper.element.js'),
  weight: 1000, // Umbraco's scale, higher first: leads its group
  meta: { label: '#umbraDesktopEntertainment_minesweeper', icon: 'icon-bomb', group: 'games' /* sizes, resizable: false */ },
};

const snake: UmbExtensionManifest = {
  type: 'umbraDesktopApp',
  alias: 'Umbraco.Community.UmbraDesktop.Entertainment.Snake',
  name: 'Snake',
  element: () => import('./snake/snake.element.js'),
  weight: 900,
  meta: { label: '#umbraDesktopEntertainment_snake', icon: 'icon-game', group: 'games' /* sizes, resizable: false */ },
};

export const manifests: Array<UmbExtensionManifest> = [catalogue, minesweeper, snake, ...localizationManifests];
```

The two weights in that file answer different questions, and it is the one place D2 is visible to
an author: 60 places the Games group among ours, while 1000 and 900 order the games inside it the
way every Umbraco extension orders itself. The guide has to say so where an author will see it.

- **The catalogue manifest** above, beside the two games. Its label is "Games" in English and
  "Spellen" in Dutch, in the package's own dictionaries.
- **The hand-copied types** in `umbradesktop-app.d.ts` gain the catalogue type, groups and entries
  both. Entertainment only uses groups, but that file is the worked example a third party copies,
  and most of them will want entries. It carries the same warning as the app type: a copy of a
  contract that lives in another package, which drifts if the host adds a field.
- **The host drops** the `games` group from `catalogue/groups.ts`, `groupGames` from both of its
  dictionaries, and the Games cases in `groups.test.ts`. Experimental is then the last real group
  before More, and that test says so directly.

Neither package's `umbraco-package.json` changes: the manifest reaches Umbraco through the bundle,
like everything else in both packages.

---

## 7. Documentation

- **A guide for package authors**, `docs/package-catalogues.md`: when a catalogue is the right tool
  and when `umbraDesktopApp` is, the manifest, the entry fields and the URL inference behind `ref`,
  chrome profiles, the published group weights and entry aliases, precedence, and what the console
  says when something is dropped. A contributor extending the desktop from outside is exactly who a
  separate guide is for, as theming has one. It also carries the habits the review turned up:
  namespace a new entry's alias, do not redeclare a group you did not create, start a replacement
  from the fragment it replaces, keep mount-dependent conditions off the catalogue manifest, keep
  `copilot-workspace` single-window, and use `ref` over `url` wherever it infers.
- **`docs/desktop-apps.md`**: §1's table points backoffice surfaces at the new guide instead of a
  pull request, §6 stops describing `games` as a contract between two packages, and the §8 trap "an
  alias a curated entry already owns loses" becomes the opposite. Two more places go stale with it:
  §2's row for `alias`, and the §8 trap "Three things can make your app not appear".
- **Code comments that state the old boundary**: the header of `app.extension.ts` (its "no `url`, no
  `section`" argument), and the comments in `app-catalogue.context.ts` on `#curatedAliases` and on the
  collision filter in `#resolveRegisteredApps`.
- **`README.md`**: the Features bullet on apps that are not the backoffice, the "Custom and
  third-party apps" section where it says a deep link needs a pull request, and the Documentation
  section's list of guides.
- **The desktop apps design** gets a pointer at D1, D2, D5 and §11 to this document, struck through
  the way its own reversed rows already are.
- **The Marketplace listing** for the host gains a tag for the new seam. Its `Description` does not
  change: this does not change what the package is.

---

## 8. Testing

Tests first, as the repo asks. Both `npm run build` and `npm test`, in both packages.

- **The merge, as a pure function.** Replacement by alias for entries and for groups; additions;
  two packages clashing, settled by weight then alias compared ordinally, with the clash reported;
  one package defining an alias twice; a like-for-like replacement staying quiet while a changed
  target or weight is reported; malformed data dropped with a reason; the reserved More alias and the
  `section:` prefix refused; `auto` ignored; a missing group weight reported; a group weighted at or
  past More placed before it; a weight of 1000 or more reported; the fixed order of the merged list.
- **Garbage in `meta` never throws.** Every wrong type D9 lists, one at a time, and after each one
  the launcher still updates when another catalogue registers. A JSON `umbraDesktopApp` with a
  numeric `meta.label` too, since that crash exists today.
- **`url` is refused unless it is a same-origin backoffice path**: `javascript:`, another origin, a
  path outside `/umbraco/`, and an entry resolving to the desktop's own section are all dropped.
- **The context, against a real registry**, the way its tests already run. A package catalogue's
  group and entry appear. An entry replacing a curated one keeps the alias and uses the package's
  fields. A catalogue registering after mount is picked up, including a `ref` it introduces that
  also registers late, and that ref is subscribed exactly once (§5 says why the count, not the
  result, is what catches the recursion). Nothing is subscribed while the desktop is closed, and it
  catches up once on reopening. Construction's single recompute is structural and has no observable
  effect to assert. A catalogue whose condition flips off gives our entry back. A registered app with
  a curated alias now replaces the entry, which inverts an existing test. An app or non-section entry
  replacing a section-root entry brings the section's fallback back. The D7 hint appears once. A
  destroyed context no longer recomputes.
- **Pins follow the section** (D15): a pin on `section:<alias>` resolves to the package entry that
  replaced the fallback, and stops resolving only when nothing covers the section.
- **Entertainment's manifest test** asserts the Games group: its alias, its token label, and a weight
  between System's and Experimental's, written as literals with the reason beside them, since the
  package cannot import the host's list.
- **In a browser**, with both packages in the test instance: the Games group shows both games under
  the package's own label, in English and in Dutch, and a pinned game survives the change.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| A package's entry is wrong, a bad chrome profile say, and replaces a curated one that worked | The price of D3, and accepted. The package can fix it in its own release, which is the point, and the guide spells out the traps the curated fragments' comments record. |
| A package overrides a core entry or group for everyone, `content` or `system` say | It is a package the site owner installed, and Umbraco packages can already overwrite or exclude any extension in the backoffice. This is not a new kind of power. |
| Consuming packages hand-copy the types and the copies drift | Already true of `umbraDesktopApp`. A copy that lags behind stays correct because the types only ever gain optional fields (§3.1). A copy that contradicts the host compiles silently, which is why that promise matters more than the copies do. |
| An older Entertainment on a newer host shows its games under More | D10. Nothing breaks, and it lasts until Entertainment is updated, though updating only the host is a common way to get there. |
| A package builds its catalogue from data editors can change | D14 keeps a `url` inside the backoffice, and D9 keeps the merge alive whatever the data holds. Everything else a package supplies is rendered as text. |
| Tile names reach the AI desk tools word for word, so a catalogue built from editor data is a prompt-injection channel | Not new in kind: section and app labels already reach the agent the same way. Worth a look if the AI tools ever act on names rather than aliases, and out of scope here. |
| Published weights and aliases (D11) stop us renumbering groups | Accepted. There is room between every pair we ship, and aliases were already frozen by pins. |

---

## 10. Alternatives considered

- **One manifest per entry and per group** (`umbraDesktopLink`, `umbraDesktopGroup`). The most
  Umbraco-shaped option: per-entry conditions, `exclude` and `overwrites` on a single tile, one row
  per tile in the backoffice's extension list. Rejected for two costs. The types cannot agree on
  weight: an entry would sort Umbraco's way like an app, while a group has to sit among ours and so
  must use our scale. And it gives the same data two formats, our fragment files and package
  manifests, unless all forty curated entries become manifests too. Single-tile `exclude` would also
  cover package tiles only, never ours, so hiding a tile stays a desktop feature either way (§11).
- **Our definition wins.** Keeps certification decisive, but it means a package can never correct
  our stale copy of its own screens, which is the main reason to do this at all.
- **Precedence by `ref` instead of alias.** Catches a package that does not know our alias, but
  breaks the pins on ours unless the package entry quietly takes our alias. D7's hint gets the same
  result without the magic.
- **Registering our own catalogue as a manifest.** One mechanism for everything, and `overwrites`
  would reach our entries. It turns every test that injects a catalogue into one that registers
  manifests, gives our entries a load order they do not have today, and needs `excludedSections` in
  the package shape. A lot of churn for a symmetry nobody needs.
- **A JSON file per package, discovered by the server.** Would need C# in a package that has none
  outside packaging, and the extension registry already is a discovery mechanism, one that a static
  `umbraco-package.json` can feed.
- **Keeping the host's Games group until v18.** No degraded combination at all, and Entertainment's
  copy would win anyway. Rejected because it keeps the one coupling this removes, as a dormant row
  somebody has to remember to delete.
- **A field-by-field merge**, a package patching only the icon on our entry. More power, but a tile
  becomes the sum of two authors, and "why does my tile have your chrome profile" is a question
  nobody should have to answer.

---

## 11. Out of scope

- **Per-entry conditions and `excludedSections`** in a package catalogue (D12).
- **Hiding or rearranging a tile**, ours or a package's. A launcher you arrange yourself is
  [#59](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/59).
- **Publishing the manifest types** as a package a consumer can import, which would end the
  hand-copied declarations. The host's npm package is private and its NuGet package ships built
  JavaScript, so this is a distribution question of its own.
- **Moving curated fragments out of this repository**, for instance `advanced-security.ts` into
  Advanced Permissions. Each is a follow-up for that package once it ships a catalogue, and until
  then the curated fragment is the fallback that D3 exists to keep working.
- **One shared declaration file for the add-ons.** Once #88 lands there are three copies of these
  types: the host's, Entertainment's and Accessories'. The two add-ons could share one. Worth doing
  then, and not a reason to hold this.

---

## 12. Definition of done

- [ ] `npm run build` and `npm test` pass in both packages.
- [ ] `README.md` updated in every place §7 lists.
- [ ] The host's Marketplace listing carries the new tag; the Entertainment listing needs no change.
- [ ] `docs/package-catalogues.md` exists, and `docs/desktop-apps.md` and the desktop apps design
      point at it.
- [ ] Anything a build teaches that the code does not show is written where the next person will
      hit it.

---

## 13. Review, 2026-09-27

An adversarial review, run against the code at `a692780` (after #82), Umbraco's own registry source
and #88, found one blocker and five should-fixes. Each was checked against the code before being
folded in:

| Finding | Where it landed |
|---|---|
| Malformed JSON makes every recompute throw, freezing the launcher for everyone | D9, §8 |
| Pins on a section's fallback tile are lost when its package ships an entry | D15, §8 |
| Replacing a bare alias, or a group's weight, is silent even when it is a mistake | D13, §3.1, §8 |
| A package `url` can be cross-origin or `javascript:` | D14, §3.3, §8 |
| #88 adds a host group of the kind this removes, and its test reads `games` | D17 |
| Observing new refs from inside the recompute recurses, or leaks when deferred | D16, §5 |

The notes went into D6, D10, D11, §3.2, §3.3, §4, §5, §7, §9 and §11. The review also confirmed the
claims this design rests on: `observe` answers synchronously, the initializer hands back only
permitted manifests sorted by weight with `overwrites` applied, a condition flip gives aliases back,
late refs resolve in either order, and nothing new runs at backoffice boot outside the desktop.

One finding concerned #88 rather than this design, so it belongs on that PR: its screensaver starts
at backoffice boot, walks every element and shadow root every five seconds before checking whether
it is enabled, and keeps every frame window it has listened to until it stops, which likely holds
each closed window's backoffice in memory for the rest of the session.

---

## 14. Implementation review, 2026-09-27

A whole-branch review of the built feature, against main after #90 and #92, found no blocker and
three should-fixes, all fixed test-first:

- **D9 had a gap outside the catalogue.** A tile with no `name` inherits the label of the extension
  it points at, and a fallback tile takes its section's label, both from another package's JSON, and
  a non-text one reached `groupApps`' `localeCompare` and threw. The sort now compares strings, the
  inherited label, icon and section label are read only when they are text, and a dashboard's
  `conditions` that is not a list no longer throws. The two places that call `#recompute` directly,
  the constructor and `hostConnected`, catch and report a throw, because one escaping from
  `hostConnected` stops Umbraco's controller loop and leaves the desktop's theme styles and server
  events disconnected.
- **The branch was behind main.** Rebased onto #90 and #92 by hand; the two test doubles those added
  gained the new `entryRef` and `getEntryRef`.
- **The teardown test passed without the guard it protects.** It now registers an app first, so the
  initializers really do report during `destroy()`, and it fails with the guard deleted.

The notes were folded in as well: a `url` entry replacing a conditioned one releases its condition
checks, an entry-level `conditions` is reported rather than silently ignored, clash messages say what
each side wanted, only the first app for a section covers it, the published group weights are held
by a test, and the guide says which aliases are reserved and which are published.
