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
docs/
  theming.md                    how to build a theme. The guide for contributors
  design/                       dated design docs, one per feature
umbraco-marketplace.json        what the Umbraco Marketplace shows
```

## Commands

Run from `src/Umbraco.Community.UmbraDesktop`:

```bash
npm run build   # builds wallpapers, then tsc, then vite
npm test        # web-test-runner in a real Chrome
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
  consistent with itself. See `docs/theming.md` §4.
- **A theme may restyle, never remove.** Same for any chrome change: an affordance that disappears
  under one theme is a bug, not a style.

## Definition of done

Code passing is not done. Before a feature is finished, walk this list and say explicitly which
items did not apply:

- [ ] `npm run build` and `npm test` both pass
- [ ] **`README.md`** describes the feature. Check every place it could be named, not the first
      one you find. Themes, for instance, are listed in both the Features list and their own
      section, and a change that updates one reads as sloppier than one that updates neither
- [ ] **`umbraco-marketplace.json`** still describes what the package offers. Its `Description` is
      the text users read before installing, and `Tags` is how they find it. A screenshot in
      `docs/screenshots/` is worth adding when a feature changes what the package looks like
- [ ] **`docs/`** covers it. A user-facing feature belongs in the README; something a contributor
      would need to extend belongs in its own guide, as theming does; a decision worth its
      reasoning belongs in a dated `docs/design/` doc
- [ ] Anything a build taught you that is not obvious from the code is written down where the next
      person will hit it, not left in a commit message

`umbraco-package.json` almost never changes. It registers a single bundle, and everything inside
the desktop is wired up in TypeScript rather than as separate manifest entries.

## Themes

Five ship: Umbraco, Umbraco 4, macOS, Windows 11, Windows 98. Adding one is a folder under
`theme/themes/<id>/` plus one entry in `theme/themes/index.ts`, and it should touch nothing else.
If a theme needs a change to a chrome component, that is a signal the contract is missing a token,
so add the token and let every theme have it.

`docs/theming.md` is the full guide, and it is deliberately written for someone outside this
repository. Read it before changing a theme as well as before adding one; §5 and §6.3 are traps
that each cost real time to find.

A Linux theme is the one candidate deliberately not built. GNOME/Adwaita's identity is the
headerbar, which fuses the titlebar with the application's own controls, and this shell cannot do
that because a window's content is someone else's document in an iframe. It needs an idea for that
before it needs CSS.
