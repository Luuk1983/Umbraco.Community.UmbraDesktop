/**
 * Edit image's aliases (#137), apart from the code they name, so the bundle's manifests can name the
 * conditions without importing them: a condition's `api` loader only splits it out of the bundle's
 * main chunk when nothing else imports its module.
 */

/** The on-desktop condition's alias. */
export const UMBRADESKTOP_ON_DESKTOP_CONDITION = 'Umbraco.Community.UmbraDesktop.Media.Condition.OnDesktop';

/** The is-image condition's alias. */
export const UMBRADESKTOP_IS_IMAGE_CONDITION = 'Umbraco.Community.UmbraDesktop.Media.Condition.IsImage';
