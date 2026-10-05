/** The hub's app alias. Final once shipped: pins and saved window layouts hang off it. */
export const ARCADE_HUB_ALIAS = 'Umbraco.Community.UmbraDesktop.Services.Arcade.Hub';

/**
 * The hub's opening content box: the mock's window less its titlebar. Two tiles side by side and the
 * game page's podium need this width.
 */
export const HUB_CONTENT_SIZE = { w: 820, h: 580 };

/** The smallest box the overview's tiles fit in, one column wide. */
export const HUB_MIN_CONTENT_SIZE = { w: 480, h: 420 };

/** Below this content width the overview's tiles go to one column. */
export const HUB_ONE_COLUMN_BELOW_PX = 640;
