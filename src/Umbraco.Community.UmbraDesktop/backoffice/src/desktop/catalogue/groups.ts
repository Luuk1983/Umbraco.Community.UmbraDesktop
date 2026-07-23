import type { UmbraDesktopGroup } from '../types';

/** Curated launcher groups — flat, decoupled from Umbraco sections. Labels are loc tokens. */
export const groups: UmbraDesktopGroup[] = [
  { alias: 'editing', label: '#umbraDesktop_groupEditing', weight: 10 },
  { alias: 'structure', label: '#umbraDesktop_groupStructure', weight: 20 },
  { alias: 'templating', label: '#umbraDesktop_groupTemplating', weight: 30 },
  { alias: 'users-members', label: '#umbraDesktop_groupUsersMembers', weight: 40 },
  { alias: 'diagnostics', label: '#umbraDesktop_groupDiagnostics', weight: 50 },
  { alias: 'system', label: '#umbraDesktop_groupSystem', weight: 60 },
];
