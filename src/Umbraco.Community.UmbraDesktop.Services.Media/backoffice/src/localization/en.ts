/**
 * English (en) strings for the `umbraDesktopServicesMedia` area.
 *
 * Only what this service says itself: the overwrite question. Everything an app says around an open
 * or a save (the button titles, "Saved", "Not saved") is the app's own, in its own package's area,
 * because each app words it for what it does. Umbraco's own `media_` keys give the reasons a file is
 * refused.
 *
 * The code passes each key to `localize.termOrDefault` with the same English as its fallback, so a
 * backoffice where this dictionary failed to load still renders words.
 */
export default {
  umbraDesktopServicesMedia: {
    // Moved from Accessories with Notepad and Paint's save, words unchanged.
    overwriteHeadline: 'Overwrite %0%?',
    overwriteQuestion: '%0% was changed in the media library after you opened it. Overwrite it with your version?',
    overwriteConfirm: 'Overwrite',
  },
};
