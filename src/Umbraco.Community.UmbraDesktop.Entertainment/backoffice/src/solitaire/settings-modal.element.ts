/**
 * Solitaire's settings (design D6): draw mode, card back and card faces. Rendered inside the game's
 * own shadow root and laid over its table, never over the desktop, because it only concerns this
 * window. A native <dialog> is not used: `showModal()` puts it in the top layer over the whole page.
 * Changes are reported as they are made; the game applies and stores them.
 */
import { css, customElement, html, nothing, property, unsafeSVG } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type { DrawCount } from './rules.js';

/** A back as the modal shows it. */
export interface BackChoice { readonly alias: string; readonly label: string; readonly image: string }
/** A face set as the modal shows it. */
export interface FacesChoice { readonly alias: string; readonly label: string; readonly preview: string }

/** Localisation area. */
const AREA = 'umbraDesktopEntertainment';

@customElement('umbradesktop-solitaire-settings')
export class SolitaireSettingsModalElement extends UmbLitElement {
  /** The draw mode the next game will use. */
  @property({ attribute: false }) drawCount: DrawCount = 1;
  /** Every registered back, resolved for the current theme. */
  @property({ attribute: false }) backs: ReadonlyArray<BackChoice> = [];
  /** Every registered face set. */
  @property({ attribute: false }) faces: ReadonlyArray<FacesChoice> = [];
  /** The chosen back's alias. */
  @property({ attribute: false }) selectedBack = '';
  /** The chosen face set's alias. */
  @property({ attribute: false }) selectedFaces = '';
  /**
   * Whether to offer the Arcade's leaderboard: only when the Arcade is there (design P6). The game
   * knows that and this dialog does not, so the game says; without it the dialog is as it always was.
   */
  @property({ attribute: false }) showLeaderboard = false;
  /**
   * The active theme id. The desktop stamps it on the game, not on this child, and a theme-specific
   * rule (Windows 98's group boxes) can only match a host attribute, so the game passes it on.
   */
  @property({ attribute: 'data-umbradesktop-theme', reflect: true }) theme?: string;

  /**
   * Focus the first control, so keyboard users land inside.
   *
   * Called after the element's first update, when all properties are available. Focuses the first
   * button (a draw mode) so keyboard users can navigate the modal without a mouse.
   */
  protected override firstUpdated(): void {
    this.shadowRoot?.querySelector<HTMLElement>('button')?.focus();
  }

  /**
   * Report one change.
   *
   * Dispatches a custom event when the user makes a setting change. The game listens for this and
   * applies the new value.
   * @param detail The changed field(s).
   */
  #change(detail: Partial<{ drawCount: DrawCount; back: string; faces: string }>): void {
    this.dispatchEvent(new CustomEvent('solitaire-settings-change', { detail, bubbles: true, composed: true }));
  }

  /**
   * Ask the game to close the modal.
   *
   * Dispatched when the user clicks Done or presses Escape. The game listens for this and removes
   * the modal from the DOM.
   */
  #close(): void {
    this.dispatchEvent(new CustomEvent('solitaire-settings-close', { bubbles: true, composed: true }));
  }

  /**
   * Ask the game for the Arcade's leaderboard. The game closes this dialog and opens the panel on
   * the draw mode being played, which only the game knows (the dialog's draw mode is the next game's).
   */
  #leaderboard(): void {
    this.dispatchEvent(new CustomEvent('solitaire-settings-leaderboard', { bubbles: true, composed: true }));
  }

  /**
   * Handle keydown on the dialog: close on Escape, wrap Tab focus at both ends.
   *
   * Attached to the dialog element's keydown event. Escape is the standard way to dismiss a modal.
   * The handler stops propagation so Escape does not bubble up to the game element.
   */
  #onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.#close();
    } else if (event.key === 'Tab') {
      // aria-modal promises focus stays inside, so wrap at both ends.
      const buttons = Array.from(this.shadowRoot?.querySelectorAll<HTMLElement>('button') ?? []);
      if (buttons.length === 0) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      const active = this.shadowRoot?.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  /**
   * Resolve a label that may be a `#` token or a literal.
   *
   * `label` from a manifest can be a `#area_key` token (which the backoffice will substitute) or
   * a literal label. This method resolves the token, returning the label unchanged if it is not one.
   * @param label The label from the manifest.
   * @returns The resolved label.
   */
  #label(label: string): string {
    return this.localize.string(label);
  }

  /**
   * Render the settings modal.
   *
   * The render method creates the dialog UI, with three sections for game settings (draw mode),
   * card back selection, and card face selection, and with the Arcade a fourth, Leaderboard, whose
   * one button is a plain action like Done rather than a toggle. Each option is an `aria-pressed` button. The
   * scrim background closes the modal on click. Buttons are laid out in a segmented group for
   * draw mode and a grid of choices for backs and faces.
   */
  override render() {
    const t = (key: string, fallback: string) => this.localize.termOrDefault(
      `${AREA}_${key}`,
      fallback,
    );
    return html`
      <div class="scrim" @click=${(e: Event) => e.target === e.currentTarget && this.#close()}>
        <div class="panel" role="dialog" aria-modal="true" aria-labelledby="title" @keydown=${this.#onKeydown}>
          <header>
            <h2 id="title">${t('solitaireSettingsTitle', 'Settings')}</h2>
            <button class="x" aria-label=${t('solitaireClose', 'Close')} @click=${() => this.#close()}>
              <svg class="glyph" viewBox="0 0 12 12" aria-hidden="true">
                <line x1="3" y1="3" x2="9" y2="9"></line><line x1="9" y1="3" x2="3" y2="9"></line>
              </svg>
            </button>
          </header>
          <section>
            <h3>${t('solitaireGame', 'Game')}</h3>
            <div class="seg">
              ${([1, 3] as const).map(
                (n) => html`<button data-draw=${n} aria-pressed=${String(this.drawCount === n)}
                  @click=${() => { this.drawCount = n; this.#change({ drawCount: n }); }}>
                  ${n === 1 ? t('solitaireDrawOne', 'Draw one') : t('solitaireDrawThree', 'Draw three')}
                </button>`,
              )}
            </div>
            <p class="help">${t('solitaireDrawNextGame', 'A change here starts with your next game.')}</p>
          </section>
          <section>
            <h3>${t('solitaireCardBack', 'Card back')}</h3>
            <div class="choices">
              ${this.backs.map(
                (b) => {
                  const pressed = String(this.selectedBack === b.alias);
                  return html`<button class="choice" data-back=${b.alias} aria-pressed=${pressed}
                    @click=${() => { this.selectedBack = b.alias; this.#change({ back: b.alias }); }}>
                    <span class="thumb"><img src=${b.image} alt="" /></span><span>${this.#label(b.label)}</span>
                  </button>`;
                },
              )}
            </div>
          </section>
          <section>
            <h3>${t('solitaireCardFaces', 'Card faces')}</h3>
            <div class="choices">
              ${this.faces.map(
                (f) => {
                  const pressed = String(this.selectedFaces === f.alias);
                  return html`<button class="choice" data-faces=${f.alias} aria-pressed=${pressed}
                    @click=${() => { this.selectedFaces = f.alias; this.#change({ faces: f.alias }); }}>
                    <span class="thumb">${unsafeSVG(f.preview)}</span><span>${this.#label(f.label)}</span>
                  </button>`;
                },
              )}
            </div>
          </section>
          ${this.showLeaderboard
            ? html`<section>
                <h3>${t('solitaireLeaderboard', 'Leaderboard')}</h3>
                <button class="leaderboard" data-action="leaderboard" @click=${() => this.#leaderboard()}>
                  ${t('solitaireShowLeaderboard', 'Show the leaderboard')}
                </button>
              </section>`
            : nothing}
          <footer><button class="done" @click=${() => this.#close()}>${t('solitaireDone', 'Done')}</button></footer>
        </div>
      </div>
    `;
  }

  /**
   * Style the modal: a scrim (darkened backdrop), a centered panel with a grid of choices, and
   * buttons styled as toggles when selected. The panel scrolls if its content exceeds the viewport.
   * Theming tokens from the app container give the modal's appearance.
   */
  static override styles = css`
    :host { position: absolute; inset: 0; z-index: 20; }
    .scrim { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      background: rgb(10 14 36 / 55%); backdrop-filter: blur(3px); }
    .panel { width: min(560px, calc(100% - 32px)); max-height: calc(100% - 32px); overflow: auto;
      background: var(--umbradesktop-app-surface, var(--uui-color-surface));
      color: var(--umbradesktop-app-text, var(--uui-color-text));
      font-family: var(--umbradesktop-app-font, inherit);
      border: var(--umbradesktop-app-edge-width, 1px) solid var(--umbradesktop-app-edge-dark, var(--uui-color-border));
      border-radius: calc(var(--umbradesktop-app-radius, 3px) * 3);
      box-shadow: 0 30px 70px rgb(0 0 0 / 45%); }
    header, footer { padding: 12px 20px; }
    header { display: flex; justify-content: space-between; align-items: center; }
    h2 { margin: 0; font-size: 18px; }
    /* A section is a box like Umbraco's uui-box: bordered, rounded, with a sentence-case headline in
       the normal text colour. Built from the app tokens rather than <uui-box> so a theme can reskin it. */
    section {
      margin: 0 20px 12px; padding: 14px 16px 16px;
      border: 1px solid var(--umbradesktop-app-border, var(--uui-color-border, #d8d7d9));
      border-radius: var(--umbradesktop-app-radius, 3px);
    }
    h3 { margin: 0 0 12px; font-size: 15px; font-weight: 600; letter-spacing: normal; text-transform: none; }
    /* Windows 98: a group box, the headline sitting on the groove like a legend. */
    :host([data-umbradesktop-theme='win98']) section {
      position: relative; margin-top: 16px; padding-top: 18px;
      border: 2px groove var(--umbradesktop-app-edge-dark, #808080); border-radius: 0;
    }
    :host([data-umbradesktop-theme='win98']) h3 {
      position: absolute; top: -9px; left: 8px; margin: 0; padding: 0 4px; font-size: 13px; font-weight: 400;
      line-height: 16px; background: var(--umbradesktop-app-surface, #c0c0c0);
    }
    button { font: inherit; color: inherit; cursor: pointer;
      background: var(--umbradesktop-app-surface-raised, var(--uui-color-surface-emphasis));
      border: var(--umbradesktop-app-edge-width, 1px) solid var(--umbradesktop-app-edge-dark, var(--uui-color-border));
      border-radius: var(--umbradesktop-app-radius, 3px); padding: 6px 14px; }
    button[aria-pressed='true'] { background: var(--umbradesktop-app-accent, var(--uui-color-selected));
      color: var(--umbradesktop-app-accent-text, var(--uui-color-surface)); }
    button:focus-visible {
      outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
      outline-offset: 2px;
    }
    .seg { display: inline-flex; gap: 4px; }
    .help {
      margin: 8px 0 0; font-size: 13px;
      color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
    }
    .choices { display: flex; flex-wrap: wrap; gap: 10px; }
    .choice {
      display: flex; flex-direction: column; align-items: center; gap: 6px; width: 80px;
      padding: 6px; font-size: 12px;
    }
    .thumb { display: block; width: 56px; height: 78px; }
    .thumb img, .thumb svg { width: 100%; height: 100%; border-radius: 5px; display: block; object-fit: cover; }
    footer { display: flex; justify-content: flex-end; }
    /* The close control is the desktop's own window close, not a form button: the same 12-unit
       cross the host's titlebar draws, flat at rest, and the theme's close-hover colours from the
       --umbradesktop-control-* tokens, so it reads as the close every window on this desktop has.
       Reset from the generic button rule above, which would otherwise give it a raised face. */
    .x {
      display: inline-flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; padding: 0; border: none; background: transparent;
      border-radius: var(--umbradesktop-app-radius, 3px);
      color: var(--umbradesktop-app-text, var(--uui-color-text));
    }
    .x .glyph { width: 14px; height: 14px; stroke: currentColor; stroke-width: 1.2; fill: none; stroke-linecap: square; }
    .x:hover {
      background: var(--umbradesktop-control-close-hover-background, var(--uui-color-danger, #d42054));
      color: var(--umbradesktop-control-close-hover-color, #fff);
    }
    /* macOS: the red traffic light, its cross shown only under the pointer, as on every window. */
    :host([data-umbradesktop-theme='macos']) .x {
      width: 12px; height: 12px; border-radius: 50%; background: #ff5f57;
      border: 0.5px solid rgba(0, 0, 0, 0.16); color: #7a1610;
    }
    :host([data-umbradesktop-theme='macos']) .x .glyph { width: 8px; height: 8px; stroke-width: 1.6; opacity: 0; }
    :host([data-umbradesktop-theme='macos']) .x:hover { background: #ff5f57; color: #7a1610; }
    :host([data-umbradesktop-theme='macos']) .x:hover .glyph,
    :host([data-umbradesktop-theme='macos']) .x:focus-visible .glyph { opacity: 1; }
    /* Windows 98: the small bevelled caption button, inverted while held. */
    :host([data-umbradesktop-theme='win98']) .x {
      width: 16px; height: 14px; border-radius: 0; background: #c0c0c0; color: #000;
      box-shadow: inset -1px -1px #000, inset 1px 1px #fff, inset -2px -2px #808080, inset 2px 2px #dfdfdf;
    }
    :host([data-umbradesktop-theme='win98']) .x .glyph { width: 8px; height: 8px; stroke-width: 1.6; }
    :host([data-umbradesktop-theme='win98']) .x:hover { background: #c0c0c0; color: #000; }
    :host([data-umbradesktop-theme='win98']) .x:active {
      box-shadow: inset 1px 1px #000, inset -1px -1px #fff, inset 2px 2px #808080, inset -2px -2px #dfdfdf;
    }
    :host([data-umbradesktop-theme='win98']) .x:active .glyph { transform: translate(1px, 1px); }
  `;
}

declare global {
  interface HTMLElementTagNameMap { 'umbradesktop-solitaire-settings': SolitaireSettingsModalElement }
}
