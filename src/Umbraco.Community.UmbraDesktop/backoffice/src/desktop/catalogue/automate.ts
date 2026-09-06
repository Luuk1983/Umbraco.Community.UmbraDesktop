import type { UmbraDesktopCatalogueEntry } from '../types';

/**
 * Umbraco Automate — the section alone.
 *
 * Its menu items are tree-kind, which `inferUrl` does not infer, and its two other dashboards
 * (`Ua.Dashboard.Runs`, `Ua.Dashboard.Approvals`) are gated on `Ua.Condition.WorkspacesExist`. Both
 * are reachable from the section's own sidebar, so neither earns a tile; if one ever does, that
 * condition is answerable from the desktop and belongs in `evaluateConditions`.
 *
 * **Referencing the alias rather than a URL is load-bearing here.** A live branch
 * (`v18/feature/rename-automate-section-url`) changes this section's pathname from `automate` to
 * `automation` while leaving the alias alone. A section `ref` reads the pathname from the manifest
 * at runtime and survives that; a hardcoded URL would break silently on upgrade.
 *
 * One tile in its own group, as AI is. Automate is a capability platform with its own add-on
 * packages rather than administrative plumbing, so filing it under System read wrong even while it
 * was the group's only Automate entry — and the tree-kind menu items above are the entries that
 * would join it here once `inferUrl` can reach them.
 */
export const entries: UmbraDesktopCatalogueEntry[] = [
  {
    alias: 'automate',
    ref: 'Ua.Section.Automate',
    // Label is `#uaSections_automate`; the package translates it.
    icon: 'icon-lightning',
    chromeProfile: 'full-section',
    defaultSize: { w: 1100, h: 760 },
    allowMultiple: true,
    group: 'automation',
    weight: 10,
  },
];
