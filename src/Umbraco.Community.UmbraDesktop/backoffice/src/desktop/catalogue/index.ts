import type { UmbraDesktopCatalogue } from '../types';
import { groups } from './groups';
import { entries as content } from './content';
import { entries as development } from './development';
import { entries as usersMembers } from './users-members';
import { entries as diagnostics } from './diagnostics';
import { entries as system } from './system';
import { excludedSections } from './exclusions';

/** The collated curated catalogue. Add a fragment file exporting `entries` (and optionally `groups`) and spread it in here. */
export const catalogue: UmbraDesktopCatalogue = {
  groups,
  entries: [...content, ...development, ...usersMembers, ...diagnostics, ...system],
  excludedSections,
};
