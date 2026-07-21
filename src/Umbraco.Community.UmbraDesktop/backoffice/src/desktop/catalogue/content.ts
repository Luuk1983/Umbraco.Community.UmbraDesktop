import type { UmbraDesktopCatalogueEntry } from '../types';

/** Content-area apps (Content + Media sections). */
export const entries: UmbraDesktopCatalogueEntry[] = [
  {
    alias: 'content',
    ref: 'Umb.Section.Content',
    name: 'Content',
    icon: 'icon-documents',
    chromeProfile: 'full-section',
    defaultSize: { w: 960, h: 680 },
    allowMultiple: true,
    categoryAlias: 'content',
    weight: 10,
  },
  {
    alias: 'media',
    ref: 'Umb.Section.Media',
    name: 'Media',
    icon: 'icon-picture',
    chromeProfile: 'full-section',
    defaultSize: { w: 960, h: 680 },
    allowMultiple: true,
    categoryAlias: 'media',
    weight: 10,
  },
];
