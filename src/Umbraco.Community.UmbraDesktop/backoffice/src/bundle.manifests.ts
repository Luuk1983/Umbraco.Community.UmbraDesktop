import { manifests as entrypoints } from './entrypoints/manifest';
import { manifests as dashboards } from './dashboards/manifest';
import { manifests as propertyeditors } from './propertyeditors/manifest';
import { manifests as desktop } from './desktop/manifest';
import { manifests as desktopSettings } from './desktop/settings/manifest';
import { manifests as headerApps } from './headerapps/manifest';
import { manifests as desktopLocalization } from './desktop/localization/manifest';
import { backofficePathFromBaseHref } from './desktop/boot/backoffice-path';
import { bootLanding } from './desktop/boot/landing';
import { hasBootAttempt, isBootSuppressed, readBootHint } from './desktop/boot/boot-storage';
import { shouldRaiseSplash } from './desktop/boot/boot-decision';
import { raiseBootSplash } from './desktop/boot/splash';
import { bootTrace } from './desktop/boot/trace';

// Raise the boot splash here, during this module's own evaluation, because this is the earliest
// moment the package owns: the bundle is imported by `UmbBundleExtensionInitializer` during the
// backoffice route guard, before `backoffice.element.js` is imported at all. Anything later — the
// entrypoint's onInit, the section element — is at least one module fetch behind the first paint of
// the classic header, which is one of the three things a fresh load into the desktop would
// otherwise flash. See `desktop/boot/splash.ts` for what the splash may and may not depend on.
// `bootLanding()` records the URL when it is first imported, which is here — the earliest code this
// package runs. Everything downstream reads that record rather than `location`, because core's
// router moves the URL off the root within a few hundred milliseconds and the entrypoint does not
// even exist yet at this point.
const splashInputs = {
  landingPathname: bootLanding().pathname,
  backofficePath: backofficePathFromBaseHref(document.baseURI),
  landingSearch: bootLanding().search,
  hint: readBootHint(),
  exited: isBootSuppressed(),
  markerPresent: hasBootAttempt(),
};

if (shouldRaiseSplash(splashInputs)) {
  raiseBootSplash();
  bootTrace('splash raised', splashInputs);
} else {
  // Worth a line of its own: no splash means either no boot is expected, or one was expected and
  // something suppressed it — a spent-looking marker from a boot that never finished, an exit
  // earlier in this tab, or the escape flag. Which of those is invisible without this.
  bootTrace('splash not raised', splashInputs);
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
