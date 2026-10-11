# Help app: design

> A Help app on the desktop that shows the documentation of every installed package that brings
> some, for exactly the version installed, without a request leaving the site. Packages register
> their docs with one data-only manifest entry; UmbraDesktop's own docs arrive the same way.

- **Status:** Built and verified in a real backoffice 2026-09-30. What the build changed or taught is
  in §10
- **Date:** 2026-09-30
- **Branch:** `worktree-55-help-app`
- **Issue:** [#55](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/55). Builds on
  the docs structure from [#78](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/78);
  contextual entry points are [#111](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/111)
- **Target:** Umbraco CMS **v17**, packages `Umbraco.Community.UmbraDesktop` and
  `Umbraco.Community.UmbraDesktop.Entertainment`

---

## 1. Goal & scope

The docs live on GitHub, away from where people use the desktop, and GitHub shows `main` rather
than the version a site runs. The Help app brings them onto the desktop, per installed package, at
the installed version.

**In scope:**

- A `umbraDesktopApp` called Help, in the System group, that can have several windows open.
- A data-only manifest type, `umbraDesktopDocs`, through which every package registers its docs,
  UmbraDesktop included.
- A backoffice endpoint that lists a registered docs folder's pages.
- Opening Help at a page and heading: a context for the desktop's own code, a DOM event for other
  packages, and a `?help=` deep link.
- App windows remembering their location across a reload, which Help is the first to use.
- A developer guide for add-on authors, tested by following it.

**Out of scope:**

- Entry points into Help beyond the launcher tile: "?" links, F1, a footer button. That is #111.
- A public docs site, and switching versions. Each installed package brings exactly one version.
- Translated docs. The app's own labels are English and Dutch; the docs are English.
- A general `?open=` deep link for any app. §6.3 is shaped so one could follow.

## 2. Settled decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | **The server lists the files**; no build tool produces an index. | A package author needs no tool at all: copy the docs into the package, register one manifest entry. It works for a package with no build, just files and a static `umbraco-package.json`. The alternatives, a script shipped in the NuGet package or a published npm package, each put a tool in every author's build and reach Entertainment only after a release. |
| D2 | **The Help app parses the pages itself**, with the same code the docs check uses. | One implementation of front matter and anchors, so a heading the check accepts is a heading the app finds. Every page is loaded anyway, so full-text search needs no index. |
| D3 | **UmbraDesktop registers its docs through `umbraDesktopDocs` too**, and Entertainment only through the public route. | The route every add-on uses is the one that gets exercised. No product is special in the app. |
| D4 | **Images are copied into the package and recompressed**, only those the published pages use. | Every file comes from the site: an editor's browser that cannot reach GitHub still sees the pictures, GitHub never sees which editor read what, and a strict Content-Security-Policy or a private repository does not break them. Palette PNGs keep the file names, so the Markdown is unchanged; about 4.2 MB becomes about 1.5 MB. |
| D5 | **Several Help windows can be open**, like the Content editor. | Reading two pages side by side is what the desktop is for. It also means opening at a page is opening a new window with a target, which the desktop already supports. |
| D6 | **A request for a page reuses a window only when it already shows that page.** The launcher tile always opens a new one. | Three selections of the same "?" link should not stack three identical windows, and nothing else should hijack a window someone is reading. |
| D7 | **App windows get a location**, saved with the layout and handed back on reopen. | Without it every Help window returns to its front page after a reload. Backoffice windows already remember their page; this is the same for app windows, and any app can use it. |
| D8 | **One target string**, `product/page/heading`, used by the context, the event and the deep link. | Page ids are stable across moves (#78), so a target survives restructuring, and one form means one parser. |
| D9 | **The public API for other packages is a DOM event**, `umbradesktop-open-help`. | A package cannot import the desktop's code. The desktop hears the event in its own document and inside every backoffice window, so a package's dashboard in a window can ask. |
| D10 | **A target that does not resolve opens the nearest thing that does**, with a line saying so. | Links will come from newer versions' docs and from typos. An empty window or a silent failure explains nothing. |

## 3. How docs reach the app

### 3.1 In the package

A package puts its published docs under its own static files:

```
/App_Plugins/<PackageId>/docs/
  product.json
  user/...            pages and _category_.json files, as in the repository
  developer/...
  screenshots/...     only the images the published pages use
```

The layout inside is the repository's own (#78), so relative links between pages and to images keep
working unchanged.

`product.json` gains two optional fields next to `id`, `name` and `packageId`:

| Field | Example | Used for |
| --- | --- | --- |
| `repository` | `https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop` | Recognising GitHub links into this product from another product (§4.4), and linking unpublished files to GitHub |
| `docsRoot` | `docs` | Where the docs root sits in that repository |
| `ref` | a commit | Written by the copy step, not by hand: the commit unpublished-file links are pinned to |

### 3.2 Copying

**UmbraDesktop**: a new `scripts/docs/copy-docs.mjs` runs in `npm run build`, after the docs check.
It copies `product.json` (adding `ref`), `user/` and `developer/` into `backoffice/public/docs/`, and
copies each image a published page links to, recompressed with sharp as a palette PNG. The folder is
gitignored, like `public/wallpapers/`.

**Entertainment**, and any add-on built with Vite: a few lines in `vite.config.ts`, a plugin that
copies `docs/` into the output folder when the bundle is written. No dependency. The guide (§7)
shows exactly these lines, and Entertainment uses them as written, so the worked example is the real
thing. A package without Vite copies the folder from its csproj instead; the guide shows that too.

### 3.3 The manifest

```ts
{
  type: 'umbraDesktopDocs',
  alias: 'My.Package.Docs',
  name: 'My Package docs',
  meta: { path: '/App_Plugins/My.Package/docs' },
}
```

- Data only, so a static `umbraco-package.json` can carry it.
- Read the way `umbraDesktopCatalogue` is: through `UmbExtensionsManifestInitializer`, so
  conditions and `overwrites` apply, and validated defensively. A bad entry is dropped with a
  console report, never thrown.
- `meta.path` must be same-origin and start with `/App_Plugins/`.
- Two entries whose `product.json` share an `id`: the higher manifest `weight` wins, then the lower
  alias, the same precedence as catalogues. The loser is reported.
- The type is added to the consumer copy in Entertainment's `umbradesktop-app.d.ts`, like the
  others, and only ever gains optional fields.

### 3.4 The endpoint

`GET /umbraco/management/api/v1/umbradesktop/docs/files?path=/App_Plugins/My.Package/docs`

- Any signed-in backoffice user. Reading the docs is not privileged, and the files are public static
  assets anyway.
- Lists, recursively, the `.md` and `.json` files under that folder through the web root's file
  provider, which includes packages' static web assets. Images are not listed; pages link to them
  and the browser fetches them directly.
- Refuses: a path outside `/App_Plugins/`, a path containing `..` or a backslash, and a folder with
  no `product.json`. A refusal is a 400 with a reason; a missing folder is a 404.

## 4. The app

### 4.1 Where it lives

`UmbraDesktop.App.Help`, a `umbraDesktopApp` in the host package, labelled **Help**
(`#umbraDesktop_appHelp`), in the **System** group. `allowMultiple` is on, it is resizable, and its
default size is about 1100×760 content.

### 4.2 Layout

Revised 2026-10-01 after the first look in a real backoffice, which read as unfinished: a flat list
of every page, overview pages as bare bullet lists, a scrollbar always showing, and no sense of where
the reader was.

- **Guides, not products.** Each product's user guide and developer guide are separate guides: the
  developer guide is "`name` for developers", rather than a second half of the user guide's
  sidebar. A guide's front page is its `README.md`, else its first page. The developer guides are
  deliberately the quieter ones: last in the picker, under a **For developers** group.
- **Landing page.** A window opened from the launcher, and a target naming a product that is not
  installed, opens on a card for every user guide: its front page's `image` front matter (a
  Docusaurus field too), or a generic picture, its name, and its front page's `description`. Below
  the cards, the developer guides are a plain **For developers** list, name and description, no
  picture. Its location is `/`, which is no target, so the desktop can save a window that went back
  to it.
- **Sidebar**, left: the guide picker (disabled, not hidden, with one guide), search over the guide
  being read, and the guide's tree folded to its top level. The current page's category unfolds; a
  category's name opens its overview and unfolds it, and its arrow only folds.
- **Page**, centre: a breadcrumb (Help, guide, category, page, leaving out a step that repeats the
  page), then the rendered Markdown at a reading measure.
- **On this page**, right: the page's level 2 and 3 headings, the section being read marked as the
  page scrolls, as on docs.umbraco.com.
- **One scroll area** for the whole window, with the sidebar and "On this page" sticky inside it, so
  the scrollbar is at the window's edge. The three columns centre once the window is wider than
  1400px. Scrollbars are thin and only show while the pointer is over what they scroll.
- **Overview pages** (a guide's or category's `README.md`): a list whose every item starts with a
  page link, or a two-column table whose first column is page links, renders as a column of blocks,
  each the page's name over its sentence and all of it clickable. Blocks, not cards, so they do not
  look like the landing page. The Markdown stays a plain list, which is what GitHub and Docusaurus
  show.

Under 1080px "On this page" goes; under 640px the sidebar hides behind a **Contents** button, so a
half-snapped window stays usable.

### 4.3 Rendering

`marked` then DOMPurify, from the backoffice's own `external/` modules, into the element's shadow
DOM. Front matter is stripped first. Headings get the anchors `githubSlug` gives them, so a link's
`#anchor` lands. Styling uses only the app tokens (surface, raised and sunken surfaces, text, muted
text, accent, border, radius, font), each with its fallback, and every theme is checked for contrast
on tables, code and links.

### 4.4 Links

Resolved in this order:

1. **`#anchor`**: scrolls within the page.
2. **A relative link to a published page**, such as `../windows/snapping.md#on-a-narrow-screen`:
   that page in this window, at that heading.
3. **A GitHub link into an installed product's docs**, matched on that product's `repository` and
   `docsRoot` whatever branch or tag it names: that page in that product, in this window.
4. **A relative link to a file that is not published**, such as a design doc or a source file: that
   file on GitHub at the product's `ref`, in a new tab. Without `repository`, the link shows as plain
   text.
5. **Anything else**: a new tab, `noopener`.

Images resolve relative to the page's URL under the package's folder.

### 4.5 Search

Over the guide being read: titles, descriptions, headings and full text. Results show the page, the
nearest heading above the match and a short snippet; selecting one opens the page at that heading.

### 4.6 Language

The app's labels are in `en.ts` and `nl.ts`, and the parity test covers them. The docs are English
and nothing in the app remarks on it.

## 5. Windows

### 5.1 Location for app windows

A window's layout already saves a `location` for backoffice windows. App windows get one too:

- The app reports where it is by dispatching `umbradesktop-app-location` with the location string in
  `detail`. The app host forwards it to the window manager, which stores it and saves it with the
  layout.
- On reopen the location comes back as the `location` property, set before the element connects,
  the way `props` already are.
- An app that never reports a location behaves exactly as today.
- For Help, the location is its current target (§6.1).

`docs/developer/desktop-apps.md` gains a section on it.

### 5.2 The reuse rule

`open(target)` looks for a Help window whose location equals the target. If there is one it comes to
the front; otherwise a new window opens with that location. A target with a heading and one without
are different locations, so a request for a heading opens at the heading.

## 6. Opening Help

### 6.1 The target

```
umbradesktop/overwrite-protection/headless-sites
```

Product id, page id, and optionally a heading anchor. All three are lowercase and hyphenated, so the
string needs no escaping in a URL. `product` alone means the product's front page.

### 6.2 Three ways in

1. **The Help context**, scoped to the desktop, with `open(target: string)`. For the desktop's own
   code: settings, notices, the launcher (#111).
2. **The `umbradesktop-open-help` event**, `bubbles` and `composed`, with `{ target }` in `detail`.
   The desktop listens on its own document and on the document of every backoffice window, and
   hands the target to the context. This is the published API, documented in the add-on guide.
3. **The deep link**, `/umbraco/section/umbradesktop?help=<target>`. When the desktop starts with
   `help` in its address it restores windows first, then opens the target through the context, then
   removes the parameter with `history.replaceState`, so a reload does not open it again. It works
   through sign-in and from outside the backoffice. From inside a backoffice window a link to the
   desktop cannot work, since the desktop does not open inside itself; the event is for that.

### 6.3 When a target does not resolve

| Unknown | Opens | Says |
| --- | --- | --- |
| heading | the page, at the top | nothing |
| page | the product's front page | the page is not in this version |
| product | the landing page | that product's help is not installed |

## 7. The add-on guide

A new developer page, **Help for your add-on** (`id: add-on-help`):

- the folder structure and `product.json`, including `repository` and `docsRoot`
- the front matter and Markdown rules, linking to `writing-documentation.md` rather than repeating it
- copying the docs into the package: the Vite plugin lines, and the csproj alternative
- registering `umbraDesktopDocs`, from a bundle and from a static `umbraco-package.json`
- linking to its own pages, and opening Help from its own screens with the event or the deep link

Entertainment is the worked example throughout, and makes exactly these changes and no others.

**Tested by following it.** An agent gets only the guide and a bare package outside this repository,
adds a small docs folder, builds, and installs it into the test instance. The product must appear in
Help, its links must work and the event must open its page. Whatever the agent had to work out alone
goes back into the guide.

## 8. Testing

**Tests first**, for:

- reading and writing the target string
- building a product's tree from its files: front matter, categories, order, and missing or broken
  fields
- each of the five kinds of link
- search
- validating `umbraDesktopDocs` entries, and the precedence between two with the same product
- the reuse rule
- the deep link: read, opened, removed from the address
- app window location: reported, saved, restored as a property
- the endpoint, in the C# tests: outside `/App_Plugins/`, `..`, backslashes, no `product.json`,
  missing folder
- the copy step: only published pages, only images they use, `ref` written

**In a real backoffice**, headless: both products in the picker, each kind of link, the deep link
through a reload, the event from inside a backoffice window, and a screenshot under each theme to
check readability.

## 9. Docs and listing

- A user page, **Help**, in the Apps category, and a line in that category's README.
- `desktop-apps.md`: the location section (§5.1).
- `writing-documentation.md`: the copy step and the new `product.json` fields.
- The add-on guide (§7), in the developer guide's README.
- The Marketplace listing: a Help tag and a screenshot of the app.
- The README: one line only if the feature list reads wrong without it.

## 10. What the build taught

Checked in a running backoffice, headless: the launcher tile, three products in the picker (the two
here and a package built only from the add-on guide), in-page and cross-product links, images,
search, the event from inside a backoffice window, the reuse rule, windows reopening at their pages
after a reload, the deep link and its removal from the address, the missing-page notice, and the page
under all five themes.

- **Umbraco's router takes every same-origin link click.** `ensureAnchorHistory` in the backoffice's
  router listens on the window, finds the anchor through `composedPath()`, so through shadow roots,
  and pushes the address itself. An in-app Help link therefore navigated the whole backoffice away
  from the desktop, which no unit test could see. In-app links now carry `data-router-slot="disabled"`,
  the router's own opt-out, and the app's click handler does the following. Any future link the
  desktop renders for itself needs the same.
- **A relative `?help=` is not relative to the desktop.** It resolves against the backoffice's
  `<base href>`, the backoffice root. In-app links carry the absolute deep link, built from the base
  path, so a middle click opens the right page in a new tab.
- **App windows' locations are a separate saved field** (`appLocation`), not the saved `location`.
  The layout checks `location` as a path on this site, which an app's own string is not, and the
  field names say which is which when a stored layout is read back. On the window itself both live in
  `location`, since a window is one kind or the other.
- **The deep link opens at the hand-over from the boot splash**, not when the window restore ends,
  because a desktop with nothing to reopen never starts a restore. It is taken once per page load, so
  the new desktop Exit builds does not open it again.
- **Search ranks a phrase above scattered words.** `frame-ancestors` first found the theming guide,
  which mentions a `.frame` class and, later, ancestors. A query of several words found together now
  counts for more (`WEIGHTS.phrase`).
- **The guide was followed twice, cold.** The first agent found 20 gaps, the largest being where a
  static `umbraco-package.json` goes, how Help finds pages without an index, and that a package
  without a build ships its whole folder. The second, on the rewritten guide, found edge cases and
  one real omission: a Razor class library serves `wwwroot` under `/_content/<id>/` unless
  `StaticWebAssetBasePath` is `/`. Both are answered in `docs/developer/add-on-help.md`.
- **The controller action is `GetDocsFiles`, not `GetFiles`.** The client generator names its
  methods after the actions, in one class shared by every endpoint of the package.
- **Rebuilt chunks need the instance rebuilt too.** Vite names its chunks by hash, and a running test
  instance only serves the static web assets it knew at build time, so a frontend change needs
  `dotnet build` and a restart before a browser check sees it.
- **Sticky columns need a definite height.** The sidebar and "On this page" stick inside the one
  scroll area at `100cqh`, which only works because the Help element is a size container
  (`container-type: size`), and only sticks because they are `align-self: start`: a grid item
  stretched to its row's height has nowhere to stick.
- **A full test run alongside `dotnet build` fails the Help element tests.** All 21 failed in one
  run while the instance was rebuilding, and passed alone and in a full rerun. Do not read anything
  into Help element failures from a run that shared the machine with a build.
