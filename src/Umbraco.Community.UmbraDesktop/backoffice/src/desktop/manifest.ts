import { UMBRADESKTOP_SECTION_ALIAS, UMBRADESKTOP_SECTION_PATHNAME } from './constants';

export const manifests: Array<UmbExtensionManifest> = [
  {
    type: 'section',
    alias: UMBRADESKTOP_SECTION_ALIAS,
    name: 'UmbraDesktop Section',
    weight: 5, // low weight = appears toward the end of the section list
    meta: {
      label: 'Desktop',
      pathname: UMBRADESKTOP_SECTION_PATHNAME,
    },
    element: () => import('./components/desktop.element.js'),
  },
];
