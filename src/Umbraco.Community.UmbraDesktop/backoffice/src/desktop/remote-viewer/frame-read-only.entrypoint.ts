import { enforceReadOnlyInterface, isRemoteViewerFrame } from './frame-read-only';
import type { UmbEntryPointOnInit, UmbEntryPointOnUnload } from '@umbraco-cms/backoffice/extension-api';

/**
 * Runs in every backoffice this package loads into, and does something only in a remote viewer
 * frame. The frame is the local backoffice, so this package's bundle is loaded inside it like
 * anywhere else, which is what lets the frame lock itself from the inside.
 * @param _host The entrypoint's host.
 * @param registry The frame's extension registry.
 */
export const onInit: UmbEntryPointOnInit = (_host, registry) => {
  if (isRemoteViewerFrame(window)) stopEnforcing = enforceReadOnlyInterface(registry);
};

/** Stops watching the registry, if this frame started to. */
let stopEnforcing: (() => void) | undefined;

/**
 * Stops watching the registry when the package is unloaded.
 * @param _host The entrypoint's host.
 * @param _registry The frame's extension registry.
 */
export const onUnload: UmbEntryPointOnUnload = (_host, _registry) => {
  stopEnforcing?.();
  stopEnforcing = undefined;
};
