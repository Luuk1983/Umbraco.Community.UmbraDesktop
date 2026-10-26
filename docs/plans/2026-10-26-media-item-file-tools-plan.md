# Media item file tools (#176) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan
> task-by-task, in this session (owner's standing preference: no subagents for the build). Steps use
> checkbox (`- [ ]`) syntax for tracking. **No commits at any step**: the owner reviews one
> uncommitted diff. Where the skill says "commit", stop and report instead.

**Goal:** Put the file's tools in the media item: one split button beside Save (Edit image or
Download as its face; Download, Replace file, Optimize folded out), the same tools on the file
property's "...", Edit image down to a normal weight in the item menus, a new Replace file, and the
desktop's changed-elsewhere banner on the Image Editor window.

**Architecture:** Four tool functions in the Media add-on (`file-tools/`), each reached from three
thin manifests (workspace action or menu item, property action, and for Edit image the existing
entity action). Replace file runs as an operation of the add-on's desktop context, so it is a
Transfers row like a move or an upload, and writes through Services.Media's `save`. The editor's
banner comes from a small core desktop change: an element app may say which entity it shows, and
the desktop's existing server-event router, banner and buttons then treat its window like a
backoffice window.

**Tech Stack:** TypeScript, Lit, Umbraco backoffice 17 (`@umbraco-cms/backoffice` pinned to the
17.6.0 floor), web-test-runner in Chrome.

**Spec:** [`docs/design/2026-10-26-media-coherence-research.md`](../design/2026-10-26-media-coherence-research.md)
(§4 and §7 are binding; §7 holds the owner's rulings and the Replace file notes), the mock
[`docs/design/mockups/media-item/item-page.html`](../design/mockups/media-item/item-page.html) and
issue #176. Background: [`2026-10-19-edit-image-action-design.md`](../design/2026-10-19-edit-image-action-design.md)
§11, [`2026-10-20-optimize-images-design.md`](../design/2026-10-20-optimize-images-design.md) §8.

## Global Constraints

- **Branch: the Umbraco 17 line.** #176 is labelled `release/v17.5.0`, so this worktree's branch was
  reset onto `origin/v17/main` (it had no commits of its own). It merges up to `main` afterwards, as
  `RELEASE.md` says. Read core at `release-17.6.0` (the 17 floor), not 17.7.1.
- Nothing is imported between packages. The Media add-on copies the types it uses from Services.Media
  and the desktop, as `shared/optimize-service.ts` and `edit-image/desktop-windows.ts` do.
- No core override and no reach into core's shadow DOM. Only `workspaceAction`,
  `workspaceActionMenuItem`, `propertyAction`, `entityAction` and `condition` manifests.
- Everything shows only on the desktop, for users with the Media section, not on trashed items: the
  existing `onDesktop`, `mediaSection` and `Umb.Condition.EntityIsNotTrashed` conditions.
- Tests first, red run seen, then green. JSDoc on every member, private ones included.
- `npm run build` and `npm test` in every touched package (`src/Umbraco.Community.UmbraDesktop`,
  `.Media`, `.Services.Media`); plain `npm test`, never `--concurrency`. No C# changes are planned,
  so no `dotnet test` unless that changes.
- Words in each package's `localization/en.ts` and `nl.ts`; the parity tests hold them together.
- Out: a media viewer (#145), the PDF preview (#175), a File box on the Info tab.

## Review Focus

1. **Replace file while the item has unsaved changes.** The workspace's next Save would send the old
   `umbracoFile` value back over the new file. Expect a question first (Task 6, test
   `asks to save first when the item has unsaved changes`).
2. **The editor's own save must not reopen it.** The server event for its own save arrives while it
   is clean; reopening would throw away its undo history. Expect nothing to happen (Task 1, test
   `does nothing for an app subject already at the server's version`).
3. **Opening the media item from elsewhere must not focus the Image Editor.** Once the editor reports
   what it shows, the desktop's "a window already showing this entity" lookup could pick it. Expect
   a workspace window (Task 2, test `findEntityWindow ignores app subjects`).
4. **Cancelling the file picker does nothing**: no transfer, no notification, no request (Task 6,
   test `does nothing when the picker is cancelled`).
5. **A folder's page gets no button**, and an SVG or PDF item gets Download, not Edit image (Task 4
   tests, and the real run in Task 9).

---

## File structure

**Core desktop** (`src/Umbraco.Community.UmbraDesktop/backoffice/src/desktop/`)

- `dirty-watcher.ts`: `UmbraDesktopWorkspaceSubject` gains the optional `version` field (Task 1).
- `conflict/server-event.router.ts`: the app-subject branch (Task 1).
- `types.ts`: `UMBRADESKTOP_APP_SUBJECT_EVENT` and its detail type (Task 2).
- `components/window.element.ts`: hears the event, turns it into a subject (Task 2).
- `windows/entity-window.ts`: skips app subjects (Task 2).
- `docs/developer/desktop-apps.md`: new §7.8 (Task 2).

**Services.Media** (`src/Umbraco.Community.UmbraDesktop.Services.Media/backoffice/src/`)

- `files/media-save.ts`: `versioned` on `MediaSaveRequest` (Task 3).
- `docs/developer/opening-and-saving-media.md`: the field (Task 3).

**Media add-on** (`src/Umbraco.Community.UmbraDesktop.Media/backoffice/src/`)

- `edit-image/image-type.ts`, new `edit-image/file-kind.condition.ts` (Task 4).
- New folder `file-tools/`: `item.ts` (finding the item from a workspace or property),
  `download.ts`, `replace-file.ts`, `pick-file.ts`, `optimize-one.ts`, and the thin APIs
  `file-tools.workspace-actions.ts`, `file-tools.property-actions.ts` (Tasks 5 to 8).
- `context/media-manager.context.ts`, `operations/steps.ts`, `transfers/transfers-model.ts`: the
  `replace` operation (Task 6).
- `shared/optimize-service.ts`, `shared/media-service.ts`: copied fields (Tasks 6, 7).
- `bundle.manifests.ts` and its test (Task 8).
- `image-editor/image-editor.element.ts`, new `image-editor/subject.ts` (Task 9).
- `localization/en.ts`, `nl.ts`; `docs/user/*.md` (Tasks 5 to 10).

---

### Task 1: The router acts for an app's subject

The router today compares workspace data. An app's unsaved work (pixels) is not in any data the
router can read, so an app subject is decided by version instead: the update date the app holds
against the server's.

**Files:**
- Modify: `desktop/dirty-watcher.ts` (`UmbraDesktopWorkspaceSubject`)
- Modify: `desktop/conflict/server-event.router.ts`
- Test: `desktop/conflict/server-event.router.test.ts`

**Interfaces:**
- Produces, on `UmbraDesktopWorkspaceSubject`:
  ```ts
  /**
   * Set by an element app's subject only (#176). Its presence is what marks the subject as an app's:
   * the router decides by these two versions instead of comparing workspace data.
   */
  version?: {
    /** The version the app holds: what it opened or last saved. */
    held(): string | null | undefined;
    /** The server's version now. Rejects with a 404 cause when the entity is gone. */
    server(): Promise<string | null | undefined>;
  };
  ```
  App subjects set `getPersistedData` and `getData` to return `undefined`.

- [ ] **Step 1: Write the failing tests** in the router suite, each with a fake subject carrying
  `version`:
  - `does nothing for an app subject already at the server's version`: held `'v1'`, server `'v1'`,
    window clean; `reload` not called, no `setServerState`.
  - `reloads a clean app window at an older version`: held `'v1'`, server `'v2'`, clean; `reload`
    called once, `setRefreshing(id, true)` then `false`.
  - `flags a dirty app window at an older version`: held `'v1'`, server `'v2'`, dirty;
    `setServerState(id, { changedElsewhere: true })`, `reload` not called.
  - `leaves a dirty app window alone when the server is at its version`: held `'v2'`, server `'v2'`,
    dirty; nothing (the save-then-type race).
  - `marks an app window deleted when the server says 404`: server rejects with `{ cause: { status: 404 } }`.
  - `asks the server once for a burst of events`: three `Updated` events for one dirty app window;
    `server` called at most twice (the existing coalescing).
- [ ] **Step 2: Run** `npm test -- --files "src/desktop/conflict/server-event.router.test.ts"` from
  `src/Umbraco.Community.UmbraDesktop`. Expected: the six fail (clean ones reload unconditionally
  today, dirty ones never flag because `loadWithoutPersist` is missing).
- [ ] **Step 3: Implement.** In `handleEvent`, for a subject with `version`, after the `Deleted` and
  `Trashed` handling: run `decideApp(id, subject, dirty)` through the same `inFlight` coalescing as
  `classify`. `decideApp` reads `server()`; a 404 cause sets `deleted`; equal to `held()` does
  nothing; otherwise clean reloads through `refresh` and dirty sets `changedElsewhere`. Frame
  subjects keep today's path exactly.
- [ ] **Step 4: Run the suite again.** Expected: all pass, the existing router tests unchanged.

### Task 2: An element app says what it shows

**Files:**
- Modify: `desktop/types.ts`, `desktop/components/window.element.ts` (bind next to
  `@umbradesktop-app-location`, line ~1224), `desktop/windows/entity-window.ts`
- Check: `desktop/ai/desk-snapshot.ts` (describes windows by subject; an app subject must read
  sensibly or be skipped)
- Test: new `desktop/components/window-app-subject.test.ts` (modelled on
  `window-app-location.test.ts`), `desktop/windows/entity-window.test.ts`
- Docs: `docs/developer/desktop-apps.md` new §7.8 "When the server changes what your app shows",
  linked from §7.3

**Interfaces:**
- Produces, in `types.ts`:
  ```ts
  export const UMBRADESKTOP_APP_SUBJECT_EVENT = 'umbradesktop-app-subject';
  /** What an element app shows that the server can change (#176). Null: nothing. */
  export interface UmbraDesktopAppSubject {
    entityType: string;          // e.g. 'media'
    unique: string;              // the GUID server events carry
    version(): string | null | undefined;          // the update date it holds
    serverVersion(): Promise<string | null | undefined>;
    reload(): Promise<void>;     // take the server's version
  }
  export interface UmbraDesktopAppSubjectDetail { subject: UmbraDesktopAppSubject | null }
  ```
- The window element maps it to a router subject: `{ entityType, unique, reload, getPersistedData:
  () => undefined, getData: () => undefined, version: { held: version, server: serverVersion } }`
  and calls `manager.setSubjects(id, [that])`, or `setSubjects(id, [])` for `null`.

My call: **the app reports its subject, the desktop raises and answers the notice.** The issue
asks for "a way for an element app to raise and answer a notice"; letting the app set flags itself
would need a second listener for server events in every app and a second copy of the
clean/dirty/own-save rules. Reporting the subject reuses the router (Task 1), the banner, Keep my
changes (`acknowledge`, with its confirm), Discard mine (`subjectsOf(id)` then `reload()`), the
close guard's conflict wording, and the clearing of flags when the app saves (`setDirty(false)`).

- [ ] **Step 1: Write the failing tests:**
  - `records the subject an app reports`: an app element dispatches the event; `manager.subjectsOf(id)`
    has one subject with the app's `unique` and a `version`.
  - `clears the subject on null`.
  - `discard mine reloads the app`: window flagged `changedElsewhere` and dirty, banner's Discard
    clicked; the app's `reload` called once and the flag cleared.
  - `stops the event at the window` (as location does), so an outer window never hears an inner one's.
  - In the entity-window suite: `findEntityWindow ignores app subjects`.
- [ ] **Step 2: Run them.** Expected: fail (no binding; the lookup matches the app window).
- [ ] **Step 3: Implement** `#onAppSubject` in `window.element.ts` (stop propagation; ignore a
  detail that is not an object or null), the export in `types.ts`, and in `findEntityWindow` skip
  subjects with `version`. Fix the stale comment on `#onAppDirty` ("No subjects to report").
- [ ] **Step 4: Run the core suite in full and `npm run build`.** Expected: green.
- [ ] **Step 5: Write §7.8** with the event, the five members, what the desktop does in each case
  (same version, clean, dirty, deleted), and that the Image Editor is the worked example.

### Task 3: Services.Media writes a versioned file name on request

Replace file must write the hashed name the editor's save-over uses (Edit image §11.4). The rule
lives in Services.Media (`file-menu/formats.ts`: `contentHash`, `unversionedBase`,
`versionedFileName`) and has three callers now, so it becomes a request field rather than a copy in
the Media add-on. **My call.** The file menu and Optimize keep their own calls; moving them onto the
field is a tidy-up for later, not part of #176.

**Files:**
- Modify: `files/media-save.ts` (`MediaSaveRequest`, the save before routing)
- Test: `files/media-save.test.ts`
- Modify: Media add-on `shared/media-service.ts` (its copy of `MediaSaveRequest`)
- Docs: Services.Media `docs/developer/opening-and-saving-media.md`

**Interfaces:**
- Produces on `MediaSaveRequest`:
  ```ts
  /**
   * Write the file as `<base>-ud<8 hex>.<ext>`, the hash of its contents, replacing a marker an
   * earlier save left: so a picture that changed gets a new address and no cache shows the old one.
   * Undefined is false. Issue #176.
   */
  versioned?: boolean;
  ```

- [ ] **Step 1: Failing tests:** `versioned names the file after its contents`
  (`beach.jpg` → matches `/^beach-ud[0-9a-f]{8}\.jpg$/`), `versioned replaces an earlier marker`
  (`beach-ud3f9a1c07.jpg` with other bytes → one marker only), `same bytes, same name`, and
  `without versioned the name is untouched`.
- [ ] **Step 2: Run** from `src/Umbraco.Community.UmbraDesktop.Services.Media`. Expected: fail.
- [ ] **Step 3: Implement** in the saver before `routeSave`: when `versioned`, rename `file` with
  the existing helpers.
- [ ] **Step 4: Run the package suite and build.** Expected: green.

### Task 4: Which kind of file an item has

The footer's face depends on it: Edit image for an image, Download for any other file, nothing for
a folder.

**Files:**
- Modify: `edit-image/image-type.ts` (the read returns a kind), `edit-image/constants.ts`
- Create: `edit-image/file-kind.condition.ts`
- Test: `edit-image/file-kind.condition.test.ts`, existing `is-image.condition.test.ts` stays green

**Interfaces:**
- Produces: `type MediaFileKind = 'image' | 'file' | 'none'`; `mediaFileKindCached(lookups,
  mediaType): Promise<MediaFileKind>` (`image`: `umbracoFile` uses the Image Cropper; `file`: it
  uses anything else; `none`: no `umbracoFile`; unreadable is not cached and answers `none`).
  `isImageMediaTypeCached` becomes `kind === 'image'`.
- Produces: condition alias `UMBRADESKTOP_FILE_KIND_CONDITION =
  'Umbraco.Community.UmbraDesktop.Media.Condition.FileKind'`, config `{ match: 'image' | 'file' }`.
  It is the is-image condition with a configured answer, so it shares its context finding: extract
  the body of `UmbraDesktopIsImageCondition` into a base that decides a `MediaFileKind`, and keep
  the is-image alias as `match: 'image'` behaviour for the existing manifests.

- [ ] **Step 1: Failing tests**, using the is-image suite's fake lookups: Image type →
  `image` permitted, `file` refused; File type (Upload field) → `file` permitted; SVG type →
  `file`; folder → both refused; unreadable media type → both refused and asked again next time.
- [ ] **Step 2: Run.** Expected: fail (no condition).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the Media suite.** Expected: green, including the is-image tests unchanged.

### Task 5: Download

**Files:**
- Create: `file-tools/item.ts`, `file-tools/download.ts`
- Test: `file-tools/download.test.ts`, `file-tools/item.test.ts`

**Interfaces:**
- Produces in `item.ts`: `interface FileToolItem { unique: string; name: string }` and
  `itemFrom(host: UmbControllerHost): Promise<FileToolItem | undefined>`, read from
  `UMB_MEDIA_WORKSPACE_CONTEXT` (`getUnique()`, the invariant name). Both the footer and the property
  "..." sit inside the media workspace, so one lookup serves both.
- Produces in `download.ts`:
  - `downloadName(url: string): string`: the last path segment, decoded, with a `-ud<8 hex>` marker
    removed (`/media/abc/beach-ud3f9a1c07.jpg` → `beach.jpg`). **My call**: the marker is an
    address detail, not the person's file name.
  - `downloadFile(host, item, deps = realDeps): Promise<boolean>`: the item's saved file through
    `UmbMediaUrlRepository` (`requestItems([unique])`, the `umbracoFile` URL), then an `<a href
    download data-router-slot="disabled">` clicked in the host's document and removed. No URL: a
    warning notification "{name} has no file to download." and `false`.
  The saved file, not an unsaved upload in the workspace. A plain link download, so a large video
  streams through the browser's own download rather than through memory.

- [ ] **Step 1: Failing tests:** `downloadName` cases (marker, no marker, encoded spaces, query
  string dropped); `downloadFile` clicks a link with that `href` and `download` and the router-slot
  attribute, and removes it; no URL notifies and clicks nothing.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement**, with `deps` (`urlOf`, `notify`) for the tests.
- [ ] **Step 4: Run.** Expected: pass. Add `download`, `noFileToDownload` to `en.ts`/`nl.ts`.

### Task 6: Replace file

Owner's notes (§7) as the acceptance list: keeps the item, its name and its references; resets the
focal point and crops; writes the hashed name; a file the media type does not accept is refused
with Umbraco's message; runs through the Manager's operation path so the Transfers window applies.

**Files:**
- Create: `file-tools/pick-file.ts`, `file-tools/replace-file.ts`
- Modify: `operations/steps.ts` (`replaceStep`), `context/media-manager.context.ts` (`replaceFile`),
  `transfers/transfers-model.ts` (kind `replace`, its verbs), the operation kind type it reads
- Test: `file-tools/replace-file.test.ts`, `operations/operations.test.ts`,
  `transfers/transfers-model.test.ts`, `context/media-manager.context.test.ts`

**Interfaces:**
- `pickFile(doc: Document): Promise<File | undefined>`: a detached `<input type="file">`, resolved
  on `change` with the file or on `cancel` with undefined. No `accept` filter (**my call**: a wrong
  pick then gets Umbraco's own refusal, and Umbraco's own upload offers no filter either).
- On the add-on context: `replaceFile(item: UmbraDesktopMediaRef, file: File):
  Promise<UmbraDesktopOperationResult>`, which runs `#run('replace', item.parent, [replaceStep(...)],
  [], { record: false })`. Not undoable (**my call**: Umbraco deletes the old file on save, so there
  is nothing to undo to).
- `replaceStep(save: MediaSaver, accepts: (extension: string) => Promise<string[]>, item, file)`:
  refuses before uploading when the item's media type is not in `accepts(extension)`, with
  `` `${term('media_disallowedFileType')}: ${extension}` `` (core's own words, as its temporary
  file manager writes them); otherwise Services.Media `save({ existing: item.unique, file, name:
  item.name, folder: item.parent, resetFocalPoint: true, versioned: true })`, and its message on
  failure. `affects: [item.parent]`. The add-on context reaches Services.Media's context on the
  desktop page (`UmbraDesktopMediaContext`) for `save`.
- `replaceFromWorkspace(host, item, deps)`: the action body. If the workspace has unsaved changes,
  core's confirm: "{name} has unsaved changes. Save them before replacing the file?" with **Save**
  and **Cancel**; Save runs the workspace's own save and goes on only if it is then clean (**my
  call**, Review Focus 1). Then `pickFile`; cancelled returns. Then the add-on context's
  `replaceFile`, found with `findOnDesktop` as Optimize finds its service.
- Transfer kind `'replace'`: verbs "Replacing the file of" / "Replaced the file of" (exact words in
  `en.ts`, Dutch in `nl.ts`); `canPause` false.

- [ ] **Step 1: Failing tests:**
  - `replaceStep` refuses a `.pdf` on an Image item with core's words and never calls `save`;
    accepts a `.png` on an Image item and calls `save` with `resetFocalPoint: true`, `versioned:
    true`, the item's name and key; passes Services.Media's failure message through.
  - `replaceFromWorkspace`: `does nothing when the picker is cancelled`; `asks to save first when the
    item has unsaved changes` (Cancel: no picker; Save that leaves it dirty: no picker); clean: picker
    then `replaceFile`.
  - Context: `replaceFile` follows a transfer of kind `replace` and is not pushed to undo history.
  - Transfers model: a running and a finished `replace` transfer's title words.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the Media suite.** Expected: green.

### Task 7: Optimize one image

**Files:**
- Create: `file-tools/optimize-one.ts`
- Modify: `shared/optimize-service.ts` (copy `title?: string` onto `OptimizeMediaRequest`)
- Test: `file-tools/optimize-one.test.ts`

**Interfaces:**
- `optimizeOne(host, item): void`: `service.optimizeMedia({ items: [item.unique], title: item.name
  })`, not awaited, errors swallowed, as the bulk action does. The window is named after the item
  rather than its folder (**my call**).

- [ ] **Step 1: Failing test:** the fake service receives exactly `{ items: ['k'], title: 'Banjo' }`;
  no service: nothing thrown.
- [ ] **Step 2: Run.** Expected: fail. **Step 3: Implement.** **Step 4: Run.** Expected: pass.

### Task 8: The manifests: split button, fold-out, property "...", Edit image's weight

**Files:**
- Create: `file-tools/file-tools.workspace-actions.ts` (one `UmbWorkspaceActionBase` and one
  `UmbWorkspaceActionMenuItemBase`-style API per tool), `file-tools/file-tools.property-actions.ts`
  (one `UmbPropertyActionBase` per tool), `file-tools/file-property.condition.ts`
- Modify: `bundle.manifests.ts`, `bundle.manifests.test.ts`, `localization/en.ts`, `nl.ts`

**Interfaces and values:**
- Workspace actions, kind `default`, `look: 'default'`, both conditioned on `Umb.Condition.WorkspaceAlias`
  match `Umb.Workspace.Media`, on desktop, Media section, not trashed:
  - `...WorkspaceAction.EditImage` (face Edit image, `file-kind` `image`), runs the existing
    `openApp(UMBRADESKTOP_IMAGE_EDITOR_APP, { location, reuse: true })`.
  - `...WorkspaceAction.Download` (face Download, `file-kind` `file`).
  - `weight`: whatever puts them left of core's Save; core's media Save has none (0). Measured in
    Task 9 and pinned in the manifest test.
- Menu items (`workspaceActionMenuItem`, kind `default`): Download (`forWorkspaceActions`: EditImage,
  weight 30), Replace file (both actions, weight 20), Optimize (EditImage, weight 10). So an image's
  fold-out reads Download, Replace file, Optimize, and a file's reads Replace file.
- Property actions, kind `default`, `forPropertyEditorUis: ['Umb.PropertyEditorUi.ImageCropper',
  'Umb.PropertyEditorUi.UploadField']`, each with: workspace alias Media, the new
  `FileProperty` condition (the property's alias is `umbracoFile`, so a media type's second upload
  field gets nothing: **my call**), `Umb.Condition.Property.HasValue`, on desktop, Media section, not
  trashed. Edit image and Optimize add `file-kind` `image`; Replace file adds
  `Umb.Condition.Property.Writable`. Order: Edit image, Download, Replace file, Optimize.
- Entity action Edit image, **two manifests** (owner, 2026-10-26: "the default Manager windows quick
  button should be Edit, it's what people expect"):
  - In a Media Manager window it keeps weight 1995, so it stays an image card's quick button there
    (in-manager condition).
  - Everywhere else (the Media section, the Manager's item pane, Open in Media Library) weight
    **50**: below every core media action on an item (Create 1200, Trash 1150, Delete 1100, Move to
    700, Sort 100) and above Reload (0). So core's own card shows what core shows. This needs the
    in-manager condition to answer "outside" too: a new config `outside: true`, decided at once with
    `contextNow` (a consume never says "none"), so the two manifests never both show.
  - This narrows research doc §7's "only the quick-button weight goes" to outside the Manager.
- Labels: `#umbraDesktopMedia_download` "Download", `_replaceFile` "Replace file", `_optimize`
  "Optimize", the existing `_editImage`. Icons: `icon-download-alt`, `icon-repeat`, `icon-picture`
  (Optimize's existing icon), `icon-ruler-alt`.

- [ ] **Step 1: Failing manifest tests:** each alias present with its type, kind, `forWorkspaceActions`
  / `forPropertyEditorUis` and conditions found by alias (never by position); Edit image's entity
  weight is below 100 and above 0; no tool shows outside the media workspace; the two faces have
  opposite `file-kind` matches.
- [ ] **Step 2: Failing API tests:** each API calls its tool function with the item from `itemFrom`
  (fakes via a context provider).
- [ ] **Step 3: Run.** Expected: fail. **Step 4: Implement.** **Step 5: Run suite and build.** Green.

### Task 9: The Image Editor reports its subject

**Files:**
- Create: `image-editor/subject.ts`
- Modify: `image-editor/image-editor.element.ts` (where `#sendLocation` is called, line ~401)
- Test: new `image-editor/image-editor.subject.test.ts` (with `image-editor.test-helper.ts`)

**Interfaces:**
- `editorSubject(unique, held: () => string | null | undefined, serverVersion: (unique) =>
  Promise<...>, reload: () => Promise<void>): UmbraDesktopAppSubject` (a local copy of the desktop's
  type). `serverVersion` reads the item's update date with `UmbMediaDetailRepository` (a 404 rejects
  with that cause, so the router marks the window deleted); `reload` is the editor's `#openAt(unique)`.
- The editor dispatches `umbradesktop-app-subject` whenever its document's `unique` changes (open,
  Save as onto a copy), with `null` when nothing is open. `held()` reads `this._document.updateDate`
  live, so after the editor's own save (`#onSaved`) the echo is "same version".

- [ ] **Step 1: Failing tests:** reports a subject with the item's key on open; reports `null`
  with nothing open; reports the copy's key after Save as; `held()` returns the saved update date
  after a save; `reload()` reopens the item (history reset, new picture); Keep my changes leaves
  `expectedUpdateDate` at the opened date, so Save then asks Services.Media's existing overwrite
  question (assert the save request's `expectedUpdateDate`).
- [ ] **Step 2: Run.** Expected: fail. **Step 3: Implement.** **Step 4: Run the Media suite.** Green.

### Task 10: Real backoffice run, docs, listing

**Instance:** the `running-umbraco-instances` skill. This branch is Umbraco 17, so its database must
be a 17 database: copy one that has never booted on 18, never the main checkout's if that has been
upgraded. npm build in each package before `dotnet build`. Browse on `<task>.dev.localhost`.

- [ ] **Measure and record** in "As built" below:
  1. The footer on an image item in a Media section window and in a Manager item pane: Edit image
     left of Save, the arrow's fold-out Download, Replace file, Optimize. On a PDF: Download with
     Replace file. On a folder: nothing. Under all five themes, once.
  2. The property "..." on the Image and File properties, inside the media item only (not on a
     page's Image Cropper), with the four (or two) actions.
  3. The card: core's quick button back; Edit image low in the card and tree menus.
  4. Download: file name without the marker; a large video downloads without a stall.
  5. Replace file: new picture shown in the item and the Manager's card; same item key, name and
     references (Info tab); focal point reset; file name `-ud` hashed; a refused extension shows
     core's words; a large file opens Transfers; with unsaved changes the question comes first.
  6. Optimize from the fold-out: the window named after the item, one image.
  7. The editor banner: editor dirty on Banjo, Banjo saved from a Media window; banner on the
     editor, Keep then Save asks the overwrite question; Discard reloads their picture. Editor
     clean: it reopens the new file by itself. Editor saving its own work: no reopen, undo intact.
  8. Opening Banjo from the tree while its editor is open opens the item, not the editor.
- [ ] **Docs** (Media add-on `docs/user/`): `media-manager.md` and `image-editor.md` lose the quick
  button and say Edit image is in the item's footer; a new `media-item.md` "What you can do with a
  file" (front matter `id` and `sidebar_position` as `optimize-images.md` has them; the add-on's
  `docs/user/` has no README, Help lists pages from `product.json` and the front matter), commands
  with the goal first, bold labels from `en.ts`, linked from both pages and from
  `optimize-images.md`. Core `desktop-apps.md` §7.8 (Task 2); Services.Media
  page (Task 3).
- [ ] **Listing:** `umbraco-marketplace-umbraco.community.umbradesktop.media.json` `Tags` gain
  "download", "replace file". No `Description` change, no README line (nothing here changes what
  someone deciding to install would want to know). No screenshot unless the footer makes an existing
  one mislead.
- [ ] **Final:** `npm run build` and `npm test` in all three packages, green; report by file; offer a
  commit as a question.

## As built

Built 2026-10-26 on `claude/176-media-item-file-tools-e8c4e3` (reset onto `origin/v17/main`), test
first throughout, every red run seen. Uncommitted.

### Where the code differs from the plan

- **Task 4: no second condition.** The is-image condition gained `match: 'image' | 'file'` instead
  of a new `FileKind` condition, so the tricky part (finding the item's own content-type context,
  #137 §11.2) stays in one class. `image-type.ts` now reads a `MediaFileKind` (`image`, `file`,
  `none`) per media type, cached as before.
- **Task 8: Edit image keeps its quick button in Manager windows** (owner, 2026-10-26: "the default
  Manager windows quick button should be Edit, it's what people expect"). Two manifests: weight 1995
  inside a Manager window, weight 50 everywhere else. The in-manager condition gained
  `outside: true`, decided at once with `contextNow`, so the two never both show.
- **Task 8: the footer button has weight 1100 and the secondary look.** Core's footer draws a higher
  weight further left. The media Save sets no weight, so it takes the 1000 that core's `default`
  workspace action kind gives (`workspace-action/default/manifests.ts`). The planned 50 therefore put
  the button right of Save. 1100 puts it left, so Save keeps its place at the right edge whether the
  button is there or not (owner, 2026-10-26: "I want save to always be in the same position").
  Measured with the weight swapped in the running backoffice: 50 and -50 land right of Save, 1100
  left. An earlier note here blamed the sort on Save having no weight; that was wrong. The plain
  `default` look rendered as a link beside the green Save, so it uses `secondary`, as core's own
  non-primary footer buttons do (a document's Save beside Save and publish).
- **One API class per kind, the tool in `meta.umbraDesktopTool`** (`file-tools/file-tools.actions.ts`
  over `run-tool.ts`): core hands every workspace action, menu item and property action its
  manifest's `meta` as `args.meta`.
- **Replace file's unsaved-changes question** is core's confirm with **Save** and **Cancel**; Save
  runs the workspace's own `requestSubmit`, and a save that leaves the page dirty stops the replace.
- **Services.Media's `versioned`** is applied in `routeSave`, so every route (replace, copy, new)
  honours it; only Replace file sends it today.

### The real run (2026-10-26, Umbraco 17.7.1, headless Chrome)

On a copy of the main checkout's database (last booted on 17, 2026-10-21) with its media.

| Check | Result |
| --- | --- |
| Footer on an image (Banjo), Media section window | **Edit image** (secondary) with an arrow, left of **Save** (rechecked at weight 1100); fold-out **Download**, **Replace file**, **Optimize** |
| Footer on an image in a Manager item pane | The same |
| Footer on a PDF (created for the run; the site picked its Article type) | **Download** with an arrow; fold-out **Replace file** |
| Footer on a folder (Products) | Only **Save** |
| File property "..." | Image: Edit image, Download, Replace file, Optimize. Article (Upload field): Download, Replace file. Label properties: none |
| Item header menu, Media section | Create, Trash, Move, Sort, **Edit image**, Deploy export, Reload |
| Manager card | Edit image is the image card's quick button, as before |
| Download | Saved `5852022211_9028df67c0_b.jpg`, the original file under its name |
| Replace with a PDF on an image | Refused: "Ping Pong Ball: Cannot upload this file, it does not have an approved file type: pdf"; item unchanged |
| Replace with unsaved changes | "Save your changes first?" asked before the picker |
| Replace with a PNG | Same key and name, file `picture-ud23cacd8a.png`, focal point (0.2, 0.3) reset to none; the open page showed the new picture at once |
| Replace on a slow line (60 KB/s) | The Transfers window opened: "Replacing the file of Ping Pong Ball in Products" |
| Optimize from the fold-out | A window "Optimize images: Ping Pong Ball (1)" |
| Editor clean, Banjo saved elsewhere | Reopened their version by itself (held date moved, no undo left) |
| Editor dirty, Banjo saved elsewhere | Banner "Someone else changed this while you were editing it"; **Discard mine, load theirs** reopened theirs, clean |
| **Keep my changes** | Its question, then the banner went (acknowledged); Save asked "Save over Banjo?" then "Overwrite Banjo?" |
| The editor's own save | No reopen: undo history kept, no banner, held date moved to its save |

Not run in the browser: opening the item from elsewhere while its editor is open (findEntityWindow
is only reached through the launcher's search and the AI tools; the unit test covers it), and the
five themes (the footer and menus are core's, drawn inside the backoffice frame, which the desktop
theme does not reach).

Afterwards the run's PDF was deleted, Banjo and Ping Pong Ball got their original files back, and the
uSync exports and `TriggerDeploy.ps1` the run touched were reverted.

### Found, left for later

- **An editor made clean by undoing keeps the old picture.** When a change arrives while the editor
  is dirty and the person then undoes back to clean, the flag clears but nothing reloads, as for a
  backoffice page. Save then asks its overwrite question, so nothing is lost.
- **The failure headline after a refused replace** is the Manager's generic "1 of 1 items did not go";
  its Dutch says "niet verplaatst of gekopieerd", which is wrong for a replace (and for trash and
  rename, already).
- **A media type's second Image Cropper or Upload field** gets no tools, by design (`umbracoFile`
  only).

### After the owner's first look (2026-10-26)

- **The item pane kept the old picture after an Image Editor save**, while the Manager's card took the
  new one. The card is told by Services.Media's save directly; a backoffice page in a pane or window
  only followed the server's event over SignalR. Measured headless: with the hub blocked, the pane kept
  `…-ud546a3aa5.webp` while the server had the new file; with the hub up it followed. Fixed by telling
  the desktop directly: the window manager's new public `entityChanged(entityType, unique)` feeds the
  server-event router as the server's own `Updated` event would (`localChangeEvent`), and
  Services.Media calls it after every save over an item (the editor's, Replace file's, an Optimize
  run's). Measured again with the hub blocked: the pane moved to the new file within 1.5 s. Documented
  in `desktop-contexts.md` §5.
- **The Optimize window could not be made lower** than the settings at their tallest (824 px of
  content). Its minimum is now the introduction, a heading and first setting, and the footer
  (162 + 140 + 68 = 370 px); the settings scroll between them and the footer stays. `fits.test.ts`
  checks that under every theme id, and that it still opens with nothing scrolling. Measured in the
  desktop: at its minimum the footer is in the window and the settings scroll (165 of 570 px shown).
- **Left out for now (owner, 2026-10-26): a message when an open media item's picture changes.**
  Opening the editor from the item's page can make an image edit look like a change to the item that
  still needs saving. Considered: an info strip at the top of the window or pane when a clean media
  item reloads because its file changed ("The picture was updated. It is already saved: you don't need
  to save the item"), covering the editor, Replace file, Optimize and other people. It would need a
  notice strip on panes (core) and would go against D7's silent refresh, so media only. Not built.
- **Download and File actions instead of a split button (owner, 2026-10-26: "Edit image is not more
  important than the other options").** The footer now has **Download** (core's own button, weight
  1200) and **File actions** (weight 1100), then Save, on any item that holds a file (the is-image
  condition's new `match: 'any'`); a folder has neither. File actions is a workspace action with an
  element of its own (`file-tools/file-actions.element.ts`) that only opens a menu: core's chevron,
  popover and layout, listing the workspace action menu items registered for it through core's own
  extension initializer, so the entries stay extensions. Its entries: Edit image and Optimize (images
  only), Replace file. A PDF's menu holds Replace file alone; the owner chose the same two buttons on
  every item over a plain Replace file button. Label **File actions** (Dutch **Bestandsacties**):
  Umbraco's word for menus, and it names what the entries act on. Measured in the backoffice: Banjo's
  footer reads Download, File actions, Save; its menu Edit image, Replace file, Optimize; Edit image
  opened the editor at Banjo and the menu closed; a folder shows only Save.
