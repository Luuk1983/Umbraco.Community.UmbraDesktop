import type { UmbraDesktopApp } from './types';

/**
 * Phase 1 catalogue: a single hard-coded app that proves the iframe + chrome
 * strip end-to-end. Replaced by the desktopApp extension type + auto-derivation
 * in Phase 2/3.
 */
export const UMBRADESKTOP_APPS: UmbraDesktopApp[] = [
  {
    alias: 'content',
    name: 'Content',
    icon: 'icon-documents',
    url: '/umbraco/section/content',
    chromeProfile: 'full-section',
    defaultSize: { w: 900, h: 640 },
  },
];
