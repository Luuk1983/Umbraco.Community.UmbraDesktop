/**
 * The desktop's own list of workspace views that should not open beside the editor, by alias
 * (issue #131, design §6.1). Packages keep their own list in their catalogue's
 * `workspaceViewsNotBeside`, and the two add up.
 *
 * Empty, and that is a finding rather than an oversight: the spike found no core view that breaks
 * beside the editor once editor kinds and views with their own router are left out. It is the net
 * for a view those checks cannot see, such as one that builds a router long after it renders. Kept
 * apart from `catalogue/exclusions.ts`, which is about launcher tiles.
 */
export const UMBRADESKTOP_VIEWS_NOT_BESIDE: ReadonlyArray<string> = [];
