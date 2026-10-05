import { css, customElement, html, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbModalBaseElement } from '@umbraco-cms/backoffice/modal';
import type { ArcadePrivacyModalData, ArcadePrivacyModalValue } from './privacy-modal.token.js';
import { ARCADE_NAME_MAX_LENGTH } from '../shared/display-name.js';
import { say } from '../shared/phrases.js';

/**
 * The fallback question: asks once, at a player's first score, whether to show their scores on the
 * leaderboards, with their display name ready to change (D7). It is only for a game that shows no
 * result card (design P3); a game that places the card asks everyone else there, in the same words.
 * It says in one sentence what the Arcade is, and its two answers are equal and neutral (P9), each
 * saying its consequence. Either button is an answer; closing the dialog is not, so the question
 * comes back with the next score.
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
    const l = this.localize;
    const answerShow = say(l, 'answerShow', 'Yes, show my scores');
    const answerHide = say(l, 'answerHide', 'No, only I see them');
    return html`<uui-dialog-layout headline=${say(l, 'fallbackHeadline', 'Show your scores on the Arcade leaderboard?')}>
      <p>
        ${say(
          l,
          'fallbackText',
          "The Arcade keeps everyone's best scores in the desktop's games and ranks them on leaderboards. Show yours there, where colleagues can see them? You can change this in the Arcade at any time.",
        )}
      </p>
      <uui-label for="name">${say(l, 'leaderboardName', 'Your name on the leaderboards')}</uui-label>
      <uui-input
        id="name"
        label=${say(l, 'leaderboardName', 'Your name on the leaderboards')}
        .value=${this._name ?? this.data?.displayName ?? ''}
        maxlength=${ARCADE_NAME_MAX_LENGTH}
        @input=${(e: Event) => (this._name = (e.target as HTMLInputElement).value)}></uui-input>
      <uui-button
        slot="actions"
        data-answer="hide"
        look="outline"
        label=${answerHide}
        @click=${() => this.#answer(false)}></uui-button>
      <uui-button
        slot="actions"
        data-answer="show"
        look="outline"
        label=${answerShow}
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
