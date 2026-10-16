import { css, customElement, html, nothing, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbConfirmModal } from '@umbraco-cms/backoffice/modal';
import type { ArcadeProfile } from '../api/arcade-api.js';
import { UMBRADESKTOP_ARCADE_CONTEXT } from '../context/arcade.context-token.js';
import type { UmbraDesktopArcadeContext } from '../context/arcade.context.js';
import { arcadeLook, arcadeTheme } from '../pieces/look.js';
import { ArcadeThemeController } from '../pieces/theme.controller.js';
import { ARCADE_NAME_MAX_LENGTH } from '../shared/display-name.js';
import { say } from '../shared/phrases.js';

/**
 * The player's own settings, behind their name in the hub's top bar (design P11): the name on the
 * leaderboards, showing their scores, being told when someone takes first place, and deleting it
 * all. Each says what happens rather than what it is called (P8). Grouped in boxes; nothing is hidden.
 *
 * The switches are native checkboxes with `role="switch"`, drawn in the Arcade's look rather than as
 * `uui-toggle`, which is made for Umbraco's light surfaces and sits wrongly on the felt. Under
 * Windows 98 they are the system checkbox again: restyled, never removed.
 */
@customElement('umbradesktop-arcade-profile')
export class UmbraDesktopArcadeProfileElement extends UmbLitElement {
  /** The settings as last read. */
  @state()
  private _profile?: ArcadeProfile;

  /** The name as typed, before saving; undefined while untouched. */
  @state()
  private _name?: string;

  /** What the last failed change said, until the next attempt. */
  @state()
  private _error?: string;

  /** The Arcade. */
  #arcade?: UmbraDesktopArcadeContext;

  /** Stamps the theme, and finds the Arcade and reads the settings through it. */
  constructor() {
    super();
    // Inside the hub, but its own shadow root: the hub's theme stamp does not reach `:host` here.
    new ArcadeThemeController(this);
    this.consumeContext(UMBRADESKTOP_ARCADE_CONTEXT, (arcade) => {
      this.#arcade = arcade;
      if (!arcade) return;
      // Only the settings: a typed, unsaved name is the player's until they save it, and the profile
      // emits for every switch, which would otherwise throw the draft away.
      this.observe(arcade.profile, (profile) => (this._profile = profile), '_profile');
      void arcade.refreshProfile();
    });
  }

  /** @returns The typed name without surrounding whitespace: what is saved, and what decides whether saving is allowed. */
  get #trimmed(): string {
    return (this._name ?? '').trim();
  }

  /**
   * Run a call and say so when it fails, rather than leaving a control looking saved.
   * @param call Resolves true when the server accepted it.
   * @param failure The sentence for a failure.
   * @returns Whether it saved, so a switch can put itself back when it did not.
   */
  async #run(call: () => Promise<boolean> | undefined, failure: string): Promise<boolean> {
    this._error = undefined;
    const saved = !!(await call());
    if (!saved) this._error = failure;
    return saved;
  }

  /** @returns The words for a change that did not save. */
  get #saveFailed(): string {
    return say(this.localize, 'saveFailed', 'Your changes could not be saved.');
  }

  /**
   * Save a switch's new position, and put it back when that fails. Needed because the native box has
   * already moved by the time `change` fires, and on a failure the profile does not change, so Lit
   * sees the same value as before and would leave the box showing a setting that was never saved.
   * @param event The switch's `change`.
   * @param save Saves the new position; resolves true when the server accepted it.
   */
  async #toggle(event: Event, save: (on: boolean) => Promise<boolean> | undefined): Promise<void> {
    const box = event.target as HTMLInputElement;
    const on = box.checked;
    if (!(await this.#run(() => save(on), this.#saveFailed))) box.checked = !on;
  }

  /**
   * Save the trimmed name; a blank one is never sent. The draft goes once it is saved, so the field
   * shows the saved name and Save disables again; not on the profile's emission, which never comes
   * for a name equal to the one already saved and would leave Save enabled for good. A failed save
   * keeps the draft, for another try.
   */
  async #saveName(): Promise<void> {
    if (this._name === undefined || !this.#trimmed) return;
    if (await this.#run(() => this.#arcade?.updateProfile({ displayName: this.#trimmed }), this.#saveFailed)) this._name = undefined;
  }

  /** Delete everything after confirming. */
  async #delete(): Promise<void> {
    const l = this.localize;
    const ok = await umbConfirmModal(this, {
      headline: say(l, 'deleteHeadline', 'Delete your scores?'),
      content: say(l, 'deleteText', 'Your scores and Arcade settings are removed from every board. This cannot be undone.'),
      color: 'danger',
      confirmLabel: say(l, 'delete', 'Delete'),
    }).then(
      () => true,
      () => false,
    );
    if (ok) await this.#run(() => this.#arcade?.deleteMyScores(), say(l, 'deleteFailed', 'Your scores could not be deleted.'));
  }

  /** @returns The settings. */
  override render() {
    const l = this.localize;
    const profile = this._profile;
    if (!profile) return html`<uui-loader-bar></uui-loader-bar>`;
    const nameLabel = say(l, 'leaderboardName', 'Your name on the leaderboards');
    return html`<div class="prof">
      ${this._error ? html`<p class="error" role="alert">${this._error}</p>` : nothing}
      <section class="box glass">
        <h2 class="display">${nameLabel}</h2>
        <p>${say(l, 'leaderboardNameHelp', 'What colleagues see next to your scores. It starts as your Umbraco name.')}</p>
        <div class="field">
          <input id="name" class="input" maxlength=${ARCADE_NAME_MAX_LENGTH} aria-label=${nameLabel} .value=${this._name ?? profile.displayName}
            @input=${(e: Event) => (this._name = (e.target as HTMLInputElement).value)} />
          <button class="btn" data-action="save-name" ?disabled=${this._name === undefined || !this.#trimmed} @click=${() => this.#saveName()}>${say(l, 'save', 'Save')}</button>
        </div>
      </section>
      <section class="box glass">
        <label class="tog">
          <span><b>${say(l, 'showScores', 'Show my scores on the leaderboards')}</b><span>${say(l, 'showScoresHelp', "Off: colleagues don't see them; you still see your own rank.")}</span></span>
          <input type="checkbox" role="switch" class="sw" data-setting="show" .checked=${profile.isPublic}
            @change=${(e: Event) => this.#toggle(e, (on) => this.#arcade?.setScoresShown(on))} />
        </label>
        <label class="tog">
          <span><b>${say(l, 'notifyBeaten', 'Tell me when someone takes first place from me')}</b><span>${say(l, 'notifyBeatenHelp', 'Shown the next time you open the desktop.')}</span></span>
          <input type="checkbox" role="switch" class="sw" data-setting="notify" .checked=${profile.notifyWhenBeaten}
            @change=${(e: Event) => this.#toggle(e, (on) => this.#arcade?.updateProfile({ notifyWhenBeaten: on }))} />
        </label>
      </section>
      <section class="box glass">
        <h2 class="display">${say(l, 'deleteMyScores', 'Delete my scores')}</h2>
        <p>${say(l, 'deleteHelp', 'Removes every score and your name from the Arcade. This cannot be undone.')}</p>
        <div class="field"><button class="btn danger" data-action="delete" @click=${() => this.#delete()}>${say(l, 'deleteMyScores', 'Delete my scores')}…</button></div>
      </section>
    </div>`;
  }

  /** The mock's profile (section 3). */
  static override styles = [
    arcadeTheme,
    arcadeLook,
    css`
      :host { display: block; }
      .prof { max-width: 560px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }
      .box { padding: 16px 18px; }
      .box h2 { margin: 0 0 3px; font-weight: 600; font-size: 17px; }
      .box p { margin: 0; font-size: 13px; color: var(--arcade-soft); }
      .field { display: flex; gap: 10px; margin-top: 12px; }
      .input { flex: 1; border: 0; border-radius: 10px; padding: 9px 12px; font: inherit; font-size: 14px; color: var(--arcade-text); background: rgb(0 0 0 / 25%); box-shadow: var(--arcade-edge); }
      .input:focus-visible { outline: 2px solid var(--arcade-accent); outline-offset: 2px; }
      .tog { display: flex; align-items: center; gap: 14px; padding: 11px 0; border-top: 1px solid var(--arcade-ring); cursor: pointer; }
      .tog:first-child { border-top: 0; padding-top: 2px; }
      .tog > span { flex: 1; }
      .tog b { display: block; font-weight: 600; font-size: 14px; }
      .tog span span { font-size: 12px; color: var(--arcade-soft); }
      .sw { appearance: none; margin: 0; width: 42px; height: 24px; border-radius: 999px; background: rgb(255 255 255 / 18%); position: relative; flex: none; cursor: pointer; }
      .sw::after { content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgb(0 0 0 / 40%); transition: left 120ms; }
      .sw:checked { background: linear-gradient(90deg, var(--arcade-accent-deep), var(--arcade-accent)); }
      .sw:checked::after { left: 21px; }
      .sw:focus-visible { outline: 2px solid var(--arcade-accent); outline-offset: 2px; }
      :host([data-umbradesktop-theme='win98']) .sw { appearance: auto; width: auto; height: auto; background: none; }
      :host([data-umbradesktop-theme='win98']) .sw::after { display: none; }
      :host([data-umbradesktop-theme='win98']) .input { border-radius: 0; background: #fff; color: #000; }
      .error { color: var(--arcade-danger); margin: 0; }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-arcade-profile': UmbraDesktopArcadeProfileElement;
  }
}
