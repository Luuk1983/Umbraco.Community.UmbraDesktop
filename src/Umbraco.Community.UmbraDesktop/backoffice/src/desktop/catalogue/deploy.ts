import type { UmbraDesktopCatalogueEntry } from '../types';

/**
 * Umbraco Deploy — three entries.
 *
 * Deploy registers no section of its own. Deploy 18 puts a `Deploy.Menu.Settings` sidebar menu in
 * Settings, holding three menu items; Deploy 17's two dashboards are gone (the 17 branch's catalogue
 * has those). Each entry resolves by `ref`, so a site without Deploy shows none of them: a `url` is not
 * checked against the registry and would ship three dead tiles.
 *
 * Nothing in a menu-item manifest says which section it belongs to, so each entry states it.
 *
 * Every name is ours. Deploy's labels are `#deploy_status`, `#deploy_schema` and `#deploy_configuration`,
 * which render as "Status", "Schema" and "Configuration": fine in a Deploy sidebar, meaningless as
 * three flat tiles beside Content and Media. The icons *are* inherited, because those menu items
 * carry one each.
 */
export const entries: UmbraDesktopCatalogueEntry[] = [
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
