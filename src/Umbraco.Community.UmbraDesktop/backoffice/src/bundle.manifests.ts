import { manifests as entrypoints } from './entrypoints/manifest';
import { manifests as dashboards } from './dashboards/manifest';
import { manifests as propertyeditors } from './propertyeditors/manifest';
import { manifests as desktop } from './desktop/manifest';
import { manifests as desktopSettings } from './desktop/settings/manifest';
import { manifests as headerApps } from './headerapps/manifest';
import { manifests as desktopLocalization } from './desktop/localization/manifest';

// Job of the bundle is to collate all the manifests from different parts of the extension and load other manifests
// We load this bundle from umbraco-package.json
export const manifests: Array<UmbExtensionManifest> = [
  ...entrypoints,
  ...dashboards,
  ...propertyeditors,
  ...desktop,
  ...desktopSettings,
  ...headerApps,
  ...desktopLocalization,
];
