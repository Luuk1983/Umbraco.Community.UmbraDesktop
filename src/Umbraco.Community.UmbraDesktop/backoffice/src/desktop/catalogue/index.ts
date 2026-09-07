import type { UmbraDesktopCatalogue } from '../types';
import { groups } from './groups';
import { entries as content } from './content';
import { entries as forms } from './forms';
import { entries as workflow } from './workflow';
import { entries as commerce } from './commerce';
import { entries as engage } from './engage';
import { entries as development } from './development';
import { entries as uiBuilder } from './ui-builder';
import { entries as synchronisation } from './synchronisation';
import { entries as deploy } from './deploy';
import { entries as security } from './security';
import { entries as advancedSecurity } from './advanced-security';
import { entries as diagnostics } from './diagnostics';
import { entries as system } from './system';
import { entries as automate } from './automate';
import { entries as ai } from './ai';
import { excludedSections } from './exclusions';

/** The collated curated catalogue. Add a fragment file exporting `entries` (and optionally `groups`) and spread it in here. */
export const catalogue: UmbraDesktopCatalogue = {
  groups,
  entries: [
    ...content,
    ...forms,
    ...workflow,
    ...commerce,
    ...engage,
    ...development,
    ...uiBuilder,
    ...synchronisation,
    ...deploy,
    ...security,
    ...advancedSecurity,
    ...diagnostics,
    ...system,
    ...automate,
    ...ai,
  ],
  excludedSections,
};
