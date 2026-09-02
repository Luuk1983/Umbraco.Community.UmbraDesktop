import type { UmbraDesktopGroup } from '../types';

/** Curated launcher groups — flat, decoupled from Umbraco sections. Labels are loc tokens. */
export const groups: UmbraDesktopGroup[] = [
  { alias: 'editing', label: '#umbraDesktop_groupEditing', weight: 10 },
  { alias: 'development', label: '#umbraDesktop_groupDevelopment', weight: 20 },
  { alias: 'synchronisation', label: '#umbraDesktop_groupSynchronisation', weight: 25 },
  { alias: 'security', label: '#umbraDesktop_groupSecurity', weight: 30 },
  // Sits directly after Security: it holds one package's tools (Advanced Permissions), which
  // would swamp Security's two apps if merged, but belongs beside it rather than filed away.
  { alias: 'advanced-security', label: '#umbraDesktop_groupAdvancedSecurity', weight: 35 },
  { alias: 'diagnostics', label: '#umbraDesktop_groupDiagnostics', weight: 40 },
  { alias: 'system', label: '#umbraDesktop_groupSystem', weight: 50 },
];
