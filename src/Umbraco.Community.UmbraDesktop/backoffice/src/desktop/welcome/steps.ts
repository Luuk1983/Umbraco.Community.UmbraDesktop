/**
 * The wizard's pages and what its button row shows on each (design doc D3, D4).
 *
 * Separate from the element so the rule is a table a test can read, rather than conditions spread
 * through a template.
 */

/** One of the wizard's pages. */
export type UmbraDesktopWelcomePage = 'language' | 'theme' | 'sign-in';

/**
 * The pages, in order.
 *
 * Language first, so that everything after it is already in the person's own language (D3).
 */
export const UMBRADESKTOP_WELCOME_PAGES: ReadonlyArray<UmbraDesktopWelcomePage> = ['language', 'theme', 'sign-in'];

/** What the button row shows on one page. */
export interface UmbraDesktopWelcomeButtons {
  /** The main button's label, as a localization key. */
  primaryKey: string;

  /** Whether Back is offered. */
  back: boolean;

  /** Whether this is the last page, where the main button finishes the wizard. */
  last: boolean;
}

/**
 * The button row for one page.
 *
 * Next, and Done on the last page. Never Skip: every page shows its default selected, and going on
 * with a choice you can see is Next, which is also what Windows and macOS say when a default is
 * pre-selected (design doc §4).
 * @param index The page's position in {@link UMBRADESKTOP_WELCOME_PAGES}.
 * @returns What the row shows.
 */
export function welcomeButtons(index: number): UmbraDesktopWelcomeButtons {
  const last = index >= UMBRADESKTOP_WELCOME_PAGES.length - 1;
  return {
    primaryKey: last ? 'umbraDesktop_welcomeDone' : 'umbraDesktop_welcomeNext',
    back: index > 0,
    last,
  };
}
