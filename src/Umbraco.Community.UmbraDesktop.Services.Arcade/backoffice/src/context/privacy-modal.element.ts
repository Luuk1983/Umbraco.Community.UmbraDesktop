import { css, customElement, html, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbModalBaseElement } from '@umbraco-cms/backoffice/modal';
import type { ArcadePrivacyModalData, ArcadePrivacyModalValue } from './privacy-modal.token.js';
import { AREA } from '../shared/area.js';

/**
 * Asks once, at a player's first score, whether to show their scores on the leaderboards, with
 * their display name ready to change (D7). Either button is an answer; closing the dialog is not,
 * so the question comes back with the next score.
 */
@customElement('umbradesktop-arcade-privacy-modal')
export class UmbraDesktopArcadePrivacyModalElement extends UmbModalBaseElement<
  ArcadePrivacyModalData,
  ArcadePrivacyModalValue
> {
  /** The name as typed so far; undefined until the player touches the box. */
  @state()
  private _name?: string;

  /**
   * The name to send: as typed, or as it came in.
   *
   * A name cleared to nothing (or to spaces) falls back to the one it came in with, because a
   * display name is never empty (D7) and the server would otherwise have to guess.
   */
  get #name(): string {
    const typed = this._name?.trim();
    return typed ? typed : (this.data?.displayName ?? '');
  }

  /**
   * Close with an answer.
   *
   * The value is set first and the modal submitted second: `UmbModalBaseElement._submitModal` only
   * resolves the opener's promise with whatever the modal context holds at that moment.
   * @param isPublic Show or hide.
   */
  #answer(isPublic: boolean): void {
    this.value = { isPublic, displayName: this.#name };
    this._submitModal();
  }

  /** @returns The dialog. */
  override render() {
    const t = (key: string, fallback: string) => this.localize.termOrDefault(`${AREA}_${key}`, fallback);
    return html`<uui-dialog-layout headline=${t('privacyHeadline', 'Show your scores on the Arcade?')}>
      <p>
        ${t(
          'privacyText',
          'Your best scores can appear on the Arcade leaderboards for everyone who uses the desktop. You can change this later in the Arcade.',
        )}
      </p>
      <uui-label for="name">${t('displayName', 'Display name')}</uui-label>
      <uui-input
        id="name"
        label=${t('displayName', 'Display name')}
        .value=${this._name ?? this.data?.displayName ?? ''}
        maxlength="32"
        @input=${(e: Event) => (this._name = (e.target as HTMLInputElement).value)}></uui-input>
      <uui-button
        slot="actions"
        data-answer="private"
        look="secondary"
        label=${t('keepPrivate', 'Keep them private')}
        @click=${() => this.#answer(false)}></uui-button>
      <uui-button
        slot="actions"
        data-answer="public"
        look="primary"
        color="positive"
        label=${t('showThem', 'Show them')}
        @click=${() => this.#answer(true)}></uui-button>
    </uui-dialog-layout>`;
  }

  /** Spacing only; the dialog is Umbraco's. */
  static override styles = css`
    uui-input {
      width: 100%;
    }
    p {
      max-width: 40ch;
    }
  `;
}

export { UmbraDesktopArcadePrivacyModalElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-arcade-privacy-modal': UmbraDesktopArcadePrivacyModalElement;
  }
}
