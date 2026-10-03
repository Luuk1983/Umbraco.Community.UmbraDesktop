# UmbraDesktop — brainstorm mockups

Standalone snapshots of the visuals produced while shaping the design (see
[`../umbradesktop-design.md`](../umbradesktop-design.md)). Open any `.html` file directly in
a browser. Tiles/options are clickable purely to show selection state — they don't do
anything.

Presented in the order the design was explored:

1. **[metaphor.html](./metaphor.html)** — the three desktop visions (companion panes /
   windowed desktop / tiling grid). Chosen: **windowed desktop**.
2. **[approaches.html](./approaches.html)** — three ways to build it (in-process / iframe /
   hybrid) with the package-vs-core-change trade-offs. Chosen: **iframe, no core changes**.
3. **[app-model.html](./app-model.html)** — what an "app" is, and defining apps via a
   `desktopApp` manifest extension type. Chosen: **manifest extension type + auto-derive**.
4. **[fallback-tiers.html](./fallback-tiers.html)** — the confidence tiers (✓ verified /
   ~ auto / ⚠ experimental) and the confidence→chrome coupling.
5. **[fullscreen-drawer.html](./fullscreen-drawer.html)** — the fullscreen launchpad,
   categorised per section with multilevel sub-groups. v1 scope: **auto + search**.
6. **[blueprint.html](./blueprint.html)** — the end-to-end architecture on one screen.

Later mockups, one set per feature, named after the design doc they belong to:

- **[launcher-layout-model.html](./launcher-layout-model.html)**,
  **[launcher-layout-drag.html](./launcher-layout-drag.html)** and
  **[launcher-layout-arrange.html](./launcher-layout-arrange.html)**: the launcher you arrange
  yourself, for [`../2026-09-27-launcher-layout-design.md`](../2026-09-27-launcher-layout-design.md).
  The first one's normal-mode view predates Pinned being a place, which the second one shows.
- **[2026-09-30-solitaire.html](./2026-09-30-solitaire.html)**: the Solitaire table, its settings
  modal, the default deck and the card back per theme, for
  [`../2026-09-30-solitaire-design.md`](../2026-09-30-solitaire-design.md). The wallpaper crops are
  embedded, so the file opens on its own. Its court figures are placeholders.
- **[2026-10-03-welcome-wizard.html](./2026-10-03-welcome-wizard.html)**: the welcome animation
  as three stills, the language page in English and in Dutch, the theme page and the sign-in page,
  for [`../2026-10-03-welcome-wizard-design.md`](../2026-10-03-welcome-wizard-design.md). The
  wallpaper thumbnails are embedded, so the file opens on its own. The theme cards are drawn by
  hand; the built page uses the theme picker's own miniatures.
