import type { UmbraDesktopCatalogue } from '../types';
import { categories, groups } from './categories';
import { entries as content } from './content';
import { entries as settings } from './settings';

/**
 * The collated curated catalogue. To extend it, add a fragment file exporting
 * `entries` (and optionally `categories`/`groups`) and spread it in here.
 */
export const catalogue: UmbraDesktopCatalogue = {
  categories,
  groups,
  entries: [...content, ...settings],
};
