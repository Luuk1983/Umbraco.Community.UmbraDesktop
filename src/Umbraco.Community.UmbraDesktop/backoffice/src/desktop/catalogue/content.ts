import type { UmbraDesktopCatalogueEntry } from '../types';

/** Content-area apps (Content, Media + Translation sections) — editor-facing. */
export const entries: UmbraDesktopCatalogueEntry[] = [
  {
    alias: 'content',
    ref: 'Umb.Section.Content',
    name: '#umbraDesktop_appContentEditor',
    icon: 'icon-documents',
    chromeProfile: 'full-section',
    defaultSize: { w: 960, h: 680 },
    allowMultiple: true,
    group: 'editing',
    weight: 10,
  },
  {
    alias: 'media',
    ref: 'Umb.Section.Media',
    name: '#umbraDesktop_appMediaLibrary',
    icon: 'icon-picture',
    chromeProfile: 'full-section',
    defaultSize: { w: 960, h: 680 },
    allowMultiple: true,
    group: 'editing',
    weight: 20,
  },
  {
    alias: 'translation',
    ref: 'Umb.Section.Translation',
    name: '#umbraDesktop_appTranslation',
    // Icon inherited from the Translation section manifest.
    chromeProfile: 'full-section',
    defaultSize: { w: 960, h: 680 },
    group: 'editing',
    weight: 30,
  },
];
