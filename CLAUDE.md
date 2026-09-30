# UmbraDesktop

An OS-style windowed desktop for the Umbraco backoffice, shipped as an Umbraco package. The
backoffice extension is TypeScript and Lit; the C# project exists to package and serve it.

## Layout

```
src/Umbraco.Community.UmbraDesktop/
  backoffice/src/desktop/       the desktop itself
    components/                 desktop, taskbar, launcher, window elements
    catalogue/                  the curated app list, one file per group
    theme/themes/<id>/          one folder per theme
  backoffice/public/            umbraco-package.json (registers the one bundle)
  backoffice/scripts/docs/      the docs check and the pack-time README pinning
src/Umbraco.Community.UmbraDesktop.Entertainment/
  docs/                         the add-on's own docs, kept apart as an external add-on's would be
docs/                           UmbraDesktop's docs root (product.json)
  user/<category>/              the user guide, one page per feature
  developer/                    how it works, theming, apps, catalogues, attached windows
  developer/writing-documentation.md   the rules every docs page follows. Read before writing one
  design/                       dated design docs, one per feature. Not published
  screenshots/                  every screenshot the READMEs, docs and marketplace use
umbraco-marketplace-*.json      what the Umbraco Marketplace shows, one file per package
```

## Commands

Run from `src/Umbraco.Community.UmbraDesktop`:

```bash
npm run build        # checks the docs' links, builds wallpapers, then tsc, then vite
npm test             # web-test-runner in a real Chrome
npm run docs:check   # just the docs check
```

**Run both.** They check different things and neither subsumes the other: the test runner
transpiles through esbuild and does **not** type-check, while `tsc` never renders anything. Both a
green test run over a broken build and the reverse have shipped here.

## Conventions

- **JSDoc on everything**, including private members. Say why the code exists, not what its name
  already says. The existing files set the bar; match their density rather than the language's.
- **Tests first.** Write the failing test, watch it fail, then make it pass. This is not ceremony
  here: on the last three themes the red run caught real geometry bugs that review did not.
- **Derive numbers, never type them.** Anything that appears in both CSS and JavaScript goes in one
  constant that both read. Then measure it in a browser, because deriving only makes a sum
  consistent with itself. See `docs/developer/theming.md` §4.
- **A theme may restyle, never remove.** Same for any chrome change: an affordance that disappears
  under one theme is a bug, not a style.

## Definition of done

Code passing is not done. Before a feature is finished, walk this list and say explicitly which
items did not apply:

- [ ] `npm run build` and `npm test` both pass. The build includes the docs check, so a moved page
      or a renamed heading that breaks a link fails here
- [ ] **A docs page describes the feature**, in the user guide (`docs/user/<category>/`) for
      something people use, in the developer guide for something people extend. One page per
      feature, short, following [`docs/developer/writing-documentation.md`](docs/developer/writing-documentation.md):
      front matter with a stable `id`, relative links, procedures as commands with the goal first,
      UI labels in bold taken from `localization/en.ts`. Add the page to its category's
      `README.md`, and link to it from the pages that mention the feature. An add-on's feature goes
      in that add-on's own `docs/`
- [ ] **`README.md` gets at most one line**, and only if the feature changes what someone deciding
      whether to install the package would want to know. It is a landing page, not a manual, and
      it went to 800 lines the last time every feature got a bullet. Most features need no README
      change at all: the docs page is where they are described. **Markdown only, no raw HTML**:
      this file is also the NuGet package readme and what the Umbraco Marketplace shows, and NuGet
      escapes HTML rather than running it, so an `<img>` tag shows up on the package page as its
      own source code. Images are `![alt](path)` with a relative path and cannot carry `width` or
      `height`, so size a screenshot by capturing it at the size you want it. Links and images stay
      relative; packing pins them to the release commit (see the writing guide)
- [ ] **`umbraco-marketplace-<lowercase package id>.json`** gets the feature in `Tags`, since that
      is how it gets found, and a screenshot in `docs/screenshots/` plus the `Screenshots` array if
      it changes what the package looks like. **`Description` is almost certainly not the place.**
      It is a hook, not a summary: it is the blurb on the Marketplace overview *card*, where it
      fades out after about two lines, and on the detail page it is the intro paragraph with the
      full README rendered directly beneath it. So a feature named there is a feature described
      twice, and every addition pushes the sentence that earns the click further out of sight.
      Adding one line per feature took it to 2,100 characters before anyone looked at the rendered
      card. Keep it to one or two sentences and let the README sell. Only rewrite it if the feature
      changes what the package fundamentally *is*
- [ ] **A decision worth its reasoning** is in a dated `docs/design/` doc
- [ ] Anything a build taught you that is not obvious from the code is written down where the next
      person will hit it, not left in a commit message

Two files have confusingly similar names and opposite answers, so to be explicit:

- **`umbraco-marketplace-<lowercase package id>.json`** (repository root) is the marketplace
  listing. There is one per shipped package, named for that package, because the Marketplace looks
  the file up per package rather than per repository. User-facing, and its `Tags` and `Screenshots`
  change with a feature while its `Description` mostly does not. It is on the list above.
  `RELEASE.md` explains why both are suffixed rather than one being the plain
  `umbraco-marketplace.json`.
- **`backoffice/public/umbraco-package.json`** is the Umbraco extension manifest. It registers one
  bundle, and everything inside the desktop is wired up in TypeScript rather than as separate
  manifest entries, so it almost never changes for a feature.

## Attached windows

Content that belongs beside one window (a preview, a diff, a copy from another environment) is
attached content: a pane inside its owner, or a window grouped with it. Read
`docs/developer/attached-windows.md` before building a feature like that. The desktop already handles
placement, docking, stacking, minimizing, closing and theming, and the guide lists what your element
must do and the traps the first consumer hit.

## Themes

Five ship: Umbraco, Umbraco 4, macOS, Windows 11, Windows 98. Adding one is a folder under
`theme/themes/<id>/` plus one entry in `theme/themes/index.ts`, and it should touch nothing else.
If a theme needs a change to a chrome component, that is a signal the contract is missing a token,
so add the token and let every theme have it.

`docs/developer/theming.md` is the full guide, and it is deliberately written for someone outside this
repository. Read it before changing a theme as well as before adding one; §5 and §6.3 are traps
that each cost real time to find.

A Linux theme is the one candidate deliberately not built. GNOME/Adwaita's identity is the
headerbar, which fuses the titlebar with the application's own controls, and this shell cannot do
that because a window's content is someone else's document in an iframe. It needs an idea for that
before it needs CSS.
