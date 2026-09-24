import './screensaver.element.js';
import {
  SCREENSAVER_BEZEL_PX,
  SCREENSAVER_HINT_PX,
  SCREENSAVER_PADDING_PX,
  SCREENSAVER_ROW_PX,
  SCREENSAVER_STAND_PX,
  SCREENSAVER_WINDOW,
} from './constants.js';
import { AREA } from '../shared/area.js';
import { accessoryStyles } from '../shared/styles.js';
import { UmbraDesktopAccessoriesSettingsController } from '../settings/settings.source.js';
import type { AccessoriesSettingsSource } from '../settings/settings.source.js';
import {
  UMBRADESKTOP_SCREENSAVER_WAIT_CHOICES,
  UMBRADESKTOP_SCREENSAVERS,
} from '../settings/settings.js';
import type { AccessoriesScreensaverId, AccessoriesScreensaverSettings } from '../settings/settings.js';
import { css, customElement, html, property, state, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/** The saver list's value for "off", which is how Windows 98 switched a screen saver off. */
const NONE = 'none';

/** Each saver's name, as a key in this package's dictionary and its English. */
const SAVER_NAMES: Record<AccessoriesScreensaverId, [key: string, english: string]> = {
  starfield: ['screensaverStarfield', 'Starfield'],
  mystify: ['screensaverMystify', 'Mystify'],
  flying: ['screensaverFlying', 'Flying Umbraco'],
};

/**
 * The Screen Saver window: Windows 98's Screen Saver tab, one control for one control. A monitor
 * running the chosen saver, the list of savers with (None) at the top, "Wait _ minutes", and a
 * Preview button that runs it full screen.
 *
 * The same element is the screen saver part of Desktop settings > Accessories, because a person
 * looking for it will look in both places, and two screens for one setting are two screens that can
 * come to disagree. Like every other setting on the desktop there is no OK or Apply: a choice applies
 * the moment it is made, and the idle watcher follows it without being told.
 *
 * (None) switches the screensaver off and keeps the saver that was chosen, so switching it back on
 * later is one choice rather than two.
 */
@customElement('umbradesktop-screensaver-panel')
export class ScreensaverPanelElement extends UmbLitElement {
  /**
   * Where the settings are read from and written to. The stored per-user settings unless a test,
   * or the settings screen that embeds this one, says otherwise.
   */
  @property({ attribute: false })
  source?: AccessoriesSettingsSource;

  /** Bumped when the settings change, to re-render. The values themselves live in the source. */
  @state()
  private _revision = 0;

  /** The source in use: the one given, or the stored settings. */
  #source?: AccessoriesSettingsSource;

  /** Stops listening to the source. */
  #unsubscribe?: () => void;

  /** Settle on a source and listen to it. */
  override connectedCallback(): void {
    super.connectedCallback();
    this.#source ??= this.source ?? new UmbraDesktopAccessoriesSettingsController(this);
    this.#unsubscribe = this.#source.subscribe(() => this._revision++);
  }

  /** Stop listening. */
  override disconnectedCallback(): void {
    this.#unsubscribe?.();
    super.disconnectedCallback();
  }

  /** The screensaver settings as they stand. */
  get #settings(): AccessoriesScreensaverSettings {
    return this.#source!.value.screensaver;
  }

  /**
   * Change some of the screensaver settings.
   * @param change What changes.
   */
  #update(change: Partial<AccessoriesScreensaverSettings>): void {
    const value = this.#source!.value;
    this.#source!.set({ ...value, screensaver: { ...value.screensaver, ...change } });
  }

  /**
   * One word from this package's dictionary.
   * @param key The key inside the area.
   * @param fallback The English, shown if the dictionary has not loaded.
   * @returns The localised string.
   */
  #term(key: string, fallback: string): string {
    return this.localize.termOrDefault(`${AREA}_${key}`, fallback);
  }

  /**
   * A saver chosen, or (None).
   * @param event The list's change.
   */
  #onSaver(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === NONE) this.#update({ enabled: false });
    else this.#update({ enabled: true, saver: value as AccessoriesScreensaverId });
  }

  /**
   * A wait chosen.
   * @param event The list's change.
   */
  #onWait(event: Event): void {
    this.#update({ waitMinutes: Number((event.target as HTMLSelectElement).value) });
  }

  /**
   * Run the chosen saver full screen, as the watcher would, until the first key, click or real
   * movement. Appended to the page rather than kept in this shadow root, so it covers the whole
   * backoffice and not only this window.
   */
  #preview(): void {
    const element = document.createElement('umbradesktop-screensaver');
    element.setAttribute('saver', this.#settings.saver);
    document.body.appendChild(element);
  }

  /**
   * The window.
   * @returns The monitor, the saver list with Preview, and the wait.
   */
  override render() {
    void this._revision;
    const { enabled, saver, waitMinutes } = this.#settings;
    const listLabel = this.#term('screensaverChoose', 'Screen saver');
    return html`
      <div class="monitor" aria-hidden="true">
        <div class="screen">
          ${enabled ? html`<umbradesktop-screensaver preview saver=${saver}></umbradesktop-screensaver>` : ''}
        </div>
      </div>
      <div class="row">
        <select class="control" data-field="saver" aria-label=${listLabel} title=${listLabel} @change=${this.#onSaver}>
          <option value=${NONE} ?selected=${!enabled}>${this.#term('screensaverNone', '(None)')}</option>
          ${UMBRADESKTOP_SCREENSAVERS.map(
            (id) => html`<option value=${id} ?selected=${enabled && saver === id}>${this.#term(...SAVER_NAMES[id])}</option>`,
          )}
        </select>
        <button class="control" type="button" data-action="preview" ?disabled=${!enabled} @click=${this.#preview}>
          ${this.#term('screensaverPreview', 'Preview')}
        </button>
      </div>
      <label class="row">
        <span>${this.#term('screensaverWait', 'Wait')}</span>
        <select class="control" data-field="wait" ?disabled=${!enabled} @change=${this.#onWait}>
          ${UMBRADESKTOP_SCREENSAVER_WAIT_CHOICES.map(
            (minutes) => html`<option value=${minutes} ?selected=${minutes === waitMinutes}>${minutes}</option>`,
          )}
        </select>
        <span>${this.#term('screensaverMinutes', 'minutes')}</span>
      </label>
      <p class="hint muted">
        ${this.#term(
          'screensaverAbout',
          'Starts when the desktop has been left alone for the wait. Any key, click or real movement of the mouse brings it back.',
        )}
      </p>
    `;
  }

  /**
   * One column, every height from `constants.ts`, which the manifest's sizes are summed from. The
   * monitor is drawn in CSS: plastic in the app's raised surface, a sunken black screen, and a stand.
   */
  static override styles = [
    accessoryStyles,
    css`
      :host {
        padding: ${SCREENSAVER_PADDING_PX}px;
        gap: ${SCREENSAVER_PADDING_PX}px;
        align-items: center;
      }

      .monitor {
        position: relative;
        flex-shrink: 0;
        width: ${SCREENSAVER_WINDOW.monitor.w}px;
        height: ${SCREENSAVER_WINDOW.monitor.h}px;
        padding: ${SCREENSAVER_BEZEL_PX}px;
        padding-bottom: ${SCREENSAVER_BEZEL_PX + SCREENSAVER_STAND_PX}px;
      }

      /* The plastic, as a shape behind the screen rather than a background on .monitor, so the
         stand can be narrower than the case above it. */
      .monitor::before {
        content: '';
        position: absolute;
        inset: 0 0 ${SCREENSAVER_STAND_PX}px;
        background: var(--umbradesktop-app-surface-raised, var(--uui-color-surface-emphasis));
        box-shadow: 0 0 0 1px var(--umbradesktop-app-border, var(--uui-color-text-alt));
        border-radius: var(--umbradesktop-app-radius, 3px);
      }

      .monitor::after {
        content: '';
        position: absolute;
        left: 30%;
        right: 30%;
        bottom: 0;
        height: ${SCREENSAVER_STAND_PX - 4}px;
        background: var(--umbradesktop-app-surface-raised, var(--uui-color-surface-emphasis));
        box-shadow: 0 0 0 1px var(--umbradesktop-app-border, var(--uui-color-text-alt));
        border-radius: 0 0 var(--umbradesktop-app-radius, 3px) var(--umbradesktop-app-radius, 3px);
      }

      .screen {
        position: relative;
        z-index: 1;
        width: ${SCREENSAVER_WINDOW.screen.w}px;
        height: ${SCREENSAVER_WINDOW.screen.h}px;
        overflow: hidden;
        background: #000;
        box-shadow: 0 0 0 1px var(--umbradesktop-app-border, var(--uui-color-text-alt));
      }

      .row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
        height: ${SCREENSAVER_ROW_PX}px;
        align-self: stretch;
        justify-content: center;
      }

      .row .control {
        height: ${SCREENSAVER_ROW_PX}px;
      }

      [data-field='saver'] {
        flex: 1;
        min-width: 0;
        max-width: 14em;
      }

      .control:disabled {
        opacity: 0.5;
        cursor: default;
      }

      .hint {
        flex-shrink: 0;
        align-self: stretch;
        height: ${SCREENSAVER_HINT_PX}px;
        margin: 0;
        overflow: hidden;
        text-align: center;
        font-size: 12px;
        line-height: ${unsafeCSS(SCREENSAVER_HINT_PX / 3)}px;
      }
    `,
  ];
}

export { ScreensaverPanelElement as element };

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so templates type-check. */
    'umbradesktop-screensaver-panel': ScreensaverPanelElement;
  }
}
