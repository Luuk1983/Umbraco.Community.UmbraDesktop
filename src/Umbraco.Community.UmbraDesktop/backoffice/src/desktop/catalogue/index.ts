import type { UmbraDesktopCatalogue } from '../types';
import { groups } from './groups';
import { entries as content } from './content';
import { entries as settings } from './settings';
import { excludedSections } from './exclusions';

/** The collated curated catalogue. Add a fragment file exporting `entries` (and optionally `groups`) and spread it in here. */
export const catalogue: UmbraDesktopCatalogue = {
  groups,
  entries: [...content, ...settings],
  excludedSections,
};
