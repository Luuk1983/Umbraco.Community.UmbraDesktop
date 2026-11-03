import { css, customElement, html, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { KEEP_NOTE_MAX } from './health.client.js';
import type { HealthKeepDuration } from './health.client.js';
import { wordsOf } from '../shared/words.js';
import type { WordKey } from '../shared/words.js';
import { healthScreenStyles } from './health-styles.js';

/** The durations Keep… offers, in order, each with its words. */
const DURATIONS: ReadonlyArray<{ value: HealthKeepDuration; word: WordKey }> = [
  { value: 'ThreeMonths', word: 'healthKeepThreeMonths' },
  { value: 'Year', word: 'healthKeepYear' },
  { value: 'Always', word: 'healthKeepAlways' },
];

/**
 * Keep… (design §16.6, mock scene 8): a sheet over the window that asks two things, both with defaults
 * so it stays one click: why, which may stay empty, and for how long, a year unless changed. The line
 * under the choice says what happens when the time is up, so nobody thinks Keep is for ever.
 *
 * Styled as the Clean up sheet, from the same window, so the two questions the window asks look alike;
 * the note is UUI's textarea and the duration UUI's radio group, as core's own forms draw them. Fires
 * `health-keep-confirm` `{ note, duration }` or `health-keep-cancel`.
 */
@customElement('umbradesktop-health-keep-sheet')
export class UmbraDesktopHealthKeepSheetElement extends UmbLitElement {
  /** How many rows are kept. */
  @property({ type: Number })
  count = 1;

  /** The one row's name, when there is one, so the question names it. */
  @property()
  name?: string;

  /** The note as typed. */
  @state()
  private _note = '';

  /** The duration chosen; a year by default (design §16.6). */
  @state()
  private _duration: HealthKeepDuration = 'Year';

  /** This package's words. */
  #words = wordsOf(this.localize);

  /**
   * Answer the sheet.
   * @param name `health-keep-confirm` or `health-keep-cancel`.
   * @param detail What a confirm carries.
   */
  #answer(name: string, detail?: { note: string; duration: HealthKeepDuration }): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  override render() {
    const locale = this.localize.lang() || undefined;
    const heading = this.count === 1 && this.name ? this.#words('healthKeepOne', this.name) : this.#words('healthKeepMany', this.count.toLocaleString(locale));
    return html`<div class="backdrop" @click=${() => this.#answer('health-keep-cancel')}></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="title">
        <h2 id="title">${heading}</h2>
        <div class="field">
          <uui-label for="note">${this.#words('healthKeepWhy')}</uui-label>
          <uui-textarea
            id="note"
            label=${this.#words('healthKeepWhy')}
            .maxlength=${KEEP_NOTE_MAX}
            .value=${this._note}
            @input=${(event: Event) => (this._note = String((event.target as HTMLTextAreaElement).value ?? ''))}></uui-textarea>
          <small class="muted">${this.#words('healthKeepWhyHint')}</small>
        </div>
        <div class="field">
          <uui-label>${this.#words('healthKeepFor')}</uui-label>
          <uui-radio-group
            label=${this.#words('healthKeepFor')}
            .value=${this._duration}
            @change=${(event: Event) => (this._duration = (event.target as HTMLInputElement).value as HealthKeepDuration)}>
            ${DURATIONS.map((each) => html`<uui-radio value=${each.value} label=${this.#words(each.word)} ?checked=${this._duration === each.value}></uui-radio>`)}
          </uui-radio-group>
          <small class="muted">${this.#words(this._duration === 'Always' ? 'healthKeepAlwaysNote' : 'healthKeepComesBack')}</small>
        </div>
        <div class="actions">
          <span class="space"></span>
          <uui-button look="secondary" label=${this.#words('healthCancel')} @click=${() => this.#answer('health-keep-cancel')}></uui-button>
          <uui-button
            look="primary"
            label=${this.#words('healthKeepConfirm')}
            @click=${() => this.#answer('health-keep-confirm', { note: this._note, duration: this._duration })}></uui-button>
        </div>
      </div>`;
  }

  static override styles = [
    healthScreenStyles,
    css`
      /* The Clean up sheet's frame: over the window, a backdrop, the sheet at the top. */
      :host {
        position: absolute;
        inset: 0;
        z-index: 1;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        padding: var(--uui-size-space-6, 24px) var(--uui-size-space-4, 12px);
        box-sizing: border-box;
      }

      .backdrop {
        position: absolute;
        inset: 0;
        background: var(--uui-color-overlay, rgba(0, 0, 0, 0.4));
      }

      .sheet {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-4, 12px);
        width: min(100%, 34em);
        padding: var(--uui-size-space-5, 18px) var(--uui-size-space-5, 18px) var(--uui-size-space-4, 12px);
        background: var(--uui-color-surface);
        color: var(--uui-color-text);
        border-radius: var(--uui-border-radius, 3px);
        box-shadow: var(--uui-shadow-depth-5, 0 12px 40px rgba(0, 0, 0, 0.35));
      }

      h2 {
        margin: 0;
        font-size: var(--uui-type-h5-size, 17px);
        overflow-wrap: anywhere;
      }

      .field {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-2, 6px);
      }

      uui-textarea {
        --uui-textarea-min-height: 4.5em;
      }

      uui-radio-group {
        display: flex;
        flex-wrap: wrap;
        gap: var(--uui-size-space-5, 18px);
      }

      .actions {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-2, 6px);
      }

      .space {
        flex: 1;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-health-keep-sheet': UmbraDesktopHealthKeepSheetElement;
  }
}
