import type { UmbraDesktopGroup } from '../types';

/** Curated launcher groups — flat, decoupled from Umbraco sections. Labels are loc tokens. */
export const groups: UmbraDesktopGroup[] = [
  { alias: 'editing', label: '#umbraDesktop_groupEditing', weight: 10 },
  { alias: 'diagnostics', label: '#umbraDesktop_groupDiagnostics', weight: 20 },
];
