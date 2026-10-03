import { css, customElement, html, nothing, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbConfirmModal } from '@umbraco-cms/backoffice/modal';
import type { ArcadeProfile } from '../api/arcade-api.js';
import { UMBRADESKTOP_ARCADE_CONTEXT } from '../context/arcade.context-token.js';
import type { UmbraDesktopArcadeContext } from '../context/arcade.context.js';
import { AREA } from '../shared/area.js';

/**
 * The player's own settings: display name, showing scores, notifications, and deleting them (D6, D7).
 * Settings are grouped in boxes and nothing is hidden.
 */
@customElement('umbradesktop-arcade-profile')
export class UmbraDesktopArcadeProfileElement extends UmbLitElement {
  /** The settings as last read. */
  @state()
  private _profile?: ArcadeProfile;

  /** The name as typed, before saving; undefined while it is untouched. */
  @state()
  private _name?: string;

  /** What the last failed change said, shown until the next attempt; undefined when none failed. */
  @state()
  private _error?: string;

  /** The Arcade. */
  #arcade?: UmbraDesktopArcadeContext;

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_ARCADE_CONTEXT, (arcade) => {
      this.#arcade = arcade;
      if (!arcade) return;
      this.observe(arcade.profile, (profile) => {
        this._profile = profile;
        this._name = undefined;
      });
      void arcade.refreshProfile();
    });
  }

  /** The typed name without surrounding whitespace; what is saved, and what decides whether saving is allowed. */
  get #trimmed(): string {
    return (this._name ?? '').trim();
  }

  /**
   * Run a profile call and say so when it fails, instead of leaving the control looking saved.
   * @param call The call; resolves true when the server accepted it.
   * @param failure The sentence for a failure.
   */
  async #run(call: () => Promise<boolean> | undefined, failure: string): Promise<void> {
    this._error = undefined;
    if (!(await call())) this._error = failure;
  }

  /** The words for a change that did not save. @returns The sentence. */
  get #saveFailed(): string {
    return this.localize.termOrDefault(`${AREA}_saveFailed`, 'Your changes could not be saved.');
  }

  /** Save the trimmed name; a blank one is never sent. */
  async #saveName(): Promise<void> {
    if (this._name === undefined || !this.#trimmed) return;
    await this.#run(() => this.#arcade?.updateProfile({ displayName: this.#trimmed }), this.#saveFailed);
  }

  /** Delete everything after confirming. */
  async #delete(): Promise<void> {
    const ok = await umbConfirmModal(this, {
      headline: this.localize.termOrDefault(`${AREA}_deleteHeadline`, 'Delete your scores?'),
      content: this.localize.termOrDefault(`${AREA}_deleteText`, 'Your scores and Arcade settings are removed from every board. This cannot be undone.'),
      color: 'danger',
      confirmLabel: this.localize.termOrDefault(`${AREA}_delete`, 'Delete'),
    }).then(
      () => true,
      () => false,
    );
    if (ok) {
      await this.#run(
        () => this.#arcade?.deleteMyScores(),
        this.localize.termOrDefault(`${AREA}_deleteFailed`, 'Your scores could not be deleted.'),
      );
    }
  }

  /** @returns The settings. */
  override render() {
    const t = (key: string, fallback: string) => this.localize.termOrDefault(`${AREA}_${key}`, fallback);
    const profile = this._profile;
    if (!profile) return html`<uui-loader-bar></uui-loader-bar>`;
    return html`
      ${this._error ? html`<p class="error" role="alert">${this._error}</p>` : nothing}
      <uui-box headline=${t('displayName', 'Display name')}>
        <div class="row">
          <uui-input .value=${this._name ?? profile.displayName} maxlength="32" label=${t('displayName', 'Display name')} @input=${(e: Event) => (this._name = (e.target as HTMLInputElement).value)}></uui-input>
          <uui-button look="primary" data-action="save-name" label=${t('save', 'Save')} ?disabled=${this._name === undefined || !this.#trimmed} @click=${this.#saveName}></uui-button>
        </div>
      </uui-box>
      <uui-box headline=${t('privacy', 'Privacy')}>
        <uui-toggle data-setting="public" .checked=${profile.isPublic} label=${t('showScores', 'Show my scores on the leaderboards')} @change=${() => this.#run(() => this.#arcade?.updateProfile({ isPublic: !profile.isPublic }), this.#saveFailed)}></uui-toggle>
        <uui-toggle data-setting="notify" .checked=${profile.notifyWhenBeaten} label=${t('notifyBeaten', 'Tell me when somebody takes first place from me')} @change=${() => this.#run(() => this.#arcade?.updateProfile({ notifyWhenBeaten: !profile.notifyWhenBeaten }), this.#saveFailed)}></uui-toggle>
      </uui-box>
      <uui-box headline=${t('yourData', 'Your scores')}>
        <uui-button look="secondary" color="danger" data-action="delete" label=${t('deleteMyScores', 'Delete my scores')} @click=${this.#delete}></uui-button>
      </uui-box>`;
  }

  /** Spacing; the boxes and controls are Umbraco's. */
  static override styles = css`
    :host { display: grid; gap: var(--uui-size-space-4); color: var(--umbradesktop-app-text, var(--uui-color-text)); font-family: var(--umbradesktop-app-font, inherit); }
    .row { display: flex; gap: var(--uui-size-space-3); }
    uui-input { flex: 1; }
    .error { margin: 0; color: var(--uui-color-danger); }
    uui-toggle { display: block; margin-block: var(--uui-size-space-2); }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-arcade-profile': UmbraDesktopArcadeProfileElement;
  }
}
