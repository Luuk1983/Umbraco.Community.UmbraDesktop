/**
 * What the Add-ons app shows of our own add-ons when the Marketplace cannot be reached (Add-ons
 * design §5): enough for a card and an install line, and nothing that needs the Marketplace.
 *
 * Its order is also the order of the team's section online, so this is the one place the team
 * decides which of its add-ons comes first. Online, the Marketplace's own title and description
 * replace these, so they only need to be right, not current: copy them from each package's
 * marketplace file when one changes.
 */
export interface UmbraDesktopBuiltInAddOn {
  /** The NuGet package id. */
  id: string;
  /** Its name, as on the Marketplace. */
  title: string;
  /** Who made it. */
  authors: string;
  /** Its Marketplace description. */
  description: string;
  /** The colour its cover is filled with, the Marketplace's `iconDominantColor` for its icon. */
  color: string;
}

/**
 * The icon every built-in card shows. Our add-ons share the desktop's package icon, and offline the
 * Marketplace's copy of it cannot load either, so this is the desktop's own app icon, served from
 * this site and drawn from the same mark (`scripts/appicon-art.mjs`).
 */
export const UMBRADESKTOP_BUILT_IN_ICON = '/App_Plugins/Umbraco.Community.UmbraDesktop/appicons/icon-192.png';

/**
 * Our add-ons, in the order the team shows them.
 *
 * The Media add-on is here although the Marketplace had no 17 release of it on 2026-10-29: our
 * packages are released together at one version, so the desktop that carries this list ships beside
 * a Media add-on of its own version.
 */
export const UMBRADESKTOP_BUILT_IN_ADD_ONS: ReadonlyArray<UmbraDesktopBuiltInAddOn> = [
  {
    id: 'Umbraco.Community.UmbraDesktop.Entertainment',
    title: 'UmbraDesktop Entertainment Add-on',
    authors: 'Luuk Peters',
    description:
      'Games and media for UmbraDesktop. An optional add-on that puts Minesweeper, Snake, Solitaire and umbraCoffee on the desktop, each in a window of its own and themed along with the rest of it.',
    color: '#2D508A',
  },
  {
    id: 'Umbraco.Community.UmbraDesktop.Accessories',
    title: 'UmbraDesktop Accessories Add-on',
    authors: 'Luuk Peters',
    description:
      "The small tools for UmbraDesktop. An optional add-on that puts Notepad, Paint, Sticky Notes, Calculator and the rest of Windows' Accessories on the desktop, each in a window of its own and themed along with the rest of it.",
    color: '#2D508A',
  },
  {
    id: 'Umbraco.Community.UmbraDesktop.Media',
    title: 'UmbraDesktop Media Add-on',
    authors: 'Luuk Peters',
    description:
      'Your media library, managed the way you manage files on your own computer: folders in as many windows as you like, dragging between them, copy and paste, and undo. And an Image Editor to crop, redact and resize without leaving the backoffice.',
    color: '#2D508A',
  },
];
