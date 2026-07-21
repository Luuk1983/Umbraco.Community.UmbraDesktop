import type { UmbraDesktopCategory, UmbraDesktopGroup } from '../types';

/** Curated launcher headers. Free-form and decoupled from Umbraco sections. */
export const categories: UmbraDesktopCategory[] = [
  { alias: 'content', label: 'Content', weight: 10, icon: 'icon-documents' },
  { alias: 'media', label: 'Media', weight: 20, icon: 'icon-picture' },
  { alias: 'settings', label: 'Settings', weight: 30, icon: 'icon-settings' },
];

/** Curated collapsible sub-groups. */
export const groups: UmbraDesktopGroup[] = [
  { alias: 'diagnostics', label: 'Diagnostics', categoryAlias: 'settings', weight: 10 },
];
