---
id: add-on-help
title: Help for your add-on
description: Ship your package's documentation so it appears in the desktop's Help app, and link to it.
sidebar_position: 8
---

# Help for your add-on

The desktop's Help app shows the documentation of every installed package that brings some, for the
version installed, read from the site itself. Your package can be one of them, with no tool of the
desktop's and no change to the desktop. It takes three things:

1. a docs folder in the shape described below
2. that folder served from your package's own `App_Plugins` folder
3. one `umbraDesktopDocs` manifest entry saying where it is

Everything you need is on this page. UmbraDesktop Entertainment, an add-on in the desktop's own
repository, does exactly this, so its source is a worked example if you want one:
`src/Umbraco.Community.UmbraDesktop.Entertainment/`.

## How Help finds your pages

You do not write an index. The desktop has a backoffice endpoint that lists the files in a registered
docs folder, and the Help app reads every page it lists, builds the sidebar from their front matter,
and searches their text. A folder is listed only if it is under `/App_Plugins/` and holds a
`product.json`, so copying your docs folder into place is all it takes.

What is listed is every `.md` and `.json` file in the folder. Help shows the pages under `user/` and
`developer/` and ignores the rest. Images are not listed; your pages link to them and the browser
fetches them.

On a site without UmbraDesktop, the manifest entry is an extension type nothing reads, and Umbraco
leaves it alone, so your package does not have to depend on the desktop to ship docs for it. Help and
the `umbraDesktopDocs` type are in UmbraDesktop from 17.3.

## 1. Structure your docs

```
docs/
  product.json
  user/
    README.md              the user guide's front page
    terms/                 a category
      _category_.json
      README.md            the category's front page
      adding-a-term.md
      linking-terms.md
  developer/
    README.md              the developer guide's front page
    open-help.md
  screenshots/
    glossary-list.png
```

- **`user/`** is for people using your package, **`developer/`** for people extending it. Either can
  be left out. Help shows them as two guides: the user guide under your product's `name`, with a
  card on Help's landing page, and the developer guide as "`name` for developers", in the quieter
  **For developers** list below the cards. Both are in Help's **Documentation** list, the developer
  guides last.
- **Front pages.** A `README.md` directly in `user/` or `developer/` is that guide's front page, which
  its card opens. A `README.md` in a category folder is that category's front page, which Help opens
  when the category's name is selected. It usually just lists the category's pages with a sentence
  each, as `- [Adding a term](adding-a-term.md): what the page covers.`, and Help shows such a list,
  or a two-column table whose first column is page links, as a column of blocks that open the page.
  Front pages are pages like any other:
  they need the same front matter, and their ids work in targets (§4). `user-guide` and
  `developer-guide` are good ids for the two guide front pages.
- **Pages directly in `user/` or `developer/`**, outside any category, are listed under the guide's
  front page, in `sidebar_position` order.
- **Categories** are one level of folders inside `user/` or `developer/`. A category's
  `_category_.json` gives its name and its place, and Help reads it:

  ```json
  { "label": "Terms", "position": 1 }
  ```

  Without one, the category takes its front page's title as its name, or else the folder name, and
  sorts after the categories that have a position.
- **Images** go anywhere inside the docs folder. `screenshots/` is the convention.

### product.json

```json
{
  "id": "acme-glossary",
  "name": "Acme Glossary",
  "packageId": "Acme.Umbraco.Glossary",
  "repository": "https://github.com/acme/Acme.Umbraco.Glossary",
  "docsRoot": "docs"
}
```

| Field | Required | What it is for |
| --- | --- | --- |
| `id` | Yes | Your product's id in links to your pages, such as `acme-glossary/linking-terms`. Lowercase and hyphenated, and never changed once released, or links to your pages stop working |
| `name` | No | What Help's product list shows. Defaults to the id |
| `packageId` | No | Your NuGet package id |
| `repository` | No | Your GitHub repository. With it and `docsRoot`, a relative link to a file you do not publish, such as a design document, opens that file on GitHub, and a GitHub link from another package's docs into yours opens inside Help. Without them, other packages can only link to your pages with a deep link (§4) |
| `docsRoot` | No | The docs folder's path from the root of that repository, such as `docs`, or `src/Acme.Umbraco.Glossary/wwwroot/App_Plugins/Acme.Umbraco.Glossary/docs` for a package without a build |
| `ref` | No | The branch, tag or commit that links to unpublished files open at. Defaults to `main`, so set it if your default branch has another name, or to a release tag to pin those links to the version installed |

### Pages

Every page, front pages included, starts with front matter:

```yaml
---
id: linking-terms
title: Linking terms
description: Link a term from any page to its definition.
sidebar_position: 2
---
```

- **`id`** is required. It names the page in links (§4), so it is unique across your whole product,
  `user/` and `developer/` together, and it never changes once released.
- **`title`** is required. Repeat it as the page's `#` heading.
- **`description`** is optional. Search shows it when a match is in the title.
- **`sidebar_position`** orders the pages in a category or directly in a guide, lowest first; pages
  without one come after, by title. A front page needs none.
- **`image`** is optional, and only means something on a guide's front page: the picture on the
  guide's card on Help's landing page, a relative path such as `../screenshots/glossary-list.png`.
  Without one the card shows a generic picture. A wide screenshot works best; the card shows it at
  16:9 from its top-left corner. Docusaurus reads the same field as the page's social card.

Values are plain `key: value` lines. Quote a value that contains a colon:
`title: "Redirects: the basics"`.

Write GitHub-flavoured Markdown: headings, lists, tables, fenced code, bold, italics. Link between
your pages with relative paths to the `.md` file, with a heading when you want one:
`[Linking terms](linking-terms.md#link-a-term-from-a-page)`. A heading's anchor is GitHub's: its text
in lowercase, with punctuation other than hyphens and underscores removed and each space turned into a hyphen, and
`-1`, `-2` added to repeats of the same heading. When unsure, open the page on GitHub and copy the
heading's link. Images are relative paths too:
`![The glossary list](../../screenshots/glossary-list.png)`. No raw HTML: Help strips anything
unsafe from it, and it renders differently on GitHub.

The desktop's own [writing guide](writing-documentation.md) has its style rules, if you want your
pages to read like the desktop's. Where it names files in the desktop's repository, such as its
labels file, use your own package's equivalents.

A relative link to a file outside `user/` and `developer/`, such as a design document elsewhere in
your repository, opens that file on GitHub, resolved from `docsRoot` at `ref`. From
`docs/user/rules/adding-a-redirect.md`, the link `../../design/stable-ids.md` opens
`docs/design/stable-ids.md` in your repository. Without `repository`, such a link shows as plain text.

There is no link checker for an add-on's docs. Open every page in Help once before you release, and
watch the console (§5).

## 2. Serve the docs from your package

The Help app reads your docs from `/App_Plugins/<your package id>/docs/`. Match the casing of the
folder exactly in the manifest's path; some servers are case-sensitive.

An Umbraco package is a Razor class library, and its `wwwroot` is shipped as static web assets, which
the site serves under `/_content/<package id>/` unless the project says otherwise. So that
`wwwroot/App_Plugins/<your package id>/` is served at `/App_Plugins/<your package id>/`, as every
Umbraco package's backoffice files need to be, set this in your `.csproj`:

```xml
<PropertyGroup>
  <StaticWebAssetBasePath>/</StaticWebAssetBasePath>
</PropertyGroup>
```

Nothing else is needed to pack the docs: whatever is under `wwwroot` goes into the NuGet package as a
static web asset, and the listing reads static web assets the same way the site serves them.

### Without a build

Keep your package's static files, manifest included, in `wwwroot/App_Plugins/<your package id>/`:

```
wwwroot/
  App_Plugins/
    Acme.Umbraco.Glossary/
      umbraco-package.json
      docs/
        product.json
        user/...
        developer/...
        screenshots/...
```

Every file in that folder is served as it is, so it should hold only what you mean to ship:
`product.json`, `user/`, `developer/` and the images they use. Keep drafts, design notes and unused
images outside `wwwroot`, for instance in a `docs/` folder at the root of your repository, where a
relative link from a page still reaches them on GitHub.

### With a Vite build

A Vite-built package, which is what the Umbraco extension template gives you, can keep `docs/` at the
root of its project and copy it when the bundle is written. These lines need no extra dependency:

```ts
import { cpSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const outDir = "../wwwroot/App_Plugins/Acme.Umbraco.Glossary";

function copyDocs(): Plugin {
  return {
    name: "copy-docs",
    closeBundle() {
      cpSync(fileURLToPath(new URL("../docs", import.meta.url)), fileURLToPath(new URL(`${outDir}/docs`, import.meta.url)), {
        recursive: true,
      });
    },
  };
}

export default defineConfig({
  plugins: [copyDocs()],
  build: { outDir, emptyOutDir: true /* and the rest of your build options */ },
});
```

`closeBundle` rather than an earlier hook, because `emptyOutDir` empties the folder first. Adjust the
two paths to where your `docs/` folder and your output folder are.

When `docs/` is in your project folder but outside `wwwroot`, also add this to your `.csproj`:

```xml
<ItemGroup>
  <Content Remove="docs\**" />
</ItemGroup>
```

A Razor class library treats JSON files as content, and with `ContentTargetFolders` set to `.`, as
Umbraco packages usually have it, `docs/product.json` would otherwise be packed into the root of your
NuGet package. The copy in `App_Plugins` is the one that ships. Docs kept inside `wwwroot`, as in the
route without a build, need none of this.

## 3. Register the docs

One data-only manifest entry. In a static `umbraco-package.json`, next to your other extensions:

```json
{
  "name": "Acme Glossary",
  "extensions": [
    {
      "type": "umbraDesktopDocs",
      "alias": "Acme.Umbraco.Glossary.Docs",
      "name": "Acme Glossary docs",
      "meta": { "path": "/App_Plugins/Acme.Umbraco.Glossary/docs" }
    }
  ]
}
```

The file's other root fields, such as `version` and `allowTelemetry`, are Umbraco's own and mean
what they always do. Or, from a bundle:

```ts
const docs: UmbExtensionManifest = {
  type: 'umbraDesktopDocs',
  alias: 'Acme.Umbraco.Glossary.Docs',
  name: 'Acme Glossary docs',
  meta: { path: '/App_Plugins/Acme.Umbraco.Glossary/docs' },
};
```

- `meta.path` must be the docs folder, under `/App_Plugins/` on the same site.
- `conditions` work as on any extension, to show your docs only to some users.
- The root `weight` orders the products in Help's list, higher first, then by name. UmbraDesktop's
  own docs use 1000 to come first; leave yours unset unless you have a reason.
- Two packages claiming the same product `id`: the higher `weight` wins, then the lower `alias`, and
  the console says which.

In TypeScript, `umbraDesktopDocs` is unknown unless you declare it. Copy this into a `.d.ts` file in
your project:

```ts
import type { ManifestWithDynamicConditions } from '@umbraco-cms/backoffice/extension-api';

interface ManifestUmbraDesktopDocs extends ManifestWithDynamicConditions {
  type: 'umbraDesktopDocs';
  meta: { path: string };
}

declare global {
  interface UmbExtensionManifestMap {
    umbraDesktopDocs: ManifestUmbraDesktopDocs;
  }
}
```

The desktop promises this type only ever gains optional fields, so a copy that lags behind stays
correct.

## 4. Link to your pages

A Help page is named by a **target** of up to three parts separated by slashes:

| Target | Opens |
| --- | --- |
| `acme-glossary` | Your user guide's front page, or your developer guide's when there is no user guide |
| `acme-glossary/linking-terms` | The page whose `id` is `linking-terms` |
| `acme-glossary/linking-terms/link-a-term-from-a-page` | That page, scrolled to that heading |

The parts are the product `id`, a page `id`, and a heading's anchor, the same anchor a Markdown link
uses after `#`. Categories are not part of a target, which is why page ids are unique across the
product. Targets are not case-sensitive.

- **Between your own pages**, write ordinary relative links. Help follows them in the same window.
- **To another package's docs**, such as the desktop's, link to the page on GitHub, for example
  `https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/blob/main/docs/user/apps/help.md`. Help
  opens it inside Help when that package is installed and its `product.json` names its `repository`
  and `docsRoot`, and on GitHub otherwise. The branch or tag in the link does not matter, as long as
  it has no slash in it. This is the one kind of link to write as a full URL; everything inside your
  own product stays relative.
- **From anywhere else**, such as an email or a ticket, use the deep link, which takes the same
  target: `/umbraco/section/umbradesktop?help=acme-glossary/linking-terms/link-a-term-from-a-page`.

### Open Help from your own screens

Your package's dashboard or workspace can open Help at a page, for a "?" next to a setting for
instance. The page can be yours or any installed product's. Dispatch this event from any element; it
also works from a screen shown inside a desktop window:

```ts
this.dispatchEvent(
  new CustomEvent('umbradesktop-open-help', {
    detail: { target: 'acme-glossary/linking-terms' },
    bubbles: true,
    composed: true,
  }),
);
```

When the desktop is not open, nothing listens and nothing happens, so the event is safe to dispatch
unconditionally. If a Help window already shows that page it comes to the front; otherwise a new one
opens there. A page that is not in the installed version opens your front page, with a line saying
so. A target naming a product that is not installed opens Help's landing page, with a line saying
that.

## 5. Check it

1. Run a site with your package and UmbraDesktop installed. To try a package without a build before
   packing it, copy its `App_Plugins/<your package id>/` folder into the site's
   `wwwroot/App_Plugins/` and restart the site, so Umbraco picks up the new package.
2. Open the desktop, then open **Help** from the launcher's System group.
3. Select your guide's card, and open each page from the sidebar.

When something is wrong the browser console says so, in lines starting with `[UmbraDesktop] Docs`:
a path that is not under `/App_Plugins/`, a folder that cannot be listed or has no `product.json`, a
page without an `id`, two pages sharing one. Help leaves out what it cannot use and shows the rest.
