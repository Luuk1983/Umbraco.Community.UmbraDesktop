import type { UmbraDesktopSettingsContext } from '../../settings.context';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../../settings.context-token';
import { css, customElement, html, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type { UmbraDesktopReopenWindows } from '../../types';

/**
 * The three answers to when windows are reopened, in the order they read: from least kept to most.
 * A select rather than three radio buttons, as the Site screen's corner is, because the hint under
 * it does the explaining and a stack of radios would push it out of sight.
 */
const REOPEN_CHOICES: ReadonlyArray<{ value: UmbraDesktopReopenWindows; term: string }> = [
  { value: 'off', term: 'umbraDesktop_reopenWindowsOff' },
  { value: 'session', term: 'umbraDesktop_reopenWindowsSession' },
  { value: 'persistent', term: 'umbraDesktop_reopenWindowsPersistent' },
];

/**
 * The settings that are not about how the desktop looks: whether you land on it when you sign in,
 * and when it reopens the windows you had open.
 *
 * Called General rather than System or Startup on purpose. Startup describes the only setting here
 * and would be wrong the moment a second one arrives; System means machine-level things — display,
 * power, storage — that this package will never own, and `groupSystem` already means something else
 * in the launcher's catalogue.
 */
@customElement('umbradesktop-settings-general')
export class UmbraDesktopSettingsGeneralElement extends UmbLitElement {
  /** Whether this user boots straight into the desktop. */
  @state()
  private _bootIntoDesktop = false;

  /** When the desktop reopens this user's windows. */
  @state()
  private _reopenWindows: UmbraDesktopReopenWindows = 'session';

  #settings?: UmbraDesktopSettingsContext;

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_SETTINGS_CONTEXT, (context) => {
      this.#settings = context ?? undefined;
      if (!context) return;
      this.observe(context.bootIntoDesktop, (enabled) => (this._bootIntoDesktop = enabled === true));
      this.observe(context.reopenWindows, (mode) => (this._reopenWindows = mode ?? 'session'));
    });
  }

  /**
   * Two settings, each with the sentence that stops it looking broken.
   *
   * No sub-headings, unlike the groups under Appearance: each control's own label says what it
   * does, and a heading over a single control would be a label for a label.
   *
   * Both hints are load-bearing, because neither setting changes anything on screen when it is
   * changed. The boot preference is read while the backoffice boots, and its hint also names the
   * escape hatch, because the desktop hides the backoffice header and somebody whose desktop breaks
   * needs a way back that does not depend on the desktop. Reopening windows shows itself only on the
   * next load, so its hint says what comes back and what does not.
   * @returns The screen's contents.
   */
  override render() {
    return html`
      <uui-toggle
        label=${this.localize.term('umbraDesktop_bootIntoDesktop')}
        ?checked=${this._bootIntoDesktop}
        @change=${(event: Event) =>
          this.#settings?.setBootIntoDesktop(!!(event.target as HTMLInputElement | null)?.checked)}></uui-toggle>
      <p class="hint">${this.localize.term('umbraDesktop_bootDescription')}</p>
      <div class="field-label">${this.localize.term('umbraDesktop_reopenWindows')}</div>
      <uui-select
        label=${this.localize.term('umbraDesktop_reopenWindows')}
        .options=${REOPEN_CHOICES.map((choice) => ({
          name: this.localize.term(choice.term),
          value: choice.value,
          selected: choice.value === this._reopenWindows,
        }))}
        @change=${(event: Event) =>
          this.#settings?.setReopenWindows((event.target as HTMLSelectElement).value as UmbraDesktopReopenWindows)}></uui-select>
      <p class="hint">${this.localize.term('umbraDesktop_reopenWindowsDescription')}</p>
    `;
  }

  static override styles = [
    css`
      :host {
        display: block;
      }
      /* A hint that explains the control above it rather than the one below. */
      .hint {
        margin: var(--uui-size-space-3) 0 0;
        color: var(--uui-color-text-alt, var(--uui-color-text));
        font-size: var(--uui-type-small-size);
      }
      /* The select's own label, since a select has none on screen; the same as the Site screen's. */
      .field-label {
        font-weight: 700;
        margin: var(--uui-size-space-5) 0 var(--uui-size-space-2);
      }
      uui-select {
        display: block;
        max-width: 240px;
      }
    `,
  ];
}

export default UmbraDesktopSettingsGeneralElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-settings-general': UmbraDesktopSettingsGeneralElement;
  }
}
