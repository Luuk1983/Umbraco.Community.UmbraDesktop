import { AREA } from './area.js';
import type { SaveOutcome } from './save-file.js';
import type { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_NOTIFICATION_CONTEXT } from '@umbraco-cms/backoffice/notification';

/**
 * Tell the person where a save went, with the backoffice's own notifications.
 *
 * Only a media library save is announced. A download announces itself in the browser's own download
 * bar, and a toast saying the same thing again would be noise; a media item, by contrast, lands
 * somewhere the person cannot see from the window they are in, so the toast is the only evidence it
 * happened, and for a refusal it is the only place the reason can go.
 *
 * Not awaited by callers, deliberately: the notification context exists only inside a booted
 * backoffice, and a save must not wait on a context that a test, or a broken backoffice, never
 * provides.
 * @param host The element that saved.
 * @param outcome How the save went.
 * @param name The file's name.
 */
export async function announceSave(host: UmbLitElement, outcome: SaveOutcome, name: string): Promise<void> {
  if (outcome.destination !== 'media') return;
  const notifications = await host.getContext(UMB_NOTIFICATION_CONTEXT).catch(() => undefined);
  if (!notifications) return;
  if (outcome.ok) {
    notifications.peek('positive', {
      data: { message: host.localize.termOrDefault(`${AREA}_savedToMedia`, `Saved to the media library as ${name}.`, name) },
    });
    return;
  }
  notifications.peek('danger', {
    data: {
      headline: host.localize.termOrDefault(`${AREA}_saveToMediaFailed`, 'Could not save to the media library'),
      message: outcome.message ?? '',
    },
  });
}
