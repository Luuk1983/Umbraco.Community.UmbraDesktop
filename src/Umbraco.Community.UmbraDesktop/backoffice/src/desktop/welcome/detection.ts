import type { UmbraDesktopSettingsLoad } from '../settings/settings-persistence';

/**
 * Whether a load belongs to somebody who has never used the desktop, and so gets the welcome wizard.
 *
 * The table in the design doc, §5, as one expression. Both halves have to hold:
 *
 * - **The account answered, with nothing.** An unreachable account is left alone even though it may
 *   well be a new user, because the wizard is marked finished by the settings record it writes, and
 *   an account that cannot be read cannot be written either. It would come back on every load.
 * - **This browser has nothing.** A cache without an account record is an existing user from before
 *   settings moved to the account, and migration `0001` is about to carry their desktop up. Showing
 *   them a wizard would ask them to choose a theme they already chose.
 *
 * There is no "finished" flag behind this. The record existing is the mark, which is also why
 * somebody who has never changed a single setting sees the wizard once: accepted in the design doc.
 * @param load What loading the settings produced.
 * @returns True when the wizard should show.
 */
export function isNewcomer(load: Pick<UmbraDesktopSettingsLoad, 'account' | 'source'>): boolean {
  return load.account === 'empty' && load.source === 'defaults';
}
