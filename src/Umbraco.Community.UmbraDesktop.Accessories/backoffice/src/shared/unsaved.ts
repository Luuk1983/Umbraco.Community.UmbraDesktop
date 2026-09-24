/**
 * The attribute an app puts on its own element while it holds unsaved work.
 *
 * The host desktop's published name (`UMBRADESKTOP_DIRTY_ATTRIBUTE` there, `docs/desktop-apps.md`
 * §7), written out here because nothing is imported from the host. While it is present the window
 * shows the unsaved marker, and its close button asks before the work is thrown away.
 */
export const UNSAVED_ATTRIBUTE = 'data-umbradesktop-dirty';
