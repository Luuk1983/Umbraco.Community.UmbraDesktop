import type { UmbraDesktopGroup } from '../types';

/** Curated launcher groups — flat, decoupled from Umbraco sections. Labels are loc tokens. */
export const groups: UmbraDesktopGroup[] = [
  { alias: 'editing', label: '#umbraDesktop_groupEditing', weight: 10 },
  // Workflow's four tools, which would swamp Editing's three core apps if merged. Sits directly
  // after Editing because content approval is editorial work, not administration.
  { alias: 'workflow', label: '#umbraDesktop_groupWorkflow', weight: 12 },
  // Commerce and Engage. One business function rather than two product names bolted together, so
  // a future marketing package lands here without a rename.
  { alias: 'marketing-sales', label: '#umbraDesktop_groupMarketingSales', weight: 15 },
  { alias: 'development', label: '#umbraDesktop_groupDevelopment', weight: 20 },
  { alias: 'synchronisation', label: '#umbraDesktop_groupSynchronisation', weight: 25 },
  { alias: 'security', label: '#umbraDesktop_groupSecurity', weight: 30 },
  // Sits directly after Security: it holds one package's tools (Advanced Permissions), which
  // would swamp Security's two apps if merged, but belongs beside it rather than filed away.
  { alias: 'advanced-security', label: '#umbraDesktop_groupAdvancedSecurity', weight: 35 },
  { alias: 'diagnostics', label: '#umbraDesktop_groupDiagnostics', weight: 40 },
  // Umbraco AI. One tile today, but AI ships add-on packages (Agent, Prompt) that will earn their
  // own entries, and none of them is the administrative plumbing System holds.
  // Automate, beside AI rather than inside System for the same reason: both are capability
  // platforms that ship their own add-ons, and neither is the administrative plumbing System holds.
  { alias: 'automation', label: '#umbraDesktop_groupAutomation', weight: 43 },
  { alias: 'ai', label: '#umbraDesktop_groupAi', weight: 45 },
  { alias: 'system', label: '#umbraDesktop_groupSystem', weight: 50 },
];
