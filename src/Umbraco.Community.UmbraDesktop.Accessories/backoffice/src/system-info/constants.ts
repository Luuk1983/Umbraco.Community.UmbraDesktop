/**
 * Every number System Information needs in more than one place. Separate from the element so the
 * manifest can read the content size without pulling the app into the bundle's main chunk.
 */

/** The app's own padding, and the gap between its parts, in px. */
export const SYSTEM_INFO_PADDING_PX = 10;

/** The tab strip and the button row, in px. */
export const SYSTEM_INFO_BAR_PX = 28;

/** The width of the logo column on General, and of the category list on Details, in px. */
export const SYSTEM_INFO_SIDE_PX = 120;

/**
 * The General tab's three groups (System, Registered to, Computer), each a caption and up to three
 * lines, in px. Nothing on General scrolls, so this is what the minimum height has to hold.
 */
export const SYSTEM_INFO_GENERAL_PX = 3 * (18 + 3 * 18) + 2 * 10;

/** The content box it opens at: room for a details table's longer values. */
export const SYSTEM_INFO_CONTENT_SIZE = { w: 540, h: 400 } as const;

/** The smallest content box: General whole, between the tabs and the buttons. */
export const SYSTEM_INFO_MIN_CONTENT_SIZE = {
  w: 400,
  h: SYSTEM_INFO_PADDING_PX * 4 + SYSTEM_INFO_BAR_PX * 2 + SYSTEM_INFO_GENERAL_PX + 2,
} as const;
