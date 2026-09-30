/** What a preview shows: a document, in the variant its editor is working in. */
export interface UmbraDesktopPreviewTarget {
  /** The document's GUID, its `unique`. */
  unique: string;
  /** The culture being edited, or undefined for an invariant document or the default variant. */
  culture: string | undefined;
  /** The segment being edited, if any. */
  segment: string | undefined;
}

/**
 * The document workspace's edit route: the GUID, then an optional variant segment.
 *
 * Anchored on `workspace/document/edit/` rather than on the section, because the same workspace is
 * reachable from more than one section, and it is the workspace route that carries the document.
 * The create route is deliberately not matched: a document being created has never been saved, so
 * there is nothing a preview could show.
 */
const EDIT_ROUTE = /\/workspace\/document\/edit\/([0-9a-f-]{36})(?:\/([^/]+))?/i;

/** Core's name for "no culture" in a variant segment (`UMB_INVARIANT_CULTURE`). */
const INVARIANT = 'invariant';

/** Core's separator between the two variants of a split view. */
const SPLIT_VIEW = '_&_';

/**
 * Read what to preview off a document window's route.
 *
 * The variant segment is in core's own format, which `UmbVariantId.FromString` parses: a culture or
 * `invariant`, optionally followed by `_` and a segment. A split view puts two of those in one
 * segment joined by `_&_`, and the first is the one on the left, which is the one the editor opened
 * and the one a preview should follow. A route with no variant segment yet, which a document shows
 * for a moment while it loads, is the default variant. Pure.
 * @param pathname The frame's `location.pathname`.
 * @returns The target, or undefined when the route is not a document being edited.
 */
export function previewTargetFromPath(pathname: string): UmbraDesktopPreviewTarget | undefined {
  const match = EDIT_ROUTE.exec(pathname);
  if (!match) return undefined;
  const variant = decodeURIComponent(match[2] ?? '').split(SPLIT_VIEW)[0];
  const underscore = variant.indexOf('_');
  const culture = underscore === -1 ? variant : variant.substring(0, underscore);
  const segment = underscore === -1 ? '' : variant.substring(underscore + 1);
  return {
    unique: match[1].toLowerCase(),
    culture: culture && culture !== INVARIANT ? culture : undefined,
    segment: segment || undefined,
  };
}
