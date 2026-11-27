# Umbraco 19 rc1, and the audit that came with it

Date: 2026-11-19. Against Umbraco 19.0.0-rc1 (server reports `19.0.0-rc1+b158b78`), .NET SDK 11.0.100.
Follows [the beta doc](2026-11-04-umbraco-19-beta-design.md).

## 1. Goal and branch

Bring `v19/main` up to date with everything released on 17 and 18, move it from 19.0.0-beta1 to
19.0.0-rc1, and use the move for an audit: what 19 deprecates that we use, what it offers that we
should use, and what of our own is worth breaking while a major allows it. Then test every feature in
a browser on rc1.

Branch `claude/v19-rc1-audit`, cut from `origin/v19/main`. One commit, the merge of `main` (release
18.0.0) into it; everything after that is uncommitted.

## 2. The branches after 17.5.0 and 18.0.0

Checked before merging anything up.

- `main` holds all of `v17/main` by content. The 17.5.0 release merge-back on `v17/main` (the squash
  8ce630d) is not in `main`'s ancestry, but the trees match, so nothing is missing. An empty merge-up
  would record the ancestry; nothing depends on it.
- Each release merge-back is content-identical on both branches, the publish runs are green, and all
  six packages are on NuGet at 17.5.0 and 18.0.0.

## 3. The move to rc1

- `global.json`: SDK `11.0.100`, the final .NET 11, where the beta needed its release candidate.
- `UmbraDesktopUmbracoFloor` and every frontend's `@umbraco-cms/backoffice` pin: `19.0.0-rc1`. UUI:
  `2.2.0`, core's lock at `release-19.0.0-rc1`.
- Test instance: the commercial packages float `19.*-*`; Umbraco.AI and its parts are at `rc.1`.
- The docs that name the floor (README, RELEASE, installation, the add-ons' user pages, CLAUDE.md)
  say rc1. The add-on developer docs' NuGet ranges (`[19.0.0-beta.1, ...]`) are left until the next
  tag is known.

**Umbraco Engage is left out of the test instance.** Engage's and Forms' rc1 are built against
CsvHelper 33.1; Workflow's and UI Builder's against 34, which has no `ClassMap<T>`. NuGet resolves
34, and the site fails at boot scanning Engage's types (`TypeLoadException` on
`CsvHelper.Configuration.ClassMap`1`). Forms boots with 34. Worth reporting to Umbraco; put Engage
back when the four agree. The csproj also lost a `Condition` on a property nothing ever set.

## 4. The audit

### Changed

| What | Why | Where |
|---|---|---|
| The Media Manager's item actions sit in their own action group, "Media Manager", above core's Create | 19 groups entity actions (Umbraco-CMS#24421) and puts ungrouped ones last, under "Other". Ours would have dropped below Trash, and the card's quick button would have become core's Create | Media `bundle.manifests.ts` |
| File actions menu renders through `umb-action-group-list` | Same grouping for workspace action menu items, so a separator or group an item asks for shows | Media `file-actions.element.ts` |
| The used-elsewhere question uses `umb-entity-references-summary` | `umb-confirm-action-modal-entity-references` is deprecated in 19, removal in 21 | Services.Media `file-menu/deps.ts` |
| Folder tree items carry `contentType` beside `mediaType` | `mediaType` on tree items is deprecated in 19, removal in 20 | Media `folder-tree.repository.ts` |
| The sign-in check no longer accepts the authorize endpoint | 19 sends a signed-out window to `/umbraco/login` directly | host `frame-session.ts` |
| Comments that described 18 behaviour | Read-only guard is on every entity-detail workspace (#24353); a different user signing in reloads the page (#24382) | `frame-read-only.ts`, `session-modal.element.ts` |

### Found by the browser run, fixed

- **A full load could send the desktop's first calls to the wrong host.** On a load straight onto
  the desktop, the desktop is built before the entry point has configured the generated API client,
  and the label and connections calls went to the client's default, `https://localhost:23822`
  (refused). Measured: the router builds the desktop three times per load, and the first build lost
  the race on one of the two loads measured. Nothing showed only because a later build won. Now the boot-time
  readers wait for `whenClientReady()` (`desktop/boot/client-ready.ts`), which the entry point
  releases straight after `configureClient`.
- **A window minimized while active came back on screen after a reload.** Minimizing with the
  title-bar button leaves the window active, and the restorer gave the active window focus, which
  un-minimizes it. The restorer no longer focuses a minimized window. Not a 19 change; first seen here.
- **The Add-ons app showed "From the UmbraDesktop team" with nothing under it** on 19, because the
  Marketplace lists no 19 release of ours yet. Ours ship with the desktop at one version, so they
  exist for any major it runs on: when the Marketplace has none of ours for the site's major, the
  built-in list is shown, at the desktop's version, as it already was offline.

### Left alone, with the reason

- **Property actions stay ungrouped.** They still work, under "Other".
- **`item.mediaType` reads** remain where we read core's items. Removal is in 20, and `tsc` will name
  every one when the floor gets there.
- **`meta.pathName` on collection views** (Media `link-rule.ts`, `manager.element.ts`) is deprecated
  since 18, removal in 20. Same reason.
- **`umb-dropdown` no longer wraps its slot** (`game-page.element.ts`, `background-jobs.element.ts`).
  Both looked right in the browser run.
- **Element server events** (`Umbraco:CMS:Element`) are new in 19 and could feed conflict detection
  (`conflict/server-event.router.ts`). A feature, not a fix: an issue.
- **#196's user entry point item is moot**: #24382 reloads the page when a different user signs in,
  which is what we wanted to do ourselves.
- **Breaking changes.** None found worth making. The compatibility code that remains (settings
  migration 0001 from 17, `older-server.ts` for connections to older instances) still has users.

## 5. The browser run

Headless Chrome at 1920x1080 against the test instance, every feature, by script. All 57 launcher
apps open, the commercial ones included. Windows, snapping, the five themes, the launcher, search,
settings, Help, the Add-ons app, the welcome wizard, conflict detection, connections and the read-only
remote viewer, every Media feature, Sticky Notes, the games and the Arcade all pass. No deprecation
warning appeared in the console.

The lock screen on 19: with the same user, the lock lifts and neither window reloads. With a
different user, core reloads the page (#24382), the desktop does not leak the first user's windows,
theme or pins, and the first user's windows come back when they sign in again.

Not covered: the Transfers window, saving an edited image over the original, snapping on a narrow
screen, Places with nested items, and the close guard on a dirty Image Editor.

Console noise that is not ours: Workflow's SignalR hub returns 403 on every frame, `WorkflowContext`
not found in the Webhooks window, a `UUI-BUTTON needs a label` in Deploy. A core `provideAt is not a
function` came only while the script routed document windows with `pushState`, and was not
narrowed down.

## 6. Not done

- The merge commit is local; nothing is pushed.
- Reports to Umbraco: the CsvHelper split in the commercial rc1 packages.
- Issues to file: Element server events for conflict detection; the v20 removals above.
