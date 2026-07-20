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
