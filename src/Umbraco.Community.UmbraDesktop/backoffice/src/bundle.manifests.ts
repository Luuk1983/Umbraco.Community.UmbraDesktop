import { manifests as entrypoints } from './entrypoints/manifest';
import { manifests as dashboards } from './dashboards/manifest';
import { manifests as propertyeditors } from './propertyeditors/manifest';
import { manifests as desktop } from './desktop/manifest';
import { manifests as desktopSettings } from './desktop/settings/manifest';
import { manifests as headerApps } from './headerapps/manifest';
import { manifests as desktopLocalization } from './desktop/localization/manifest';
import { backofficePathFromBaseHref } from './desktop/boot/backoffice-path';
import { hasBootAttempt, isBootSuppressed, readBootHint } from './desktop/boot/boot-storage';
import { shouldRaiseSplash } from './desktop/boot/boot-decision';
import { raiseBootSplash } from './desktop/boot/splash';

// Raise the boot splash here, during this module's own evaluation, because this is the earliest
// moment the package owns: the bundle is imported by `UmbBundleExtensionInitializer` during the
// backoffice route guard, before `backoffice.element.js` is imported at all. Anything later — the
// entrypoint's onInit, the section element — is at least one module fetch behind the first paint of
// the classic header, which is one of the three things a fresh load into the desktop would
// otherwise flash. See `desktop/boot/splash.ts` for what the splash may and may not depend on.
if (
  shouldRaiseSplash({
    pathname: window.location.pathname,
    backofficePath: backofficePathFromBaseHref(document.baseURI),
    search: window.location.search,
    hint: readBootHint(),
    exited: isBootSuppressed(),
    markerPresent: hasBootAttempt(),
  })
) {
  raiseBootSplash();
}

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
