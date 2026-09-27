import type { UmbraDesktopRefDescriptor } from './types';

/** Backoffice mount path; deep links are absolute under it. */
const BACKOFFICE_PATH = '/umbraco';

/**
 * Where every backoffice section is routed, and so every screen a window can host. Exported because
 * package catalogue validation accepts a `url` only under it (design D14), and a second spelling of
 * this path would be the one that drifts.
 */
export const UMBRADESKTOP_BACKOFFICE_SECTION_PATH = `${BACKOFFICE_PATH}/section`;

/**
 * Build the backoffice deep-link URL for a referenced extension, or null when the
 * surface isn't inferable by rule (tree/link/action menu items, or missing
 * primitives). Rules confirmed against the v17 backoffice router/menu code — see
 * design §5.1.
 * @param ref Primitives extracted from the referenced manifest.
 * @returns An absolute backoffice URL, or null when it cannot be inferred.
 */
export function inferUrl(ref: UmbraDesktopRefDescriptor): string | null {
  switch (ref.type) {
    case 'section':
      return ref.pathname ? `${UMBRADESKTOP_BACKOFFICE_SECTION_PATH}/${ref.pathname}` : null;
    case 'dashboard':
      return ref.sectionPathname && ref.pathname
        ? `${UMBRADESKTOP_BACKOFFICE_SECTION_PATH}/${ref.sectionPathname}/dashboard/${ref.pathname}`
        : null;
    case 'menuItem':
      // Only the default kind maps to a workspace route (menu-item-default.element.ts).
      if (ref.kind && ref.kind !== 'default') return null;
      return ref.sectionPathname && ref.entityType
        ? `${UMBRADESKTOP_BACKOFFICE_SECTION_PATH}/${ref.sectionPathname}/workspace/${ref.entityType}`
        : null;
    default:
      return null;
  }
}
