import type { ManifestApi, ManifestWithDynamicConditions, UmbApi } from '@umbraco-cms/backoffice/extension-api';

// `UmbExtensionConditionConfig` is a global Umbraco declares (app.extension.ts uses it the same way);
// it is not exported from `extension-registry`.

/**
 * A context a package provides at the desktop's level: created by the desktop element with itself as
 * host when the desktop connects, destroyed when it disconnects.
 *
 * The desktop's answer to `globalContext`, which Umbraco creates at the backoffice root and so runs in
 * the plain backoffice and inside every window's iframe too. A package service that belongs to the
 * desktop (the Arcade is the first) wants none of that. Modelled on Umbraco's own `workspaceContext`,
 * which a workspace creates with itself as host through `UmbExtensionsApiInitializer`; design D3 of
 * `docs/design/2026-10-01-arcade-design.md`.
 *
 * **Published API.** The type name and its behaviour are kept stable; like the other desktop types,
 * it only ever gains optional fields.
 */
export interface ManifestUmbraDesktopContext
  extends ManifestApi<UmbApi>,
    ManifestWithDynamicConditions<UmbExtensionConditionConfig> {
  /** Discriminates this manifest from every other extension type. */
  type: 'umbraDesktopContext';
}

declare global {
  /** Registers the type with Umbraco's manifest map, as `umbraDesktopApp` does. */
  interface UmbExtensionManifestMap {
    /** A package context living on the desktop element. */
    umbraDesktopContext: ManifestUmbraDesktopContext;
  }
}
