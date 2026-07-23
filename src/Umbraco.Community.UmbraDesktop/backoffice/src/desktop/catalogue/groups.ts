import type { UmbraDesktopGroup } from '../types';

/** Curated launcher groups — flat, decoupled from Umbraco sections. Labels are loc tokens. */
export const groups: UmbraDesktopGroup[] = [
  { alias: 'editing', label: '#umbraDesktop_groupEditing', weight: 10 },
  { alias: 'development', label: '#umbraDesktop_groupDevelopment', weight: 20 },
  { alias: 'users-members', label: '#umbraDesktop_groupUsersMembers', weight: 30 },
  { alias: 'diagnostics', label: '#umbraDesktop_groupDiagnostics', weight: 40 },
  { alias: 'system', label: '#umbraDesktop_groupSystem', weight: 50 },
];
