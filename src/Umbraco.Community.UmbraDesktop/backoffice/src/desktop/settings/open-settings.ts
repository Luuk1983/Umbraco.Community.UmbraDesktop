import { UMBRADESKTOP_SETTINGS_MODAL } from './modal-tokens.js';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';

/**
 * Open Desktop settings, optionally at a category or a package.
 *
 * The one way code opens the panel at a place, so that when settings becomes a window (design D7)
 * this is the function that changes and its callers do not. The taskbar's own cog keeps its own
 * route, because it also has to close the launcher it was clicked in.
 *
 * The panel rejects when it closes (it has no value to return), which is not an error here.
 * @param host The element or controller to open it from. Its contexts are the ones the panel sees.
 * @param category One of the desktop's category ids, or a package name.
 * @returns When the panel has closed.
 */
export async function openDesktopSettings(host: UmbControllerHost, category?: string): Promise<void> {
  await umbOpenModal(host, UMBRADESKTOP_SETTINGS_MODAL, { data: { category } }).catch(() => undefined);
}
