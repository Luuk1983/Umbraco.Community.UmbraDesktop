/**
 * Id of the Connections settings category.
 *
 * Stated here rather than in the category's own folder so that both parties can read it without one
 * importing the other's element: the Status app links to that screen, and the category declares
 * itself with it. The settings panel takes this id as a deep link, so a literal that drifted from
 * the category's own would silently open the list instead of the screen, with nothing failing.
 */
export const UMBRADESKTOP_CONNECTIONS_CATEGORY_ID = 'connections';
