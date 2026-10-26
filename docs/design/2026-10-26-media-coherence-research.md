# One media experience: the item and its file (research)

Date: 2026-10-26. Status: research, revised the same day after the owner's review of the first
mock (split button, no File box, the editor's banner). Mock of §4:
[`mockups/media-item/item-page.html`](mockups/media-item/item-page.html). Read against Umbraco 17.7.1
(`release-17.7.1`, the newest 17 release; Umbraco-CMS has no `v17/main`, its 17 line is
`v17/dev` and the `release/17.x` branches). Where 17.8 or 18 differ, it says so.

## 1. The question

The Media add-on has three parts that each work and do not add up: the Image Editor (edits the
picture), the Media Manager (edits where things are), and a Media Viewer that four designs could not
fit (#145). The owner's own diagnosis is right: there are two things, the media item and the file on
it, and the parts hang off whichever one was handy. Edit image hangs off the item's actions menu and
rides to the card's quick button through a weight trick. The viewer had nothing to hang off at all.

This doc looks for one rule that places every part, checks it against what Umbraco 17 already does
and against how other systems solved the same split, and then lists what would change.

## 2. The rule: the item is the record, the picture is the file

Umbraco already names both things. A media item is a content node with properties, and the file is
one of those properties: the **Image** property (the Image Cropper) on an image type, the **File**
property (the Upload Field) on everything else. The item's page shows the file as its first and
biggest property, with the focal point and crops around it. So the split is not something to invent;
it is already drawn on the item's page.

The rule that follows:

- **Whatever shows the item acts on the item.** The card, the tree row, the title, the item's
  actions menu, the selection bar: open, rename, move, copy, cut, paste, trash, sort. The Media
  Manager is this, and it is right as it is.
- **Whatever shows the file acts on the file.** The picture in the item's page, and the Info tab
  that describes it: look at it, edit its pixels, download it, replace it, optimize it, see its size
  and where it is used. This is where the Image Editor's entry point belongs, and where the viewer
  was trying to go.
- **One click opens the item, always.** That is Umbraco's rule, the Manager's rule and every CMS's
  rule. The item's page is the hub: it shows the file (the viewer), edits the record (the fields)
  and is the door to the file's tools (the editor). Nothing opens on double-click and nothing needs
  a second click to start editing the record.
- **Selection is item-level, and it is the only way to act on many.** A bulk action may do file work
  (Optimize images does), but it is always reached through selected items in the bar. That is
  already how #139 works, and it stays the pattern.

### 2.1 Where the same split lands elsewhere

Every CMS and DAM looked at puts the file's tools on or under the picture inside the item, never on
the card and never in a separate app you have to know about:

- **WordPress.** Clicking a thumbnail opens Attachment Details: the picture on the left, the fields
  on the right, arrows at the top (and the arrow keys) to go to the previous and next item, and
  **Edit image** among the links at the bottom, which opens a crop, rotate and scale screen
  ([Media Library screen](https://wordpress.org/documentation/article/media-library-screen/)).
- **Strapi.** The asset's details dialog has the crop button on the picture; the newer library puts
  the details in a panel beside the list with one Crop & Focus editor, and Replace media in the
  asset's menu ([Strapi docs](https://docs.strapi.io/cms/features/media-library-beta)).
- **Directus.** The file's detail page has one tune button in its header that opens the editor:
  rotate, crop, flip, focal point; save over the original or as a new file
  ([Manage files](https://directus.io/docs/guides/files/manage)).
- **Contentful.** Click the asset, and the file editor on the asset page offers rotate, resize and
  crop ([Edit image assets](https://www.contentful.com/help/media/managing-assets/editing-image-assets/)).
- **Storyblok.** The asset's actions open the Image Editor; crop, then save over or as a new asset
  ([Storyblok FAQ](https://storyblok.com/faq/how-to-crop-images-on-v2)).
- **The OS.** Explorer and the Finder never put per-file buttons on a file. The file opens in its
  app (Photos, Preview), the file's facts are in Properties or Get Info, and the preview pane shows
  the selected file large. Lightroom's Library and Develop are the same split as item and file.

Two things every one of them shares: the picture is the viewer, so none has a separate viewer, and
the pixel editor is a mode or a window you reach from the item, not from the grid.

## 3. What Umbraco 17.7.1 gives us to hang things on

Read in core, not from memory. Each is a public extension type, so none needs a core override.

| Hook | What it is | Why it matters here |
| --- | --- | --- |
| `workspaceAction` | A button in the item's footer beside **Save**, with conditions (`UMB_WORKSPACE_CONDITION_ALIAS` matches the media workspace) and a look (`default` next to Save's `primary`). | A visible **Edit image** button in the item, zero discovery problem, two clicks from a card. It is where WordPress puts Edit image too (bottom of the item). |
| `workspaceActionMenuItem` | The fold-out on a footer button, attached by `forWorkspaceActions`. It is what gives Save and publish its Unpublish, Schedule and Publish with descendants. | The rest of the file's tools fold out of Edit image: Download, Replace file, Optimize. One button, so the footer does not grow a row of them. |
| `propertyAction` | A "..." beside a property's label, keyed by property editor UI (`forPropertyEditorUis`), with conditions. Core uses it for Copy, Paste, Clear and Sort mode on block editors. Shows only when an action exists. | The same tools on the file itself: on the Image Cropper and Upload Field UIs, limited to the media workspace so a page's cropper does not get them. Nobody looks for this "...", but it is Umbraco's place for "do something to this value", so it is there for the person who does. |
| `fileUploadPreview` | The preview core draws for a file by MIME type: image, SVG, audio, video, and a generic file card for the rest. Picked by exact type first, then wildcard, then `*/*`. | A PDF preview (the browser's own viewer) for `application/pdf` makes PDFs viewable inside the item, which is the whole viewer job for that kind. Images use the cropper, not this, so it is for the other kinds only. |
| `entityCollectionItemCard` | The card itself, per entity type, with conditions and `single: true` so one wins. Core registers one each for documents, media and users. | The Manager could draw its own media card (core's is 60 lines on `uui-card-media`) if the quick button on cards has to go. Not needed for this design, noted in §6. |
| `entitySign` | Small marks on items (documents use it for "has pending changes", "scheduled", "protected"). | Could mark an edited or optimized image later. Not needed now. |

The card's quick button is worth naming for what it is: `umb-entity-actions-bundle` shows whichever
entity action has the highest weight. Out of the box on an image that is **Create** (1200), ahead of
Delete (1100). Core did not design a quick button for images; it fell out of the weights. Hanging
Edit image there at 1995 inherits that accident. 17.8 and 18 do not change any of this: the media
diffs since 17.7.1 are placeholder tiles, a file-extension badge on the card, a checkered cropper
background and a type picker on multi-file drops. Nothing adds a viewer or an editor.

## 4. The system, part by part

### 4.1 The Media Manager: unchanged, and it should stay core inside

The owner asked whether the Manager should be less Umbraco. The reading here is that its own-ness is
already in the right place: windows, folders-only tree, dragging, clipboard, keys, undo, transfers.
What is core inside the window (cards, list, toolbar, item menus, the workspace) is the content of
the file manager, the way Explorer shows an app's documents without redrawing them. Keeping it core
is what keeps custom media types, other packages' actions and the 17 to 18 upgrade free. The
incoherence was never in the Manager; it was in where the file's tools were hung.

One thing the rule does change in the Manager: nothing of ours is first on the card any more (§4.3).

### 4.2 The item is the hub, and the viewer

Click a card: the item opens beside the window, as today. Its page is three things at once:

- **The view.** Core's cropper shows an image with its focal point; core's previews play video and
  audio and draw SVG. Bigger is **Pop out** and maximize. Previous and next are the arrow keys and
  Enter in the window, which the Manager already keeps on the cards after an open ("so you can move
  straight on to the next one"). That is WordPress's arrows, already built. #145's job, walking a
  batch to fill in names and alt text, is served by exactly this.
- **The record.** The fields, core's.
- **The door to the file.** The footer button and the property menu below.

What is missing from the view is only kinds core cannot show. A `fileUploadPreview` for
`application/pdf` closes the biggest gap with the browser's own viewer. Others (text, 3D) are one
entry each, if ever.

So #145 closes as "the item is the viewer", with the PDF preview as its one deliverable. No app, no
tab, no gallery, no header buttons.

### 4.3 Edit image: one split button in the item's footer, not a quick button on the card

- **A `workspaceAction` "Edit image"** in the media workspace footer, left of **Save**, default look,
  for image items on the desktop (the existing conditions: on desktop, Media section, not trashed, is
  image). Open the item, press Edit image: two clicks from a card, visible without a menu, and it
  reads as what it is, a tool for this item's picture. It opens the Image Editor window at the image,
  with `reuse`, as the entity action does today.
- **The file's other tools fold out of it**, as Unpublish and Schedule fold out of Save and publish:
  `workspaceActionMenuItem` entries for Download, Replace file and Optimize. One button beside Save,
  with the thing people reach for as its face and the rest one click behind it. Without the fold-out
  the footer would be inconsistent: Edit image on it and Optimize not, for no reason anyone could
  name (the owner's objection to the first mock).
- **For an item that is not an image** (a PDF, a video), the button changes rather than vanishing:
  **Download** with Replace file in the fold-out. Edit image and Optimize do not apply, and a footer
  that offers nothing for a file would say the rule stops at images.
- **The entity action stays in the menus** (card "..." and tree "...") at a normal weight, below
  core's own actions, for the person who already knows and wants the editor without opening the
  item. It is no longer the quick button, and the card goes back to what core shows. The quick
  button route cost one click; the footer route costs two. That is the trade, and the footer is the
  place every reference puts it.
- **The Image Editor stays its own window.** The attached-windows contract is explicit that an
  element holding unsaved work must not be attached content (moving it between pane and window
  remounts it), and the editor's 720px minimum does not fit a pane. A separate window is also what
  every OS does: Explorer to Photos, Lightroom to Photoshop, WordPress to its Edit Image screen. What
  made it feel bolted on was the entry, not the window. After Save, the item beside the Manager
  already refreshes through the live media events, so the return trip is done.
- The launcher tile and the editor's own Open page stay: that is "open the app first", the Start
  menu route, and some people work that way.

### 4.4 The same tools on the file itself

The four actions are registered a second time as a `propertyAction` group on the Image Cropper and
Upload Field UIs, conditioned to the media workspace: one implementation, two manifests each.

- **Download** the original. Core has no download anywhere on a media item.
- **Replace file**, which is core's Clear file(s) plus an upload, as one step that keeps the item,
  its name and where it is used.
- **Optimize**, the single-item form of #139 (its settings window, this one image).
- **Edit image**, for images, so the picture's own menu is complete. Same action, same window.

This is the "..." Umbraco draws beside a block list's label. The owner's view, shared here: nobody
notices it, and it stays because it is Umbraco's place for "do something to this value", not
because anyone will find it. The footer button is the one people see. It appears only when there is
something to offer, so a File item gets Download and Replace file without Edit image.

### 4.5 When someone else changes the image

Most of this exists, built for #137 and measured in a real backoffice on 2026-10-20:

- A clean pane or window showing the item reloads to the new file, through the desktop's
  server-event router, the same path a document window takes.
- A pane with unsaved changes keeps them and gets the desktop's "Someone else changed this while you
  were editing it" banner, with **Keep my changes** and **Discard mine, load theirs**. The live media
  refresh deliberately never announces to a frame that shows the item, after it ate unsaved edits
  once (Edit image design §11.7).
- The editor's Save compares the item's update date with the one it opened and asks before writing
  over somebody else's version (Services.Media `media-save.ts`, `expectedUpdateDate`).

The gap is the editor window itself: while you crop, it hears nothing, and you only learn at Save.
It should get the same banner, through the same notices the desktop draws on a window: an
`Umbraco:CMS:Media` `Updated` for the open item while the editor has unsaved work raises it; **Keep
my changes** acknowledges, and Save then asks its existing question; **Discard mine, load theirs**
reopens the item's new file. With no unsaved work the editor simply reopens the new file, as a clean
window reloads. This is the desktop's notice contract (`notices/`), so the editor needs a way to
raise and answer a notice on its own window, which element apps do not have today; that is the one
piece of core desktop work in this design.

### 4.6 Bulk: the selection bar, as it is

Optimize images (#139) already follows the rule: select items, act on their files from the bar.
Nothing changes. A Download selection (zip) would fit the same way later; not part of this.

### 4.7 Editing from a page (#157)

The rule gives #157 its sentence: in a page's Media Picker the card is a reference to the item, and
the picture inside the item is the library's file. Edit image from there edits the library's file,
for every page that uses it, which is why it belongs on the item's page (reached by Open in Media
Library) and not on the picker. #157 stays separate and unblocked by this.

## 5. What changes, by package

Nothing here needs a core override or a hidden DOM reach.

**Media add-on**

- `edit-image/`: the workspace action (new) with its fold-out items, the entity action's weight
  lowered below core's, and the property action group. Four actions, each with a footer manifest and
  a property manifest over one implementation: Edit image, Download, Replace file, Optimize. The
  footer's face is Edit image for images and Download for anything else. Replace file reuses the
  dropzone upload path the Manager has.
- The Image Editor: raises the changed-elsewhere notice on its window while it has unsaved work and
  the open item is updated, answers Keep and Discard, and reopens the new file when clean.
- A `fileUploadPreview` for PDF.
- Docs: `media-manager.md` and `image-editor.md` lose "quick button" and gain "Edit image is in
  the item's footer"; a short `media-item.md` ("What you can do with a file") in the user docs.
- Marketplace tags: download, replace, PDF preview.

**Services.Media**

- Nothing new; open, save and the overwrite question are already the shared path.

**Core desktop**

- A way for an element app to raise and answer a notice on its own window (§4.5). The frame-side
  desktop lookup the entity action uses already works for a workspace action and a property action
  in the same frame.

**Issues**

- #145 closed with the reasoning in §4.2; the PDF preview is #175.
- [#176](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/176) is the work: the
  split button, the property actions, Replace file and the editor's banner. It replaces the
  quick-button part of #137's text.
- #157 unchanged.

## 6. Options weighed and not taken

- **An Image tab beside Details and Info, with the editor in it.** Rejected for the viewer (#145,
  round 4); for the editor it is worse: 720px minimum in a 560px pane, and two different Saves on
  one page.
- **The editor replacing the Manager window's cards, workspace beside it.** #145 round 3, "a
  navigation nightmare". Same answer for editing.
- **The editor as attached content of the Manager window.** The attached-windows contract rules
  out elements with unsaved work, and it would need the pane to learn an element's dirty state (#157
  lists that plumbing). Not worth it for a window that is right as a window.
- **An actions row under the picture, where core draws Clear file(s).** The most WordPress-like
  spot, but it is inside the cropper's shadow DOM with no extension slot. An upstream PR to add a
  slot there would be the clean route; not needed while the footer button and property menu exist.
- **A Manager-only media card that drops the quick button.** Possible through
  `entityCollectionItemCard` with the in-manager condition (§3). Not needed once Edit image is not
  first; core's own quick button (Create) is core's to keep. Kept as the fallback if the owner wants
  a card with only "...".
- **A File box on the Info tab** (first mock). Dimensions, size and type are already label
  properties on Details, and Referenced by and Links are already core's on Info, so the box only
  gave the buttons a second home. Dropped by the owner.
- **A row of footer buttons** (Edit image, Optimize, Download side by side). Consistent, and a
  footer nobody could read. The fold-out is what core does with the same problem on Save and publish.
- **Keeping Edit image as the quick button.** One click fewer, but it relies on a weight race core
  never designed, shows an icon-only ruler on every image card in the Media section, and is the
  thing that reads as bolted on. The rule in §2 has no place for it.

## 7. Open for the owner

All settled by the owner on 2026-10-26:

- The split button in the footer with Edit image as its face; the property "..." stays as well; no
  File box; the editor gets the changed-elsewhere banner; no media viewer.
- Edit image stays in the card and tree menus at a normal weight below core's actions. Umbraco
  shows an item's actions in three places, and the file's tools in all three is consistent; only the
  quick-button weight goes.
- Replace file is in scope, not its own issue. What it has to settle, for the builder: a new file
  keeps the item, its name and its references; the focal point and crops reset as a reframing save
  does (Image Editor D8), since they point at the old picture; the file is written with the same
  hashed name the editor's save-over uses (Edit image §11.4), so nothing cached shows the old one;
  a file the media type does not accept is refused with Umbraco's own message; and the upload goes
  through the Manager's existing upload path, so the Transfers window and its placeholders apply.
- #145 is closed (not planned, 2026-10-26) with the reasoning in §4.2, and the PDF preview is
  [#175](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/175).

Nothing is open. The next step is the plan.

### 7.1 After the build (2026-10-26)

Built from [`../plans/2026-10-26-media-item-file-tools-plan.md`](../plans/2026-10-26-media-item-file-tools-plan.md),
whose "As built" section has the real run. Three things differ from this doc:

- **Edit image stays the card's quick button inside a Media Manager window** (owner: "it's what
  people expect"). Elsewhere it has a normal weight below core's actions, as §4.3 and §7 say.
- **The footer button uses core's secondary look**, not the default one, which read as a link beside
  the green Save. It sits left of Save as §4.3 draws it, with weight 1100: the media Save takes the
  1000 that core's `default` kind gives, so Save keeps its place at the right edge.
- **The editor's banner comes from the app saying what it shows** (`umbradesktop-app-subject`,
  desktop-apps §7.8), not from the app raising a notice itself: the desktop's server-event router then
  decides, by version, and raises and answers the banner as it does for a page.

## 8. Sources read

- Umbraco-CMS `release-17.7.1`: `packages/media/media/` (collection grid view, media card,
  workspace manifests, image cropper field, upload field previews, entity action weights),
  `packages/core/` (entity actions bundle, collection item card extension, property action menu,
  workspace info app, workspace editor). Diffs to `release/17.9.0` and `main`.
- This repo on `origin/main`: the Media add-on and Services.Media sources, the Media Manager,
  Image Editor, Edit image and Optimize images design docs, `attached-windows.md`, the user docs.
- Branch `145-media-viewer`: the parked viewer design and its two rounds of mocks.
- WordPress, Strapi, Directus, Contentful and Storyblok documentation linked in §2.1.
