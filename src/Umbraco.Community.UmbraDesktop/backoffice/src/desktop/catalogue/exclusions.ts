import { UMBRADESKTOP_SECTION_ALIAS } from '../constants';

/**
 * Section aliases the automatic fallback must never surface as apps. Seeded with
 * UmbraDesktop's own section (opening the desktop inside the desktop). Add any other
 * section that should never appear as a desktop app here.
 */
export const excludedSections: string[] = [UMBRADESKTOP_SECTION_ALIAS];
