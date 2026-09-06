import type { UmbraDesktopCatalogueEntry } from '../types';

/**
 * Umbraco Deploy — five entries covering **two incompatible majors**.
 *
 * Deploy registers no section of its own, so every entry is a dashboard or a menu item. v17 puts a
 * management dashboard in Settings and an environments dashboard in Content. v18 removes both and
 * restructures around a `Deploy.Menu.Settings` sidebar menu holding three menu items instead.
 *
 * The two sets are disjoint: an install resolves the first two or the last three, never all five.
 * Nothing detects the version, and nothing needs to — this works for the same reason
 * `advanced-security.ts` does, and breaks the same way if anyone replaces a `ref` with a `url`,
 * because a URL is not checked against the registry and would ship three dead tiles to every v17
 * install.
 *
 * The dashboards derive their gate from their own `Umb.Condition.SectionAlias`. The menu items
 * cannot — nothing in a menu-item manifest says which section it belongs to — so they state it.
 *
 * Every name is ours. v18's labels are `#deploy_status`, `#deploy_schema` and `#deploy_configuration`,
 * which render as "Status", "Schema" and "Configuration": fine in a Deploy sidebar, meaningless as
 * three flat tiles beside Content and Media. The v18 icons *are* inherited, because those menu items
 * carry one each.
 */
export const entries: UmbraDesktopCatalogueEntry[] = [
  // v17 — removed in v18.
  {
    alias: 'deploy',
    ref: 'Deploy.Management.Dashboard',
    name: '#umbraDesktop_appDeploy',
    icon: 'icon-umb-deploy',
    chromeProfile: 'bare',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'synchronisation',
    weight: 20,
  },
  {
    alias: 'deploy-environments',
    ref: 'Deploy.Environments.Dashboard',
    name: '#umbraDesktop_appDeployEnvironments',
    icon: 'icon-umb-deploy',
    chromeProfile: 'bare',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'synchronisation',
    weight: 30,
  },

  // v18 and later — absent on v17.
  {
    alias: 'deploy-status',
    ref: 'Deploy.MenuItem.Status',
    section: 'Umb.Section.Settings',
    name: '#umbraDesktop_appDeployStatus',
    // Icon inherited: the menu item declares `icon-medical-emergency`.
    chromeProfile: 'workspace-only',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'synchronisation',
    weight: 40,
  },
  {
    alias: 'deploy-schema',
    ref: 'Deploy.MenuItem.Schema',
    section: 'Umb.Section.Settings',
    name: '#umbraDesktop_appDeploySchema',
    chromeProfile: 'workspace-only',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'synchronisation',
    weight: 50,
  },
  {
    alias: 'deploy-configuration',
    ref: 'Deploy.MenuItem.Configuration',
    section: 'Umb.Section.Settings',
    name: '#umbraDesktop_appDeployConfiguration',
    chromeProfile: 'workspace-only',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'synchronisation',
    weight: 60,
  },
];
