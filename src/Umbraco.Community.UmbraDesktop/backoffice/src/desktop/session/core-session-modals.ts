import { UMB_MODAL_APP_AUTH, UMB_MODAL_AUTH_TIMEOUT } from '@umbraco-cms/backoffice/auth';
import type { UmbExtensionRegistry } from '@umbraco-cms/backoffice/extension-api';
import type { ManifestModal } from '@umbraco-cms/backoffice/modal';
import { UmbraDesktopSessionModalElement } from './session-modal.element.js';

/**
 * Takes over core's two session modals in every frame, so a session that ends is handled once, by
 * the desktop (issue #160, design §4).
 *
 * **What this leans on in core, at 17.6.** None of it is public API, so each is written down here,
 * where it is used, and pinned by `core-session-modals.test.ts`:
 *
 * - `UmbAuthSessionTimeoutController` opens its warning as the modal `Umb.Modal.AuthTimeout`, and
 *   `UmbAppAuthController` (in `umb-app`) opens its sign-in as `Umb.Modal.AppAuth`. The aliases are
 *   read from core's own tokens, so a rename breaks an import rather than the swap.
 * - A modal's element is looked up by alias every time it opens (`byTypeAndAlias` in
 *   `modal.element.js`). `overwrites` is honoured only by the extension initialisers, not there, so
 *   the only way in is to unregister core's manifest and register one under the same alias.
 *
 * If core ever stops registering either alias, nothing is registered in its place, and core's own
 * screens show, exactly as before this feature.
 */

/** The alias core opens its session warning under. */
export const UMBRADESKTOP_SESSION_WARNING_ALIAS = UMB_MODAL_AUTH_TIMEOUT.toString();

/** The alias core opens its sign-in screen under, on a time-out. */
export const UMBRADESKTOP_SESSION_SIGN_IN_ALIAS = UMB_MODAL_APP_AUTH.toString();

/** Both aliases, in one place for the loop that watches them. */
const ALIASES = [UMBRADESKTOP_SESSION_WARNING_ALIAS, UMBRADESKTOP_SESSION_SIGN_IN_ALIAS];

/**
 * Core's own manifests, by alias, kept when they are replaced so the replacement can hand back to
 * core's element wherever the desktop has no say: a plain backoffice, and the desktop's warning.
 * Module state, which means per frame: each window's frame runs its own copy of this bundle.
 */
const coreManifests = new Map<string, ManifestModal>();

/**
 * Core's own manifest for one of the two session modals, once it has been replaced.
 * @param alias The modal's alias.
 * @returns Core's manifest, or undefined if core never registered it.
 */
export function coreSessionModal(alias: string): ManifestModal | undefined {
  return coreManifests.get(alias);
}

/** Forget the kept manifests. For tests, which each build a registry of their own. */
export function forgetCoreSessionModals(): void {
  coreManifests.clear();
}

/**
 * Replace core's two session modals with the desktop's, now and whenever core registers them.
 *
 * Watched rather than done once, because the entry point cannot know whether core's manifests are
 * in yet: core registers them while `umb-app` boots, and the registry refuses a second manifest with
 * a taken alias. Watching also covers a core manifest registered again later, which would otherwise
 * quietly take its screens back.
 * @param registry The extension registry, the entry point's own.
 * @returns A function that stops watching. What has been replaced stays replaced.
 */
export function replaceCoreSessionModals(registry: UmbExtensionRegistry<UmbExtensionManifest>): () => void {
  const subscriptions = ALIASES.map((alias) =>
    registry.byTypeAndAlias('modal', alias).subscribe((manifest) => {
      const found = manifest as ManifestModal | undefined;
      // Ours, or nothing yet: nothing to do. Ours is told apart by its element, which nothing else
      // registers.
      if (!found || found.element === UmbraDesktopSessionModalElement) return;
      coreManifests.set(alias, found);
      registry.unregister(alias);
      registry.register({
        type: 'modal',
        alias,
        name: `UmbraDesktop Session Modal (${alias})`,
        element: UmbraDesktopSessionModalElement,
      } as UmbExtensionManifest);
    }),
  );
  return () => subscriptions.forEach((subscription) => subscription.unsubscribe());
}
