import { expect } from '@open-wc/testing';
import { UmbExtensionRegistry } from '@umbraco-cms/backoffice/extension-api';
import { UMB_MODAL_APP_AUTH, UMB_MODAL_AUTH_TIMEOUT } from '@umbraco-cms/backoffice/auth';
import {
  UMBRADESKTOP_SESSION_SIGN_IN_ALIAS,
  UMBRADESKTOP_SESSION_WARNING_ALIAS,
  coreSessionModal,
  forgetCoreSessionModals,
  replaceCoreSessionModals,
} from './core-session-modals.js';
import { UmbraDesktopSessionModalElement } from './session-modal.element.js';

/**
 * Core opens its session warning and its sign-in screen as modals looked up by alias, so the desktop
 * replaces them by unregistering core's manifest and registering its own under the same alias (issue
 * #160; `overwrites` is not honoured for modals). These cases pin the replacement against a real
 * extension registry, and the aliases against core's own tokens at the floor.
 */

/** A stand-in for the element core registers, so a test can tell core's manifest from ours. */
class CoreModalStandIn extends HTMLElement {}
customElements.define('test-core-session-modal', CoreModalStandIn);

/**
 * Core's manifest for one of the two modals, as `packages/core/auth/modals/manifests.js` writes it.
 * @param alias The modal's alias.
 * @returns The manifest.
 */
const coreManifest = (alias: string) => ({ type: 'modal', alias, name: `Core ${alias}`, element: CoreModalStandIn });

let stops: Array<() => void> = [];
afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
  forgetCoreSessionModals();
});

/**
 * The manifest a registry currently holds for an alias.
 * @param registry The registry.
 * @param alias The modal's alias.
 * @returns The manifest, or undefined.
 */
function current(registry: UmbExtensionRegistry<UmbExtensionManifest>, alias: string) {
  let found: { element?: unknown; name?: string } | undefined;
  registry
    .byTypeAndAlias('modal', alias)
    .subscribe((manifest) => (found = manifest as typeof found))
    .unsubscribe();
  return found;
}

it('uses the aliases core opens its two session modals under', () => {
  // Read from core's own tokens, so a rename in core breaks this rather than the swap.
  expect(UMBRADESKTOP_SESSION_WARNING_ALIAS).to.equal(UMB_MODAL_AUTH_TIMEOUT.toString());
  expect(UMBRADESKTOP_SESSION_SIGN_IN_ALIAS).to.equal(UMB_MODAL_APP_AUTH.toString());
  // And what they are at the floor (17.6), written out once so a change is visible in review.
  expect(UMBRADESKTOP_SESSION_WARNING_ALIAS).to.equal('Umb.Modal.AuthTimeout');
  expect(UMBRADESKTOP_SESSION_SIGN_IN_ALIAS).to.equal('Umb.Modal.AppAuth');
});

it('replaces both of core’s modals that are already registered, and keeps core’s', () => {
  const registry = new UmbExtensionRegistry<UmbExtensionManifest>();
  registry.register(coreManifest(UMBRADESKTOP_SESSION_WARNING_ALIAS) as UmbExtensionManifest);
  registry.register(coreManifest(UMBRADESKTOP_SESSION_SIGN_IN_ALIAS) as UmbExtensionManifest);

  stops.push(replaceCoreSessionModals(registry));

  for (const alias of [UMBRADESKTOP_SESSION_WARNING_ALIAS, UMBRADESKTOP_SESSION_SIGN_IN_ALIAS]) {
    expect(current(registry, alias)?.element, alias).to.equal(UmbraDesktopSessionModalElement);
    expect(coreSessionModal(alias)?.element, alias).to.equal(CoreModalStandIn);
  }
});

it('replaces core’s modals registered after it started watching', () => {
  const registry = new UmbExtensionRegistry<UmbExtensionManifest>();
  stops.push(replaceCoreSessionModals(registry));

  registry.register(coreManifest(UMBRADESKTOP_SESSION_SIGN_IN_ALIAS) as UmbExtensionManifest);

  expect(current(registry, UMBRADESKTOP_SESSION_SIGN_IN_ALIAS)?.element).to.equal(UmbraDesktopSessionModalElement);
  expect(coreSessionModal(UMBRADESKTOP_SESSION_SIGN_IN_ALIAS)?.element).to.equal(CoreModalStandIn);
});

it('registers nothing when core has registered nothing', () => {
  const registry = new UmbExtensionRegistry<UmbExtensionManifest>();
  stops.push(replaceCoreSessionModals(registry));

  // Nothing to hand back to, so nothing replaced: core's own screens, or none, as before.
  expect(current(registry, UMBRADESKTOP_SESSION_WARNING_ALIAS)).to.equal(undefined);
  expect(current(registry, UMBRADESKTOP_SESSION_SIGN_IN_ALIAS)).to.equal(undefined);
});

it('stops replacing once stopped', () => {
  const registry = new UmbExtensionRegistry<UmbExtensionManifest>();
  replaceCoreSessionModals(registry)();

  registry.register(coreManifest(UMBRADESKTOP_SESSION_WARNING_ALIAS) as UmbExtensionManifest);

  expect(current(registry, UMBRADESKTOP_SESSION_WARNING_ALIAS)?.element).to.equal(CoreModalStandIn);
});
