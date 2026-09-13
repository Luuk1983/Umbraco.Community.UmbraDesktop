import type { UmbraDesktopLocaleSettings } from '../../types';
import type { UmbraDesktopSettingsContext } from '../../settings.context';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../../settings.context-token';
import { UMBRADESKTOP_DEFAULT_SETTINGS } from '../../settings-store.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../../../window-manager.context-token';
import type { UmbraDesktopWindowManagerContext } from '../../../window-manager.context';
import type { UmbraDesktopWindow } from '../../../types';
import { formatClock } from '../../../clock-format.js';
import { reloadDialogContent } from '../../../reload-message.js';
import { css, customElement, html, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbConfirmModal } from '@umbraco-cms/backoffice/modal';
import { UMB_CURRENT_USER_CONTEXT, UmbCurrentUserRepository } from '@umbraco-cms/backoffice/current-user';
import '@umbraco-cms/backoffice/localization';

/**
 * What the backoffice speaks, and how this desktop writes dates and times.
 *
 * Three controls in place rather than three `umbradesktop-settings-row`s. That row ends in a
 * chevron, and the chevron is a claim: it says "this opens somewhere you come back from". These
 * choices are made where they stand, so they get the General screen's shape — a labelled control
 * with a sentence under it — instead. See `settings-row.element.ts`.
 *
 * The first control is the odd one out and is written to look it. It is the only thing on this
 * panel that changes something outside the desktop, and the only one that cannot take effect
 * without a reload.
 */
@customElement('umbradesktop-settings-language')
export class UmbraDesktopSettingsLanguageElement extends UmbLitElement {
  /** The current user's backoffice language, once known. */
  @state()
  private _language = '';

  /** How this user wants dates and times formatted. */
  @state()
  private _locale: UmbraDesktopLocaleSettings = { ...UMBRADESKTOP_DEFAULT_SETTINGS.locale };

  /**
   * The open windows, for the reload dialog's count.
   *
   * Observed into state rather than read on demand: the manager publishes `windows` as an
   * observable with no getter, exactly as the taskbar consumes it.
   */
  @state()
  private _windows: ReadonlyArray<UmbraDesktopWindow> = [];

  #settings?: UmbraDesktopSettingsContext;

  #manager?: UmbraDesktopWindowManagerContext;

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_SETTINGS_CONTEXT, (context) => {
      this.#settings = context ?? undefined;
      if (!context) return;
      this.observe(context.locale, (locale) => {
        this._locale = locale ?? { ...UMBRADESKTOP_DEFAULT_SETTINGS.locale };
      });
    });
    this.consumeContext(UMB_CURRENT_USER_CONTEXT, (context) => {
      if (!context) return;
      this.observe(context.currentUser, (user) => (this._language = user?.languageIsoCode ?? ''));
    });
    // Only the reload dialog's counts come from here, which is why a missing manager is not an
    // error: the screen still works, it just has nothing to warn about.
    this.consumeContext(UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, (context) => {
      this.#manager = context ?? undefined;
      if (!context) return;
      this.observe(context.windows, (windows) => (this._windows = windows ?? []));
    });
  }

  /**
   * Save the chosen backoffice language, then offer to reload.
   *
   * Saved first and asked second, deliberately. The change is a fact by the time the dialog opens,
   * so declining costs nothing and it applies at the user's next load — which is why the dialog
   * says the language is saved rather than asking permission to apply it.
   *
   * A failed save asks nothing. `updateProfile` has already shown the error, and a reload dialog on
   * top of it would be offering to reload for a change that did not happen.
   * @param event The change event from the culture input.
   */
  #onLanguageChange = async (event: Event) => {
    const chosen = (event.target as { value?: unknown } | null)?.value;
    if (typeof chosen !== 'string' || !chosen || chosen === this._language) return;
    const { error } = await new UmbCurrentUserRepository(this).updateProfile(chosen);
    if (error) return;
    this._language = chosen;
    await this.#offerReload();
  };

  /**
   * Ask whether to reload now, and do it if so.
   *
   * Cancelling is a real answer rather than a failure, which is why the rejection is swallowed: the
   * language is saved either way, and "Later" means exactly that.
   */
  async #offerReload() {
    try {
      await umbConfirmModal(this, {
        headline: this.localize.term('umbraDesktop_reloadHeadline'),
        content: reloadDialogContent(
          this._windows.length,
          this.#manager?.unsavedWindows().length ?? 0,
          this.#manager?.conflictedWindows().length ?? 0,
          (key, ...args) => this.localize.term(key, ...args),
        ),
        confirmLabel: this.localize.term('umbraDesktop_reloadConfirm'),
        cancelLabel: this.localize.term('umbraDesktop_reloadLater'),
      });
    } catch {
      return; // Later. The language is saved and applies at the next load.
    }
    window.location.reload();
  }

  /**
   * Change which culture the desktop formats with.
   * @param event The change event from the select.
   */
  #onSourceChange = (event: Event) => {
    const value = (event.target as { value?: unknown } | null)?.value;
    if (value === 'backoffice' || value === 'browser') this.#settings?.setLocaleSource(value);
  };

  /**
   * Change whether the clock overrides its culture's hour cycle.
   * @param event The change event from the select.
   */
  #onCycleChange = (event: Event) => {
    const value = (event.target as { value?: unknown } | null)?.value;
    if (value === 'auto' || value === 'h12' || value === 'h23') this.#settings?.setClockHourCycle(value);
  };

  /**
   * A sample of what the clock will look like.
   *
   * Here rather than only on the taskbar because the taskbar is behind the settings panel while
   * this screen is open: a choice whose only visible effect is hidden reads as a choice that did
   * nothing.
   * @returns The preview line.
   */
  #renderPreview() {
    return html`
      <p class="preview">
        <span>${this.localize.term('umbraDesktop_clockPreview')}</span>
        <span class="time">${formatClock(new Date(), this._locale, { backoffice: this.localize.lang() })}</span>
      </p>
    `;
  }

  override render() {
    return html`
      <section>
        <h4>${this.localize.term('umbraDesktop_backofficeLanguage')}</h4>
        <umb-ui-culture-input
          name="language"
          label=${this.localize.term('umbraDesktop_backofficeLanguage')}
          value=${this._language}
          @change=${this.#onLanguageChange}></umb-ui-culture-input>
        <p class="hint">${this.localize.term('umbraDesktop_backofficeLanguageAbout')}</p>
      </section>
      <section>
        <h4>${this.localize.term('umbraDesktop_regionalFormat')}</h4>
        <uui-select
          label=${this.localize.term('umbraDesktop_regionalFormat')}
          .options=${[
            {
              name: this.localize.term('umbraDesktop_formatBackoffice'),
              value: 'backoffice',
              selected: this._locale.source === 'backoffice',
            },
            {
              name: this.localize.term('umbraDesktop_formatBrowser'),
              value: 'browser',
              selected: this._locale.source === 'browser',
            },
          ]}
          @change=${this.#onSourceChange}></uui-select>
        <p class="hint">${this.localize.term('umbraDesktop_regionalFormatAbout')}</p>
      </section>
      <section>
        <h4>${this.localize.term('umbraDesktop_clock')}</h4>
        <uui-select
          label=${this.localize.term('umbraDesktop_clock')}
          .options=${[
            {
              name: this.localize.term('umbraDesktop_clockAuto'),
              value: 'auto',
              selected: this._locale.hourCycle === 'auto',
            },
            {
              name: this.localize.term('umbraDesktop_clock12'),
              value: 'h12',
              selected: this._locale.hourCycle === 'h12',
            },
            {
              name: this.localize.term('umbraDesktop_clock24'),
              value: 'h23',
              selected: this._locale.hourCycle === 'h23',
            },
          ]}
          @change=${this.#onCycleChange}></uui-select>
        ${this.#renderPreview()}
      </section>
    `;
  }

  static override styles = [
    css`
      :host {
        display: block;
      }
      /* Space between groups rather than a rule, matching Appearance: '--uui-color-divider' is a
         hair off the panel surface in light and clearly darker in dark, so a line here would look
         like two different designs depending on the mode. */
      section + section {
        margin-top: var(--uui-size-space-5);
      }
      h4 {
        margin: 0 0 var(--uui-size-space-3);
      }
      umb-ui-culture-input,
      uui-select {
        width: 100%;
      }
      /* A hint that explains the control above it rather than the one below, as on General. */
      .hint {
        margin: var(--uui-size-space-3) 0 0;
        color: var(--uui-color-text-alt, var(--uui-color-text));
        font-size: var(--uui-type-small-size);
      }
      .preview {
        display: flex;
        align-items: baseline;
        gap: var(--uui-size-space-2);
        margin: var(--uui-size-space-3) 0 0;
        color: var(--uui-color-text-alt, var(--uui-color-text));
        font-size: var(--uui-type-small-size);
      }
      .time {
        margin-left: auto;
        color: var(--uui-color-text);
        font-size: var(--uui-type-default-size);
        font-weight: 700;
        /* So the sample does not jump width between 9:05 and 14:30 while somebody is choosing. */
        font-variant-numeric: tabular-nums;
      }
    `,
  ];
}

export default UmbraDesktopSettingsLanguageElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-settings-language': UmbraDesktopSettingsLanguageElement;
  }
}
