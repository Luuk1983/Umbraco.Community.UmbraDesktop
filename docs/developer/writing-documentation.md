---
id: writing-documentation
title: Writing documentation
description: How the docs are structured, the front matter and Markdown every page uses, and the writing style.
sidebar_position: 7
---

# Writing documentation

The same Markdown files are read in three places: on GitHub, in the desktop's Help app (planned), and
possibly one day on a Docusaurus site. A page written to the rules on this page works in all three
without being rewritten for any of them.

## Where things go

| What | Where |
| --- | --- |
| What the package is and why to install it | `README.md`, at the repository root. A landing page, not a manual |
| How to use a feature | A page under `docs/user/`, in the category it belongs to |
| How to extend the desktop | A page under `docs/developer/` |
| Why a feature is shaped the way it is | A dated design document in `docs/design/`. Not published |
| An implementation plan | `docs/plans/`. Not published |
| Screenshots | `docs/screenshots/` |

The README gets at most one line per feature, in its feature list, linking to the feature's page. The
page holds the detail.

### Products

A product is one shipped package's documentation. A folder holding a `product.json` is a product's
docs root:

```json
{
  "id": "umbradesktop",
  "name": "UmbraDesktop",
  "packageId": "Umbraco.Community.UmbraDesktop"
}
```

Only the `user/` and `developer/` folders inside a product's docs root are published. For UmbraDesktop
that root is `docs/`, which is why `docs/design/` and `docs/plans/` can live beside them unpublished.

Each package keeps its own docs in its own folder, the way an add-on in another repository would.
UmbraDesktop Entertainment's are in `src/Umbraco.Community.UmbraDesktop.Entertainment/docs/`, and
nothing in them relies on being in this repository. Link from one product to another by an absolute
URL, such as its NuGet page or its page on GitHub, never by a relative path into its folder. Within
a product, links are always relative.

### Categories

The user guide is grouped into categories, one folder each. A category folder holds:

- a `README.md`, the category's front page. It lists every page in the category with a sentence or
  two about each, and nothing else
- a `_category_.json` with the category's label and its position in the guide:

  ```json
  {
    "label": "Windows",
    "position": 2
  }
  ```

Both are what Docusaurus reads for a category, and GitHub shows the `README.md` when the folder is
opened.

### One page per feature

A feature gets its own page, short and to the point, so linking to a feature is one link. When a page
grows a second feature, split it.

## Front matter

Every published page starts with front matter:

```yaml
---
id: live-preview
title: Live preview
description: See the rendered page beside the editor, and what a headless front end needs for it.
sidebar_position: 5
---
```

- **`id`** is the page's stable name. Anything that links to a page from outside the docs, such as
  the Help app or a contextual help link, uses the id and never the file path, so a page can move
  without breaking those links. Keep it short, lowercase and hyphenated, and unique within the
  product. Never rename one without searching for its uses.
- **`title`** is the page's name in navigation. Repeat it as the page's `#` heading.
- **`description`** is one sentence saying what the page covers. It feeds search and link previews.
- **`sidebar_position`** orders the pages in a category. A category's `README.md` needs none.

Values are flat `key: value` pairs. Quote a value that contains a colon.

GitHub shows front matter as a small table at the top of the page. That is expected.

## Markdown

Use only what renders the same on GitHub, in Docusaurus and in a plain Markdown renderer:

- GitHub-flavoured Markdown: headings, lists, tables, fenced code with a language, bold, italics,
  inline code.
- Links between pages are relative paths to the `.md` file, with an anchor when needed:
  `[Snapping](../windows/snapping.md#on-a-narrow-screen)`. An anchor is the heading in lowercase, with
  punctuation removed and spaces turned into hyphens.
- Images are relative paths into `docs/screenshots/`, with alt text that describes what the picture
  shows: `![The launcher, with a search box and the Pinned row](../../screenshots/launcher.png)`.
- Never link to a file in this repository by an absolute GitHub URL. It always shows `main`, whatever
  version the reader installed. The README is packed with its relative links pinned to the release
  commit (see below), and the docs follow whatever version is being read.
- A link from a published page to an unpublished file, such as a design document or a source file,
  is fine. A site or the Help app that cannot show that file links to it on GitHub instead.
- No raw HTML, no MDX, no Docusaurus admonitions such as `:::tip`. NuGet escapes HTML in the README
  rather than rendering it, and the other two would each render it differently.
- An image cannot be given a size. Capture a screenshot at the size it should appear.

## The docs check

`npm run build` runs `backoffice/scripts/docs/check-docs.mjs` first. It fails the build when:

- a link points to a file or folder that does not exist, including one that differs only in case,
  which Windows forgives and GitHub does not
- a link points to a heading that does not exist in its target
- a published page has no `id` or `title`
- two pages of one product share an id
- a README or a published page links to a file of this repository by absolute URL

It reads the root README, `CLAUDE.md`, `RELEASE.md`, everything under `docs/`, and every package's
README and `docs/` folder, so a design document's links into a moved page are caught too. The logic is
in `backoffice/scripts/docs/markdown-docs.mjs`, with tests in `backoffice/src/tooling/`.

To run it on its own, from `src/Umbraco.Community.UmbraDesktop`:

```bash
npm run docs:check
```

## The packed README

NuGet does not resolve relative links in a package readme, and the Umbraco Marketplace shows the
packed README too. So every packed project's README is rewritten at pack time: relative links become
GitHub links, and images become raw GitHub URLs, pinned to the commit being packed. An older version's
package page then keeps that version's screenshots and docs.

The rewrite is the `PinPackedReadme` target in `src/Directory.Build.targets`, which calls
`backoffice/scripts/docs/pack-readme.mjs`. It needs node on the packing machine, which the frontend
build already does. The README in the repository keeps its relative links, which are right on GitHub.

## Writing style

The docs follow the procedure rules of the Microsoft Writing Style Guide and the Google developer
documentation style guide. A docs page answers a question someone came with, usually "how do I…", so
it is short and direct.

### Procedures

- Write procedures as numbered steps, one action per step, each starting with a command.
- Put the goal before the action: "To open the settings, select **Settings**."
- Where it could be unclear, put the place first as well: "In the launcher, select **Settings**."
- Put the result after the action, in the same step: "Select **Save**. The window closes."
- Start an optional step with "Optional:".
- Shorten a sequence in one place with `>`: "Select **Settings** > **Theme**."
- A single action needs no numbered list. A sentence or a bullet does.

### Words

- Write UI labels in bold, exactly as the UI spells them. Take them from
  `backoffice/src/desktop/localization/en.ts` rather than from memory.
- Use "select" rather than "click". The desktop also works by touch.
- Steps are commands, so they need no "you". In descriptions, prefer saying what the desktop does
  ("The window opens") over what happens to the reader, and use "you" where it reads more clearly.
  Watch for the passive voice that dropping "you" tempts.
- Describe what the software does today. Plans belong in an issue or a design document.

The README is the exception. It is a landing page for someone deciding whether to install the
package, so it may talk to the reader freely, and should make them want to try it, while claiming
nothing the package does not do.
