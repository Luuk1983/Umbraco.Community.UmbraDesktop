import type { UmbraDesktopCatalogueEntry } from '../types';

/**
 * Umbraco Engage — the section, and the Settings item that configures it.
 *
 * Engage replaces the section element wholesale with its own `engageSection` kind and navigates
 * internally by a bespoke `engageScreenElement` type. Its analytics, personalization, A/B testing,
 * profiles and reporting screens are all that type, so none is addressable through the registry, and
 * `Engage.SectionView.Root` — the one standard `sectionView` it registers — *is* the section root.
 * One tile, therefore, and the section's own tab strip does the rest.
 *
 * The icon is a core one, not Engage's own, and that took investigation to arrive at. Engage does
 * register an icon literally named `engage` through `Engage.Icons.Backoffice`, and its module
 * exports the SVG correctly when read from the shipped package — by every check available without
 * a browser, it should render. It does not: the tile comes up blank in the launcher, for a reason
 * not yet identified. uSync's `usync-logo` renders fine through the identical path (`app.icon`
 * straight into `<umb-icon name>`), so this is a specific failure of Engage's icon rather than a
 * rule against package-registered ones. Rather than ship a tile that is empty for reasons nobody
 * can currently explain, `icon-megaphone` — confirmed present in Umbraco's core icon dictionary —
 * stands in until the cause turns up.
 *
 * The configuration item goes to System rather than beside its section: it is a Settings-section
 * workspace for administrators, which is what that group holds. Its inherited label is
 * `#engage_configuration` — "Configuration" — too generic for a flat tile, so this one names itself.
 */
export const entries: UmbraDesktopCatalogueEntry[] = [
  {
    alias: 'engage',
    ref: 'Umb.Section.Engage',
    // Label is `#engage_engage`; the package translates it.
    icon: 'icon-megaphone',
    chromeProfile: 'full-section',
    defaultSize: { w: 1100, h: 760 },
    allowMultiple: true,
    group: 'marketing-sales',
    weight: 20,
  },
  {
    alias: 'engage-configuration',
    ref: 'Engage.MenuItem.Configuration',
    section: 'Umb.Section.Settings',
    name: '#umbraDesktop_appEngageConfiguration',
    // Icon inherited: the menu item declares `icon-settings`.
    chromeProfile: 'workspace-only',
    defaultSize: { w: 1200, h: 780 },
    minSize: { w: 900, h: 540 },
    group: 'system',
    weight: 50,
  },
];
