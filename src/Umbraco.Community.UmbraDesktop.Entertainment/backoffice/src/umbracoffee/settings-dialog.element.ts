import { UMBRACOFFEE_FIELD_HEIGHT } from './constants.js';
import { umbraCoffeeTerm } from './localize.js';
import { css, customElement, html, nothing, property, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * umbraCoffee's settings, behind the gear (addendum 2026-10-01 (2), mock views E and E2): one box,
 * Reminders, with the Remind me switch. Solitaire's pattern, so the two apps' settings feel like one
 * desktop's: a scrim over this window's content only (never the desktop, since it concerns only this
 * window), a centred panel titled Settings with a close control, a box per group in the uui-box
 * shape, and Done.
 *
 * A native `<dialog>` is not used, for Solitaire's reason: `showModal()` puts it in the top layer over
 * the whole page. So the dialog keeps focus to itself by hand: the first control takes focus when it
 * opens, Tab wraps at both ends, and Escape closes it without reaching the desktop.
 *
 * The dialog holds no state. The switch shows {@link remind}, which the window reads from the
 * desktop, and a press asks the window to flip it (`umbracoffee-remind-toggle`); the desktop then
 * announces the new value and the window passes it back. When the switch cannot act it stays drawn,
 * disabled, with {@link reason} under it, the way the desktop's own settings disable rather than hide.
 */
@customElement('umbracoffee-settings')
export class UmbraCoffeeSettingsDialogElement extends UmbLitElement {
  /** Whether reminders are on, as the desktop says. */
  @property({ type: Boolean, attribute: false })
  remind = false;

  /** Why the switch cannot act, shown under it; undefined while it works. */
  @property({ attribute: false })
  reason?: string;

  /**
   * The active theme id. The desktop stamps it on the window, not on this child, and a theme rule can
   * only match a host attribute, so the window passes it on; reflected so the rules can match it.
   */
  @property({ attribute: 'data-umbradesktop-theme', reflect: true })
  theme?: string;

  /** Put focus inside, on the first control, so a keyboard user lands in the dialog they opened. */
  protected override firstUpdated(): void {
    this.shadowRoot?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  }

  /**
   * A term from this package's dictionary with its English fallback.
   * @param key The key under this package's area.
   * @param fallback The English.
   * @returns The text.
   */
  #term(key: string, fallback: string): string {
    return umbraCoffeeTerm(this.localize, key, fallback);
  }

  /** Ask the window to close the dialog. */
  #close(): void {
    this.dispatchEvent(new CustomEvent('umbracoffee-settings-close', { bubbles: true, composed: true }));
  }

  /** Ask the window to flip the switch, unless it cannot act. */
  #toggle(): void {
    if (this.reason !== undefined) return;
    this.dispatchEvent(new CustomEvent('umbracoffee-remind-toggle', { bubbles: true, composed: true }));
  }

  /**
   * Close on Escape, and keep Tab inside: aria-modal promises focus stays in the dialog, so it wraps at
   * both ends. Escape stops here, so it does not reach the desktop, which may have uses of its own.
   * @param event The key press.
   */
  #onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.#close();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = [...(this.shadowRoot?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    if (controls.length === 0) return;
    const first = controls[0]!;
    const last = controls[controls.length - 1]!;
    const active = this.shadowRoot?.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  /**
   * The scrim, the panel and its one box.
   * @returns The template.
   */
  override render() {
    const disabled = this.reason !== undefined;
    return html`<div class="scrim" @click=${(event: Event) => event.target === event.currentTarget && this.#close()}>
      <div class="panel" role="dialog" aria-modal="true" aria-labelledby="title" @keydown=${this.#onKeydown}>
        <header>
          <h2 id="title">${this.#term('umbraCoffeeSettings', 'Settings')}</h2>
          <button type="button" class="x" aria-label=${this.#term('umbraCoffeeClose', 'Close')} @click=${() => this.#close()}>
            <i aria-hidden="true"
              ><svg viewBox="0 0 12 12"><line x1="3" y1="3" x2="9" y2="9"></line><line x1="9" y1="3" x2="3" y2="9"></line></svg
            ></i>
          </button>
        </header>
        <section>
          <h3>${this.#term('umbraCoffeeReminders', 'Reminders')}</h3>
          <div class="box-body">
            <div class=${disabled ? 'setting is-disabled' : 'setting'}>
              <button
                type="button"
                role="switch"
                class="switch"
                aria-checked=${this.remind ? 'true' : 'false'}
                aria-labelledby="remind-label"
                aria-describedby=${disabled ? 'remind-about remind-why' : 'remind-about'}
                ?disabled=${disabled}
                @click=${() => this.#toggle()}
              >
                <span class="knob"></span>
              </button>
              <div>
                <b id="remind-label">${this.#term('umbraCoffeeRemindMe', 'Remind me')}</b>
                <p id="remind-about">
                  ${this.#term(
                    'umbraCoffeeRemindAbout',
                    'A reminder ten minutes before an episode starts, and when it goes live. The same switch as umbraCoffee under Taskbar in Desktop settings.',
                  )}
                </p>
              </div>
            </div>
            ${disabled
              ? html`<div class="reason" id="remind-why">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M10.4 4.6a1.85 1.85 0 0 1 3.2 0l7.1 12.6a1.85 1.85 0 0 1-1.6 2.8H4.9a1.85 1.85 0 0 1-1.6-2.8z"></path>
                    <path d="M12 9.5v4"></path>
                    <circle cx="12" cy="16.6" r=".4"></circle>
                  </svg>
                  <span>${this.reason}</span>
                </div>`
              : nothing}
          </div>
        </section>
        <footer><button type="button" class="done" @click=${() => this.#close()}>${this.#term('umbraCoffeeDone', 'Done')}</button></footer>
      </div>
    </div>`;
  }

  /**
   * Solitaire's dialog in the mock's values: tokens first, then one paint-only block per theme. The
   * sizes (the 560px panel, the 33px Done, the 36 by 18 switch, the 32px close control) are the same
   * under every theme; a theme repaints them. The close control's look lives on an inner glyph, so a
   * theme can draw macOS's 12px traffic light or Windows 98's 16 by 14 caption button without
   * changing the button's own box.
   */
  static override styles = css`
    :host {
      position: absolute;
      inset: 0;
      z-index: 20;
      font-family: var(--umbradesktop-app-font, inherit);
    }

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    .scrim {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgb(10 14 36 / 55%);
      backdrop-filter: blur(3px);
    }

    .panel {
      width: min(560px, calc(100% - 32px));
      max-height: calc(100% - 32px);
      overflow: auto;
      background: var(--umbradesktop-app-surface, var(--uui-color-surface));
      color: var(--umbradesktop-app-text, var(--uui-color-text));
      border: 1px solid var(--umbradesktop-app-edge-dark, var(--uui-color-border));
      border-radius: calc(var(--umbradesktop-app-radius, 3px) * 3);
      box-shadow: 0 30px 70px rgb(0 0 0 / 45%);
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 12px 12px 20px;
    }

    h2 {
      margin: 0;
      font-size: 18px;
      line-height: 24px;
      font-weight: 700;
    }

    /* A box like Umbraco's uui-box: bordered, rounded, its headline in a strip of its own. Built from
       the app tokens rather than uui-box so a theme can reskin it. */
    section {
      margin: 0 20px 12px;
      border: 1px solid var(--umbradesktop-app-border, var(--uui-color-border));
      border-radius: var(--umbradesktop-app-radius, 3px);
      background: var(--umbradesktop-app-surface-raised, var(--uui-color-surface));
    }

    h3 {
      margin: 0;
      padding: 12px 18px;
      font-size: 15px;
      line-height: 21px;
      font-weight: 700;
      box-shadow: 0 1px 0 0 var(--umbradesktop-app-edge-dark, var(--uui-color-border));
    }

    .box-body {
      padding: 18px;
    }

    .setting {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }

    .setting b {
      display: block;
      font-size: 14px;
      line-height: 20px;
    }

    .setting p {
      margin: 2px 0 0;
      max-width: 52ch;
      font-size: 13px;
      line-height: 19px;
      color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
    }

    .setting.is-disabled b,
    .setting.is-disabled p {
      opacity: 0.6;
    }

    button {
      font: inherit;
      color: inherit;
      cursor: pointer;
    }

    button:disabled {
      cursor: not-allowed;
    }

    button:focus-visible {
      outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
      outline-offset: 2px;
    }

    /* uui-toggle: a 36 by 18 track with a 14px knob that slides to the right when on. */
    .switch {
      position: relative;
      flex: none;
      width: 36px;
      height: 18px;
      margin: 1px 0 0;
      padding: 0;
      border: 1px solid var(--umbradesktop-app-border, var(--uui-color-border));
      border-radius: 100px;
      background: var(--umbradesktop-app-surface-sunken, var(--uui-color-background));
    }

    .knob {
      position: absolute;
      top: 1px;
      left: 1px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--umbradesktop-app-surface-raised, var(--uui-color-surface));
      box-shadow: 0 0 0 1px var(--umbradesktop-app-border, var(--uui-color-border));
      transition: left 120ms ease;
    }

    .switch[aria-checked='true'] {
      border-color: var(--umbradesktop-app-accent, var(--uui-color-selected));
      background: var(--umbradesktop-app-accent, var(--uui-color-selected));
    }

    .switch[aria-checked='true'] .knob {
      left: 19px;
      box-shadow: none;
    }

    .switch:disabled {
      opacity: 0.5;
    }

    .reason {
      display: flex;
      align-items: flex-start;
      gap: 9px;
      margin-top: 14px;
      padding: 10px 12px;
      border-radius: var(--umbradesktop-app-radius, 3px);
      background: #fef8dc;
      color: #3d2f00;
      font-size: 13px;
      line-height: 19px;
    }

    .reason svg {
      flex: none;
      width: 16px;
      height: 16px;
      margin-top: 1px;
      fill: none;
      stroke: #a17700;
      stroke-width: 1.75;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .reason circle {
      fill: #a17700;
    }

    footer {
      display: flex;
      justify-content: flex-end;
      padding: 6px 20px 18px;
    }

    .done {
      height: ${unsafeCSS(UMBRACOFFEE_FIELD_HEIGHT)}px;
      padding: 0 18px;
      font-weight: 700;
      border: 0;
      border-radius: var(--umbradesktop-app-radius, 3px);
      background: var(--umbradesktop-app-accent, var(--uui-color-selected));
      color: var(--umbradesktop-app-accent-text, var(--uui-color-surface));
    }

    /* The desktop's own window close: the same 12-unit cross the host's titlebar draws, flat at rest,
       with the theme's close-hover colours, so it reads as the close every window here has. */
    .x {
      display: inline-grid;
      place-items: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border: 0;
      background: transparent;
      border-radius: var(--umbradesktop-app-radius, 3px);
      color: var(--umbradesktop-app-text, var(--uui-color-text));
    }

    .x i {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: inherit;
    }

    .x svg {
      width: 14px;
      height: 14px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.2;
      stroke-linecap: square;
    }

    .x:hover i {
      background: var(--umbradesktop-control-close-hover-background, var(--uui-color-danger, #d42054));
      color: var(--umbradesktop-control-close-hover-color, #fff);
    }

    /* ---- Theme refinements: paint only, never a size ---- */

    :host([data-umbradesktop-theme='umbraco']) .panel {
      border-color: var(--uui-color-border, #d8d7d9);
      border-radius: 9px;
    }
    :host([data-umbradesktop-theme='umbraco']) section {
      border-color: var(--uui-color-divider, #e9e9eb);
      background: var(--uui-color-surface, #fff);
    }
    :host([data-umbradesktop-theme='umbraco']) h3 {
      box-shadow: 0 1px 0 0 var(--uui-color-divider, #e9e9eb);
    }
    :host([data-umbradesktop-theme='umbraco']) .switch[aria-checked='true'],
    :host([data-umbradesktop-theme='umbraco']) .done {
      border-color: var(--uui-color-selected, #283a97);
      background: var(--uui-color-selected, #283a97);
      color: #fff;
    }

    :host([data-umbradesktop-theme='umbraco4']) .panel {
      border-radius: 3px;
    }
    :host([data-umbradesktop-theme='umbraco4']) h3 {
      background: linear-gradient(180deg, #f7f6f2 0%, #ebe8e2 100%);
    }
    :host([data-umbradesktop-theme='umbraco4']) .done {
      background: linear-gradient(180deg, #fbfaf7 0%, #f1efea 48%, #ddd9d0 100%);
      color: #2c2a26;
      box-shadow:
        inset 0 0 0 1px #9d988e,
        inset 0 2px 0 -1px #fff;
    }

    /* macOS: the red traffic light, its cross shown only under the pointer, as on every window. */
    :host([data-umbradesktop-theme='macos']) .panel {
      border-radius: 12px;
    }
    :host([data-umbradesktop-theme='macos']) .x i,
    :host([data-umbradesktop-theme='macos']) .x:hover i {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #ff5f57;
      box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.16);
      color: #7a1610;
    }
    :host([data-umbradesktop-theme='macos']) .x svg {
      width: 8px;
      height: 8px;
      stroke-width: 1.6;
      opacity: 0;
    }
    :host([data-umbradesktop-theme='macos']) .x:hover svg,
    :host([data-umbradesktop-theme='macos']) .x:focus-visible svg {
      opacity: 1;
    }

    :host([data-umbradesktop-theme='win11']) .panel {
      border-radius: 8px;
    }

    /* Windows 98: a group box, the headline sitting on the groove like a legend, and bevelled controls. */
    :host([data-umbradesktop-theme='win98']) .panel {
      border-radius: 0;
      box-shadow:
        inset -1px -1px #000,
        inset 1px 1px #dfdfdf,
        inset -2px -2px #808080,
        inset 2px 2px #fff;
    }
    :host([data-umbradesktop-theme='win98']) section {
      border-radius: 0;
      border-color: #808080;
      background: transparent;
      box-shadow: inset 1px 1px #fff, 1px 1px #fff;
    }
    :host([data-umbradesktop-theme='win98']) h3 {
      box-shadow: none;
    }
    :host([data-umbradesktop-theme='win98']) .done {
      border-radius: 0;
      background: #c0c0c0;
      color: #000;
      box-shadow:
        inset -1px -1px #000,
        inset 1px 1px #fff,
        inset -2px -2px #808080,
        inset 2px 2px #dfdfdf;
    }
    :host([data-umbradesktop-theme='win98']) .x i,
    :host([data-umbradesktop-theme='win98']) .x:hover i {
      width: 16px;
      height: 14px;
      border-radius: 0;
      background: #c0c0c0;
      color: #000;
      box-shadow:
        inset -1px -1px #000,
        inset 1px 1px #fff,
        inset -2px -2px #808080,
        inset 2px 2px #dfdfdf;
    }
    :host([data-umbradesktop-theme='win98']) .x svg {
      width: 8px;
      height: 8px;
      stroke-width: 1.6;
    }
    :host([data-umbradesktop-theme='win98']) .x:active i {
      box-shadow:
        inset 1px 1px #000,
        inset -1px -1px #fff,
        inset 2px 2px #808080,
        inset -2px -2px #dfdfdf;
    }
    :host([data-umbradesktop-theme='win98']) .switch {
      border-radius: 0;
    }
    :host([data-umbradesktop-theme='win98']) .knob {
      border-radius: 0;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so templates type-check. */
    'umbracoffee-settings': UmbraCoffeeSettingsDialogElement;
  }
}
