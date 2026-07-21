import type { UmbraDesktopAppCatalogueContext } from './app-catalogue.context';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';

/** Context token for the desktop app catalogue. */
export const UMBRADESKTOP_APP_CATALOGUE_CONTEXT =
  new UmbContextToken<UmbraDesktopAppCatalogueContext>('UmbraDesktopAppCatalogueContext');
