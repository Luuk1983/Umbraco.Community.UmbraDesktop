import { BAR_HEIGHT_PX, MEDIA_MIN_HEIGHT_PX } from '../media-player/constants.js';

/**
 * Every value umbraCoffee needs in more than one place.
 *
 * Separate from the store, the schedule and the elements for the reason Minesweeper's `constants.ts`
 * gives: `bundle.manifests.ts` needs the aliases and the window sizes, and it must not import an
 * element module, because those sit behind lazy `element: () => import(...)` loaders and an eager
 * import from the manifest would pull the window into the bundle's main chunk.
 */

/** The umbraCoffee app's alias. The tray cup and the reminder open it by this. */
export const UMBRACOFFEE_APP_ALIAS = 'Umbraco.Community.UmbraDesktop.Entertainment.UmbraCoffee';

/** The tray item's alias. Also the key its on/off switch is stored under: never change it. */
export const UMBRACOFFEE_TRAY_ALIAS = 'Umbraco.Community.UmbraDesktop.Entertainment.UmbraCoffeeTray';

/**
 * The data branch's raw base URL, the folder holding `episodes.json` and `next-episode.json`. One
 * constant, so moving to GitHub Pages is one line (design §7.1).
 */
export const UMBRACOFFEE_DATA_BASE_URL =
  'https://raw.githubusercontent.com/Luuk1983/Umbraco.Community.UmbraDesktop/data/umbracoffee/umbracoffee';

/** How often the store asks when nothing is coming up: the raw host caches for five minutes anyway. */
export const UMBRACOFFEE_POLL_IDLE_MS = 30 * 60 * 1000;

/** How often it asks while an episode is live or about to be (design E5). */
export const UMBRACOFFEE_POLL_ACTIVE_MS = 60 * 1000;

/**
 * "About to be": an upcoming episode this close to its start (or past it) switches the store to the
 * fast poll, so the switch to live is seen within a minute.
 */
export const UMBRACOFFEE_ACTIVE_WINDOW_MS = 2 * 60 * 60 * 1000;

/** How often the GitHub Action runs, in ms: GitHub's shortest schedule. */
const ACTION_INTERVAL_MS = 5 * 60 * 1000;

/** How late a scheduled run usually starts at busy times, in ms (design §1: 10 to 15 minutes, rounded up). */
const ACTION_LATE_MS = 25 * 60 * 1000;

/**
 * How old `next-episode.json`'s `updatedAt` may be before an upcoming or live episode is no longer
 * believed (design §3.2): the Action's interval plus GitHub's usual start delay. A stale file is
 * "missed, never wrong", so the cup hides and no reminder is raised from it.
 */
export const UMBRACOFFEE_NEXT_MAX_AGE_MS = ACTION_INTERVAL_MS + ACTION_LATE_MS;

/**
 * How long past its scheduled start an episode YouTube still calls upcoming is believed. Shows start
 * a few minutes late, so the countdown, the cup and the "starts soon" reminder carry on through that.
 * But the server keeps reporting an upcoming stream for hours, so without a limit a stream that was
 * badly delayed or abandoned would go on raising "starts soon, starts at 11:30" at 14:00 with the
 * cup reading "in 0 min", which is a wrong reminder, and the rule is missed, never wrong (design D4).
 * Half an hour is well past any ordinary late start and well short of that afternoon.
 */
export const UMBRACOFFEE_LATE_START_GRACE_MS = 30 * 60 * 1000;

/** How long before the start the first reminder comes (design D7). */
export const UMBRACOFFEE_REMINDER_LEAD_MS = 10 * 60 * 1000;

/** How long the live reminder stays up. It clears its hidden original in the desktop's document too. */
export const UMBRACOFFEE_LIVE_REMINDER_MS = 15 * 60 * 1000;

/*
 * The window's layout (v2 plan, addendum 2026-10-01 (2), and its mock): the player edge to edge with
 * the shared control bar under it and the episode's details on the window itself, beside a column
 * with the search and the episode list. Every height the window is made of is here, so the content
 * size the manifest declares is the sum of what the CSS draws, and the window's tests measure the
 * sum rather than trust it. The column moves under the player in a narrow window.
 *
 * Nothing in the window scrolls but the episode list. So the player's picture is the part that
 * gives: the CSS caps its height at what the window has left once everything else has its share
 * (`--umbradesktop-media-frame-max-height`), and the picture letterboxes rather than push the rest
 * past the window's bottom.
 */

/** The player's shape: YouTube's, 16:9. The window's CSS and its sizing tests both read it. */
export const UMBRACOFFEE_PLAYER_ASPECT = { w: 16, h: 9 } as const;

/** Width of the column (search and episodes, or Chat and Episodes while live) beside the player, in px. */
export const UMBRACOFFEE_PANEL_WIDTH = 320;

/** The player's width in the opening window, in px: the mock's 1008px window less the column. */
export const UMBRACOFFEE_PLAYER_WIDTH = 688;

/** The player's height in the opening window, in px, derived from its width and shape. */
export const UMBRACOFFEE_PLAYER_HEIGHT = (UMBRACOFFEE_PLAYER_WIDTH * UMBRACOFFEE_PLAYER_ASPECT.h) / UMBRACOFFEE_PLAYER_ASPECT.w;

/** The shared control bar's height, the media player's own constant: the same on demand, live and waiting. */
export const UMBRACOFFEE_PLAYER_BAR_HEIGHT = BAR_HEIGHT_PX;

/**
 * The episode's details under the bar, beside the column, in px: the space above the title, the
 * title's line, the gap to the date line and its line (22px, the height of the state tag on it), the
 * gap to the summary and a summary line, and
 * the space at the bottom. The CSS sets each as a padding, a margin or a line height.
 */
export const UMBRACOFFEE_INFO = { padTop: 18, title: 28, metaGap: 6, meta: 22, summaryGap: 12, summaryLine: 22, padBottom: 18 } as const;

/** How many lines of summary the details show before they clamp, at the opening size. */
export const UMBRACOFFEE_INFO_SUMMARY_LINES = 5;

/**
 * What the details always keep, in px: the title and the date line. The picture's cap leaves this
 * much under the bar, so a short window still says what is playing; the summary takes what is left
 * and is clipped, never scrolled.
 */
export const UMBRACOFFEE_INFO_MIN_HEIGHT = UMBRACOFFEE_INFO.padTop + UMBRACOFFEE_INFO.title + UMBRACOFFEE_INFO.metaGap + UMBRACOFFEE_INFO.meta;

/**
 * What the picture's cap leaves the details in a window that is short for its width, in px: the
 * title and date line, two summary lines and the bottom padding. With only
 * {@link UMBRACOFFEE_INFO_MIN_HEIGHT} reserved, a maximized window put the date line flush on the
 * window's bottom edge and the details read as cut off (owner, 2026-10-11).
 */
export const UMBRACOFFEE_INFO_RESERVED_HEIGHT =
  UMBRACOFFEE_INFO_MIN_HEIGHT + UMBRACOFFEE_INFO.summaryGap + 2 * UMBRACOFFEE_INFO.summaryLine + UMBRACOFFEE_INFO.padBottom;

/** The details at the opening size, in px: the title, the date line and a full summary. */
export const UMBRACOFFEE_INFO_HEIGHT =
  UMBRACOFFEE_INFO_MIN_HEIGHT +
  UMBRACOFFEE_INFO.summaryGap +
  UMBRACOFFEE_INFO_SUMMARY_LINES * UMBRACOFFEE_INFO.summaryLine +
  UMBRACOFFEE_INFO.padBottom;

/**
 * The details in a narrow window, in px each, where the list sits under them and they must not take
 * its room: a one-line title, a one-line date line and a two-line summary, each clamped.
 */
export const UMBRACOFFEE_NARROW_INFO = { pad: 14, title: 24, metaGap: 6, meta: 22, summaryGap: 8, summaryLine: 22 } as const;

/** How many lines of summary the narrow details show. */
export const UMBRACOFFEE_NARROW_SUMMARY_LINES = 2;

/** The narrow details at their tallest, in px, every line clamped. */
export const UMBRACOFFEE_NARROW_INFO_HEIGHT =
  UMBRACOFFEE_NARROW_INFO.pad +
  UMBRACOFFEE_NARROW_INFO.title +
  UMBRACOFFEE_NARROW_INFO.metaGap +
  UMBRACOFFEE_NARROW_INFO.meta +
  UMBRACOFFEE_NARROW_INFO.summaryGap +
  UMBRACOFFEE_NARROW_SUMMARY_LINES * UMBRACOFFEE_NARROW_INFO.summaryLine +
  UMBRACOFFEE_NARROW_INFO.pad;

/**
 * The height of the search field and the column's buttons, in px: Umbraco 17's field and button
 * height. Measured by the list's tests under every theme, since a theme block that grew a bevel into
 * a border would make the column's controls a different size under one theme.
 */
export const UMBRACOFFEE_FIELD_HEIGHT = 33;

/** The space above and below the search field's row, beside the player and under it, in px. */
export const UMBRACOFFEE_SIDE_TOP = { wide: { top: 12, bottom: 9 }, narrow: { top: 10, bottom: 6 } } as const;

/** The search field's row beside the player, in px. */
export const UMBRACOFFEE_SIDE_TOP_HEIGHT = UMBRACOFFEE_SIDE_TOP.wide.top + UMBRACOFFEE_FIELD_HEIGHT + UMBRACOFFEE_SIDE_TOP.wide.bottom;

/** The search field's row under the player, in px. */
export const UMBRACOFFEE_NARROW_SIDE_TOP_HEIGHT =
  UMBRACOFFEE_SIDE_TOP.narrow.top + UMBRACOFFEE_FIELD_HEIGHT + UMBRACOFFEE_SIDE_TOP.narrow.bottom;

/** The Chat and Episodes tabs' row while live, in px (a uui-tab row). */
export const UMBRACOFFEE_TABS_HEIGHT = 48;

/** An episode row's thumbnail width, in px; its height is the player's shape. */
export const UMBRACOFFEE_THUMB_WIDTH = 120;

/** The padding round an episode row, in px. */
export const UMBRACOFFEE_ROW_PADDING = 6;

/** One episode row's height, in px: its thumbnail, which is taller than its text, and the padding. */
export const UMBRACOFFEE_ROW_HEIGHT =
  (UMBRACOFFEE_THUMB_WIDTH * UMBRACOFFEE_PLAYER_ASPECT.h) / UMBRACOFFEE_PLAYER_ASPECT.w + 2 * UMBRACOFFEE_ROW_PADDING;

/**
 * The least of the list a narrow window keeps on screen, in px: one whole row. The picture's cap
 * leaves this much under the search field, so the list never shrinks to a sliver.
 */
export const UMBRACOFFEE_LIST_MIN_HEIGHT = Math.ceil(UMBRACOFFEE_ROW_HEIGHT);

/**
 * The narrowest the player is allowed to get while the column is beside it, in px. The same number is
 * the smallest window's width, so the player in a window with the column beside it is never smaller
 * than the player in the smallest window. 520 because the shared bar's buttons grew (2026-10-11) and
 * the waiting bar's "Starts in 28 days" needs the room beside them at the smallest size.
 */
export const UMBRACOFFEE_MIN_PLAYER_WIDTH = 520;

/**
 * The narrowest content box that puts the column beside the player, in px: the player at its
 * narrowest and the column. Below it the column moves under the player, because a fixed column in a
 * narrower box would take the room from the picture.
 */
export const UMBRACOFFEE_STACK_BREAKPOINT = UMBRACOFFEE_MIN_PLAYER_WIDTH + UMBRACOFFEE_PANEL_WIDTH;

/**
 * The opening **content** box: the player at {@link UMBRACOFFEE_PLAYER_WIDTH} with the column beside
 * it, and under the player its bar and the details. The host adds the theme's chrome, as it does for
 * the games.
 */
export const UMBRACOFFEE_CONTENT_SIZE = {
  w: UMBRACOFFEE_PLAYER_WIDTH + UMBRACOFFEE_PANEL_WIDTH,
  h: UMBRACOFFEE_PLAYER_HEIGHT + UMBRACOFFEE_PLAYER_BAR_HEIGHT + UMBRACOFFEE_INFO_HEIGHT,
} as const;

/**
 * The smallest content box the window works in: narrow, so the list is under the player, and as
 * short as it can be with the picture at YouTube's 200px minimum, the bar, the narrow details, the
 * search row and one row of the list all on screen and nothing scrolling but the list.
 */
export const UMBRACOFFEE_MIN_CONTENT_SIZE = {
  w: UMBRACOFFEE_MIN_PLAYER_WIDTH,
  h:
    MEDIA_MIN_HEIGHT_PX +
    UMBRACOFFEE_PLAYER_BAR_HEIGHT +
    UMBRACOFFEE_NARROW_INFO_HEIGHT +
    UMBRACOFFEE_NARROW_SIDE_TOP_HEIGHT +
    UMBRACOFFEE_LIST_MIN_HEIGHT,
} as const;

/** How many episodes the list draws at first, and how many more each "Show more" adds (349 thumbnails at once would be rude). */
export const UMBRACOFFEE_EPISODE_PAGE_SIZE = 30;

/** Where an episode's thumbnail lives, by id. `i.ytimg.com` allows cross-origin reads and needs no key. */
export const UMBRACOFFEE_THUMBNAIL_URL = 'https://i.ytimg.com/vi/';

/** The channel, for the "all episodes" link. */
export const UMBRACOFFEE_CHANNEL_URL = 'https://www.youtube.com/@umbraCoffee/videos';

/**
 * The tray cup's icon size, in px: the size the desktop's taskbar draws an app's icon at
 * (`taskbar.element.ts`, the task button's icon), so the cup reads as the same app icon as the
 * umbraCoffee button beside it rather than a smaller drawing of its own (owner, 2026-10-11).
 */
export const UMBRACOFFEE_TRAY_ICON_SIZE = 18;

/**
 * The reminder's cup badge, in px: a round umbraCoffee badge beside the words, the size of three lines
 * of toast text, so the reminder reads as umbraCoffee's at a glance (owner, 2026-10-11, mock round 2).
 */
export const UMBRACOFFEE_REMINDER_BADGE_SIZE = 42;

/** The cup inside the reminder's badge, in px: icon-coffee at the badge's size less a ring of air. */
export const UMBRACOFFEE_REMINDER_ICON_SIZE = 26;
