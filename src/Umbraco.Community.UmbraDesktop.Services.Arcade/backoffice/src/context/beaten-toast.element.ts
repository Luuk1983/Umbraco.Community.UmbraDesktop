import { css, customElement, html, nothing, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { ensureArcadeFont } from '../pieces/font.js';
import { arcadeLook, arcadeTheme } from '../pieces/look.js';
import { CROWN_PATH, icon } from '../pieces/parts.js';
import { say } from '../shared/phrases.js';
import { activeArcade, isRaising } from './active-arcade.js';

/** The tag core creates for the beaten toast. Internal: only the Arcade raises it. */
export const ARCADE_BEATEN_TOAST_ELEMENT = 'umbradesktop-arcade-beaten-toast';

/** What the toast carries. Plain data, because the desktop keeps a JSON copy to raise it again later. */
export interface ArcadeBeatenToastData {
  /** "Bram took first place from you on Snake"; also what the desktop's own toast shows. */
  headline: string;
  /** "510 beats your 480. You are 2nd now. Select to open the leaderboard." */
  message: string;
  /** The game's alias. */
  game: string;
  /** The board's alias. */
  board: string;
}

/** The part of uui's `uui-toast-notification` this reads. */
type UuiToast = HTMLElement & {
  /** True from the frame the toast starts opening until it starts closing; a close before that is lost. */
  isOpen?: boolean;
};

/** The part of core's notification handler this uses. */
interface ToastHandler {
  /** Close the toast. */
  close(): void;
  /** Core's toast element around this one. */
  element?: UuiToast;
}

/**
 * The beaten toast's own element (design P13, settled point 11). Two instances exist per click:
 *
 * - the Arcade's own, which the desktop hides and replaces with its own toast, drawn from `headline`
 *   and `message`, so it does nothing;
 * - the one the desktop raises again in this document when the player selects that toast or its
 *   entry in the notification list. That selection means "show me", so it asks the Arcade to show the
 *   board, hides itself at once so it never shows, and closes as soon as uui lets it (`#close`).
 *
 * If no Arcade answers (the desktop closed in between), it stays, drawn in the Arcade's look with a
 * link, so the message is still readable.
 */
@customElement(ARCADE_BEATEN_TOAST_ELEMENT)
export class UmbraDesktopArcadeBeatenToastElement extends UmbLitElement {
  /** Set by core's notification handler. */
  @property({ attribute: false })
  data?: ArcadeBeatenToastData;

  /** Set by core's notification handler. */
  @property({ attribute: false })
  notificationHandler?: ToastHandler;

  /** Whether the Arcade raised this one, read at construction, which core does inside `peek`. */
  readonly #original = isRaising();

  /** Loads the display font the toast's look uses, in case nothing else on the page has yet. */
  constructor() {
    super();
    ensureArcadeFont();
  }

  /** The re-raised instance acts on the player's click at once. */
  override connectedCallback(): void {
    super.connectedCallback();
    if (this.#original) return;
    if (this.#open()) this.#close();
  }

  /** @returns Whether the Arcade showed the board. */
  #open(): boolean {
    const data = this.data;
    return data ? (activeArcade()?.showBoard(data.game, data.board) ?? false) : false;
  }

  /**
   * Hide core's toast for good, then close it once uui can. Core builds the toast closed and this
   * element connects while it is still closed; the uui container opens it on the next slotchange, and
   * uui ignores a close until the toast is open (`_makeClose`), and a close before its opening frame
   * never fires `closed`, which is what takes the handler out of core's list. So a toast that is not
   * open yet is closed when it says `opened`. The inline style, because the `hidden` attribute loses
   * to uui's `:host { display: block }`.
   */
  #close(): void {
    const handler = this.notificationHandler;
    const toast = handler?.element;
    if (!handler || !toast) return handler?.close();
    toast.style.display = 'none';
    if (toast.isOpen) handler.close();
    else toast.addEventListener('opened', () => handler.close(), { once: true });
  }

  /** @returns The toast, for when it stays. */
  override render() {
    const data = this.data;
    if (!data) return nothing;
    return html`<div class="toast felt surface">
      <span class="ti">${icon(CROWN_PATH, 'crown')}</span>
      <div>
        <b>${data.headline}</b>
        <p>${data.message}</p>
        <button class="link" data-action="open" @click=${() => this.#open() && this.#close()}>
          ${say(this.localize, 'beatenOpenLink', 'Open the leaderboard')} ›
        </button>
      </div>
    </div>`;
  }

  /** The mock's toast. */
  static override styles = [
    arcadeTheme,
    arcadeLook,
    css`
      .toast { display: flex; gap: 12px; padding: 14px 16px; border-radius: var(--arcade-radius); max-width: 430px; }
      .ti { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; flex: none; background: color-mix(in srgb, var(--arcade-gold) 20%, transparent); }
      .ti .crown { width: 22px; height: 22px; }
      b { font-size: 14px; display: block; }
      p { margin: 2px 0 8px; font-size: 13px; color: var(--arcade-soft); }
      .link { font-size: 13px; }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-arcade-beaten-toast': UmbraDesktopArcadeBeatenToastElement;
  }
}
