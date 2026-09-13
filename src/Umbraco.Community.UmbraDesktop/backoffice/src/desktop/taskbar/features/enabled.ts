import type { UmbraDesktopTaskbarFeature } from './types';

/**
 * Reading and writing the per-user on/off choices, as pure functions over the stored map.
 *
 * The map holds only the features a user has an opinion about. A feature absent from it takes its
 * own {@link UmbraDesktopTaskbarFeature.defaultEnabled}, which is the same arrangement
 * `UMBRADESKTOP_DEFAULT_PINNED` has: a default that applies until the user says otherwise, rather
 * than a value written into everybody's storage on first boot. That is what lets a feature added in
 * a later release arrive switched on for somebody whose payload predates it, instead of being
 * indistinguishable from one they had switched off.
 */

/**
 * Whether a feature is on for this user.
 * @param stored The user's stored choices, or undefined when nothing is stored.
 * @param feature The feature to answer for.
 * @returns True when the feature should be active.
 */
export function isFeatureEnabled(
  stored: Readonly<Record<string, boolean>> | undefined,
  feature: UmbraDesktopTaskbarFeature,
): boolean {
  const choice = stored?.[feature.id];
  return typeof choice === 'boolean' ? choice : feature.defaultEnabled;
}

/**
 * Record a user's choice about one feature.
 *
 * The value is written even when it matches the feature's default, deliberately: an absence means
 * "whatever the shell thinks", which is a different answer from "the user wants it on", and the two
 * only stay distinguishable if switching something on leaves a mark.
 * @param stored The user's current choices.
 * @param id The feature id to set.
 * @param enabled Whether the feature should be on.
 * @returns A new map; the input is left untouched.
 */
export function withFeatureEnabled(
  stored: Readonly<Record<string, boolean>>,
  id: string,
  enabled: boolean,
): Record<string, boolean> {
  return { ...stored, [id]: enabled };
}
