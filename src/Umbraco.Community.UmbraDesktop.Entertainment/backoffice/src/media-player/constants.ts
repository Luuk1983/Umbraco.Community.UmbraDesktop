/**
 * Every number the shared media player needs in more than one place.
 *
 * Kept apart from the elements for the reason the games' `constants.ts` files give: the manifest must
 * not import an element module (it sits behind a lazy loader), and anything that appears in both CSS
 * and JavaScript has to be one constant that both read. The stylesheets interpolate the pixel values
 * through `unsafeCSS`, and the keyboard handlers read the step sizes, so a change here cannot leave
 * the two disagreeing.
 */

/** Where YouTube's IFrame Player API script lives. Loaded only when a player first opens. */
export const YOUTUBE_API_URL = 'https://www.youtube.com/iframe_api';

/**
 * The host the embedded player is served from.
 *
 * The privacy-enhanced domain, which sets no tracking cookies until the viewer plays something. The
 * embed is the same player either way.
 */
export const YOUTUBE_EMBED_HOST = 'https://www.youtube-nocookie.com';

/** Where "Watch on YouTube" goes. The id is appended by the control bar. */
export const YOUTUBE_WATCH_URL = 'https://www.youtube.com/watch?v=';

/**
 * How often the current time is read while a video plays, in ms.
 *
 * The IFrame Player API has no time event, so position is polled. A quarter of a second keeps the
 * scrubber and the clock moving smoothly without the poll being a cost; it only runs while playing.
 */
export const TIME_POLL_INTERVAL_MS = 250;

/** How far the arrow keys move the seek slider, in seconds. */
export const SEEK_STEP_SECONDS = 5;

/** How far Page Up and Page Down move the seek slider, in seconds. */
export const SEEK_PAGE_STEP_SECONDS = 30;

/** How far the arrow keys move the volume slider, on the zero to one scale. */
export const VOLUME_STEP = 0.05;

/** The video frame's shape: 16 wide for every 9 high, which is what YouTube serves. */
export const PLAYER_ASPECT_RATIO = 16 / 9;

/**
 * The smallest the video frame may be in either direction, in px.
 *
 * YouTube's embedding rules ask for a viewport of at least 200 by 200 so its own title, logo and
 * error messages stay legible. Enforced in CSS on the frame rather than trusted to the window.
 */
export const MEDIA_MIN_WIDTH_PX = 200;

/** See {@link MEDIA_MIN_WIDTH_PX}. */
export const MEDIA_MIN_HEIGHT_PX = 200;

/**
 * The fraction of the player that has to be on screen before autoplay is allowed.
 *
 * Also YouTube's embedding rule: a player may not start itself while it is mostly out of view.
 */
export const AUTOPLAY_VISIBLE_RATIO = 0.5;

/** How far the back and forward buttons jump, in seconds. */
export const SKIP_SECONDS = 10;

/**
 * The speeds the speed button steps through, normal first: each press takes the next, and the last
 * goes back to normal. Faster only, because a talk show is what people speed up; YouTube offers
 * every one of these for every video.
 */
export const PLAYBACK_RATES: readonly number[] = [1, 1.25, 1.5, 2];

/**
 * Space above the seek row, in px. None: the seek row carries its own breathing space
 * ({@link BAR_SEEK_ABOVE_PX}), so the bar's top edge is the video's bottom edge with no seam.
 */
export const BAR_PAD_TOP_PX = 0;

/** Space under the row of buttons, in px (the 2026-10-11 "seek line on top" mock). */
export const BAR_PAD_BOTTOM_PX = 10;

/** Space at either end of the bar, in px. The seek line spans the bar inside it. */
export const BAR_PAD_X_PX = 14;

/** Thickness of the visible seek track, in px. The volume track is thinner, see {@link BAR_VOLUME_TRACK_HEIGHT_PX}. */
export const BAR_TRACK_HEIGHT_PX = 5;

/**
 * How much the seek track thickens on hover and focus, as a scale on its height. A transform, so
 * the row never changes size when it happens.
 */
export const BAR_TRACK_HOVER_SCALE = 1.4;

/**
 * Space above the seek track, in px. More than the mock's 10 (the owner asked for a little more
 * room): the line is the thing people reach for, and it sits against the video's edge.
 */
export const BAR_SEEK_ABOVE_PX = 14;

/** Space below the seek track, in px. More than the mock's 8, for the same reason. */
export const BAR_SEEK_BELOW_PX = 10;

/**
 * Height of the seek row, in px: the track and the breathing space around it. The whole row is the
 * slider's pointer and touch target, so the generous space is also hit area.
 */
export const BAR_SEEK_HEIGHT_PX = BAR_SEEK_ABOVE_PX + BAR_TRACK_HEIGHT_PX + BAR_SEEK_BELOW_PX;

/** Edge of the play button, in px. The round white button is the one control bigger than the rest. */
export const BAR_PLAY_SIZE_PX = 40;

/** Edge of a square control-bar button, in px. */
export const BAR_BUTTON_SIZE_PX = 36;

/** Height of the row of buttons under the seek slider, in px: the play button, its tallest member. Every theme shares it. */
export const BAR_ROW_HEIGHT_PX = BAR_PLAY_SIZE_PX;

/**
 * The whole bar's height, in px, the same on demand, live and disabled: the live stream keeps a seek
 * row (a full track at the live edge) so a window that sums its parts never jumps when a stream
 * starts or ends. Windows that put the bar in a layout read this rather than measuring it.
 */
export const BAR_HEIGHT_PX = BAR_PAD_TOP_PX + BAR_SEEK_HEIGHT_PX + BAR_ROW_HEIGHT_PX + BAR_PAD_BOTTOM_PX;

/**
 * Below this width the bar folds the volume slider and the "Watch on YouTube" label into their icons
 * (the mock's narrow window), in px. It is the full row with a three-hour clock in it, the controls,
 * the slider, the time and the labelled link side by side, measured at 654px of row plus the bar's
 * padding (2026-10-11, with the larger buttons of the "seek line on top" bar), and rounded up so a
 * longer translation of the label has room.
 */
export const BAR_COMPACT_WIDTH_PX = 720;

/** Edge of the round thumb on the seek slider, in px. */
export const BAR_KNOB_SIZE_PX = 14;

/** Width of the soft ring around the seek thumb, in px. */
export const BAR_KNOB_RING_PX = 4;

/** Width of the volume slider, in px. */
export const BAR_VOLUME_WIDTH_PX = 64;

/** Height of the volume slider's pointer target, in px. */
export const BAR_VOLUME_HEIGHT_PX = 20;

/** Thickness of the volume track, in px. */
export const BAR_VOLUME_TRACK_HEIGHT_PX = 4;

/** Edge of an icon inside a button, in px. */
export const BAR_ICON_SIZE_PX = 22;

/** Edge of the play and pause glyphs, which are solid and read larger than a stroke icon, in px. */
export const BAR_PLAY_ICON_SIZE_PX = 20;

/** Height of the thin divider before "Watch on YouTube", in px. */
export const BAR_DIVIDER_HEIGHT_PX = 20;

/**
 * The custom property a host sets on the player to cap the video frame's height, so a window that
 * is short for its width keeps its controls and text in view instead of being pushed past its
 * bottom. The frame keeps its full width and YouTube letterboxes the picture inside it.
 */
export const MEDIA_FRAME_MAX_HEIGHT_PROPERTY = '--umbradesktop-media-frame-max-height';
