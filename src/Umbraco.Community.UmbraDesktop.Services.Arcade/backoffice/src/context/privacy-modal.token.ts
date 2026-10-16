import { UmbModalToken } from '@umbraco-cms/backoffice/modal';

/**
 * Alias of the privacy question, shared by the token and the `modal` manifest that registers the
 * element, so the two cannot drift apart. A token whose alias matches no manifest opens nothing.
 */
export const UMBRADESKTOP_ARCADE_PRIVACY_MODAL_ALIAS = 'UmbraDesktop.Arcade.Modal.Privacy';

/** What the question is opened with. */
export interface ArcadePrivacyModalData {
  /** The player's current display name, to prefill. */
  displayName: string;
}

/** What it answers. */
export interface ArcadePrivacyModalValue {
  /** Whether to show their scores. */
  isPublic: boolean;
  /** The display name they settled on. */
  displayName: string;
}

/**
 * The one-time "show your scores?" question (design D7), as a small dialog. It is the fallback for a
 * game that shows no result card (design P3): a game that places the card asks everyone else there,
 * so this dialog only opens when no card is on screen to ask.
 *
 * It renders in the backoffice's own modal container, outside the desktop, so its element cannot
 * consume desktop contexts: it takes the name as data and answers with the value, and the Arcade
 * context saves it. Closing the dialog rejects the promise `umbOpenModal` returns; callers catch
 * that and treat it as "not answered".
 */
export const UMBRADESKTOP_ARCADE_PRIVACY_MODAL = new UmbModalToken<ArcadePrivacyModalData, ArcadePrivacyModalValue>(
  UMBRADESKTOP_ARCADE_PRIVACY_MODAL_ALIAS,
  { modal: { type: 'dialog' } },
);
