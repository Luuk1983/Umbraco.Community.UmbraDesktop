import { UMBRADESKTOP_WELCOME_PAGES, welcomeButtons } from './steps';
import type { UmbraDesktopWelcomePage } from './steps';
import type { UmbraDesktopWelcomeChoices } from './choices';
import {
  UMBRADESKTOP_WELCOME_CLOSE_MS,
  UMBRADESKTOP_WELCOME_FADE_MS,
  UMBRADESKTOP_WELCOME_HOLD_MS,
} from './constants';
import { UMBRADESKTOP_Z_SYSTEM_SCREEN } from '../constants';
import {
  UMBRADESKTOP_MARK_PATH,
  UMBRADESKTOP_MARK_SIZE_AT_VIEWBOX,
  UMBRADESKTOP_MARK_VIEWBOX,
  UMBRADESKTOP_RING_DASHARRAY,
  UMBRADESKTOP_RING_RADIUS,
  UMBRADESKTOP_RING_STROKE_PX,
  UMBRADESKTOP_RING_VIEWBOX,
} from '../loader-ring';
import { UMBRADESKTOP_DEFAULT_THEME_ID } from '../theme/themes/index';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../settings/settings.context-token';
import type { UmbraDesktopWelcomeLanguagePageElement } from './pages/language-page.element';
import type { UmbraDesktopWelcomeThemePageElement } from './pages/theme-page.element';
import type { UmbraDesktopWelcomeSignInPageElement } from './pages/sign-in-page.element';
import './pages/language-page.element.js';
import './pages/theme-page.element.js';
import './pages/sign-in-page.element.js';
import { css, customElement, html, nothing, property, state, svg, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import { UMB_CURRENT_USER_CONTEXT, UmbCurrentUserRepository } from '@umbraco-cms/backoffice/current-user';

/**
 * Fired on Done, carrying what the wizard ended on, for the desktop to apply and save. The screen
 * stays up, fading, until it fires {@link UMBRADESKTOP_WELCOME_DISMISS_EVENT}: the chosen theme is
 * applied behind it in the meantime, so the fade reveals the desktop already wearing it.
 */
export const UMBRADESKTOP_WELCOME_FINISH_EVENT = 'umbradesktop-welcome-finish';

/** Fired once the screen has faded, for the desktop to take it away. Carries nothing. */
export const UMBRADESKTOP_WELCOME_DISMISS_EVENT = 'umbradesktop-welcome-dismiss';

/** Where the greeting stands: the wizard has not reached its first page yet. */
const GREETING = -1;

/** The ring's circumference in viewBox units, which is the dash length of a closed ring. */
const RING_CIRCUMFERENCE = 2 * Math.PI * UMBRADESKTOP_RING_RADIUS;

/** The circle both of the ring's strokes are drawn on, centred in its viewBox. */
const RING_CENTRE = UMBRADESKTOP_RING_VIEWBOX / 2;

/**
 * Whether the person has asked for less motion. Read when it matters rather than once, because it
 * can change while the page is open.
 * @returns True when animation should be left out.
 */
function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * The welcome wizard: a greeting, then three pages, shown once to somebody new to the desktop.
 *
 * Full screen and theme-neutral, the boot splash's and the migration screen's sibling (design doc
 * D1, D8): it is choosing the theme, so painting it in one of the five would prejudge the answer.
 * Owned by the desktop element, which makes everything behind it inert, never by the launcher,
 * whose modals lose their context on the first click.
 *
 * **The greeting** is the boot splash's mark and arc, drawn here rather than handed over from the
 * splash, because somebody entering through the header icon never sees the splash. The arc closes
 * into a full ring, **Welcome** fades in, and after {@link UMBRADESKTOP_WELCOME_HOLD_MS} the first
 * page follows by itself. A click or any key goes straight to it (D9, D12).
 *
 * **The pages** each show a visible default, so the one main button always means "go on with that":
 * Next, and Done on the last page. It sits bottom right and never moves, Back sits bottom left from
 * the second page, and three dots between them say how short this is (D4, D13).
 *
 * **Saving** is split by where each answer lives. The language is the user's Umbraco profile and is
 * saved the moment it is chosen, which also switches the wizard into it. The theme and the sign-in
 * switch are desktop settings, and go to the desktop on Done as one write.
 */
@customElement('umbradesktop-welcome-screen')
export class UmbraDesktopWelcomeScreenElement extends UmbLitElement {
  /** How long the greeting holds before moving on, in milliseconds. A property so a test can shorten it. */
  @property({ type: Number })
  public holdMs = UMBRADESKTOP_WELCOME_HOLD_MS;

  /** Which page is showing: {@link GREETING}, or an index into {@link UMBRADESKTOP_WELCOME_PAGES}. */
  @state()
  private _page = GREETING;

  /** The backoffice's registered cultures, for the language page. */
  @state()
  private _cultures: ReadonlyArray<string> = [];

  /** The user's backoffice language. */
  @state()
  private _language = '';

  /** The theme the wizard will finish on. */
  @state()
  private _theme = UMBRADESKTOP_DEFAULT_THEME_ID;

  /** Whether the desktop should open on sign-in, as the wizard will finish on it. */
  @state()
  private _bootIntoDesktop = false;

  /** Whether Done has been pressed and the screen is fading off the desktop. */
  @state()
  private _leaving = false;

  /** Whether the person has changed the theme or the switch, after which the settings no longer seed them. */
  #touched = false;

  /** The greeting's timer, while it runs. */
  #hold?: number;

  constructor() {
    super();

    // The same list core's culture picker offers, and the same source: one culture per registered
    // dictionary, repeats included, which `welcomeLanguages` folds.
    this.observe(umbExtensionsRegistry.byType('localization'), (manifests) => {
      this._cultures = manifests
        .map((manifest) => manifest.meta?.culture)
        .filter((culture): culture is string => !!culture);
    });

    this.consumeContext(UMB_CURRENT_USER_CONTEXT, (context) => {
      if (!context) return;
      this.observe(context.currentUser, (user) => {
        if (user?.languageIsoCode) this._language = user.languageIsoCode;
      });
    });

    // Seeded from the settings in force, which for a new user are the defaults. Only until the
    // person touches a control: a late emission must not undo a choice.
    this.consumeContext(UMBRADESKTOP_SETTINGS_CONTEXT, (context) => {
      if (!context) return;
      this.observe(context.theme, (theme) => {
        if (!this.#touched && theme) this._theme = theme;
      });
      this.observe(context.bootIntoDesktop, (boot) => {
        if (!this.#touched) this._bootIntoDesktop = boot === true;
      });
    });
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // On the window, not the screen: during the greeting nothing inside the screen has focus, so a
    // key press lands on whatever had it before, and the desktop behind is inert.
    window.addEventListener('keydown', this.#onKey);
    if (this._page === GREETING) this.#hold = window.setTimeout(() => this.#leaveGreeting(), this.holdMs);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.#onKey);
    window.clearTimeout(this.#hold);
  }

  /**
   * Any key moves on from the greeting. Only from the greeting: on the pages, keys belong to the
   * controls.
   */
  #onKey = () => {
    if (this._page === GREETING) this.#leaveGreeting();
  };

  /** Go from the greeting to the first page, once. */
  #leaveGreeting(): void {
    window.clearTimeout(this.#hold);
    if (this._page === GREETING) this._page = 0;
  }

  /** The main button: the next page, or finish on the last one. */
  #next = () => {
    if (welcomeButtons(this._page).last) {
      this.#finish();
      return;
    }
    this._page++;
  };

  /** Back one page. */
  #back = () => {
    if (this._page > 0) this._page--;
  };

  /**
   * Hand the choices to the desktop and fade out.
   *
   * Once only: a second press during the fade would apply and save the same settings again.
   */
  #finish(): void {
    if (this._leaving) return;
    this._leaving = true;

    const choices: UmbraDesktopWelcomeChoices = { theme: this._theme, bootIntoDesktop: this._bootIntoDesktop };
    this.dispatchEvent(
      new CustomEvent<UmbraDesktopWelcomeChoices>(UMBRADESKTOP_WELCOME_FINISH_EVENT, {
        detail: choices,
        bubbles: true,
        composed: true,
      }),
    );

    window.setTimeout(
      () => this.dispatchEvent(new CustomEvent(UMBRADESKTOP_WELCOME_DISMISS_EVENT, { bubbles: true, composed: true })),
      reducedMotion() ? 0 : UMBRADESKTOP_WELCOME_FADE_MS,
    );
  }

  /**
   * Save the chosen language to the user's profile straight away.
   *
   * The same call the Language settings category makes. Saving it updates the current user, and the
   * current-user context loads that language's dictionaries, which re-renders everything localized,
   * this wizard included. A failed save has already been reported by the repository, and the list
   * goes back to the language actually in force.
   * @param event The language page's change event.
   */
  #onLanguage = async (event: Event) => {
    const chosen = (event.target as UmbraDesktopWelcomeLanguagePageElement).value;
    const previous = this._language;
    if (!chosen || chosen === previous.toLowerCase()) return;
    this._language = chosen;

    const { error } = await new UmbCurrentUserRepository(this).updateProfile(chosen);
    if (error) this._language = previous;
  };

  /**
   * Take a new theme.
   * @param event The theme page's change event.
   */
  #onTheme = (event: Event) => {
    this.#touched = true;
    this._theme = (event.target as UmbraDesktopWelcomeThemePageElement).value;
  };

  /**
   * Take the switch.
   * @param event The sign-in page's change event.
   */
  #onSignIn = (event: Event) => {
    this.#touched = true;
    this._bootIntoDesktop = (event.target as UmbraDesktopWelcomeSignInPageElement).checked;
  };

  /**
   * Put focus on the main button whenever a page appears, so Enter goes on and a screen reader
   * starts inside the wizard rather than behind it.
   * @param changed The properties that changed.
   */
  override updated(changed: Map<string, unknown>): void {
    super.updated(changed);
    if (!changed.has('_page') || this._page === GREETING) return;

    // `uui-button.focus()` awaits its own render, and rejects if called before its inner button
    // exists. Swallowed for the reason the migration screen gives: focus is a courtesy.
    const button = this.renderRoot.querySelector<HTMLElement & { focus(): void | Promise<void> }>('.main');
    void Promise.resolve(button?.focus()).catch(() => undefined);
  }

  /**
   * The boot splash's ring, closing, with the mark inside it.
   * @returns The SVG.
   */
  #renderRing() {
    return html`<div class="ring-wrap">
      <svg class="ring" viewBox="0 0 ${UMBRADESKTOP_RING_VIEWBOX} ${UMBRADESKTOP_RING_VIEWBOX}" aria-hidden="true">
        ${svg`<circle class="track" cx=${RING_CENTRE} cy=${RING_CENTRE} r=${UMBRADESKTOP_RING_RADIUS}></circle>
          <circle class="arc" cx=${RING_CENTRE} cy=${RING_CENTRE} r=${UMBRADESKTOP_RING_RADIUS}></circle>`}
      </svg>
      <svg class="mark" viewBox=${UMBRADESKTOP_MARK_VIEWBOX} aria-hidden="true">${svg`<path d=${UMBRADESKTOP_MARK_PATH}></path>`}</svg>
    </div>`;
  }

  /**
   * The greeting. Clicking anywhere on it moves on.
   * @returns The greeting.
   */
  #renderGreeting() {
    return html`<div class="greeting" data-page="greeting" @click=${() => this.#leaveGreeting()}>
      ${this.#renderRing()}
      <div class="words">
        <p class="word">${this.localize.term('umbraDesktop_welcomeTitle')}</p>
        <p class="lead">${this.localize.term('umbraDesktop_welcomeLead')}</p>
      </div>
    </div>`;
  }

  /**
   * The title and sentence at the top of a page.
   * @param page The page.
   * @returns The keys for its title and sentence.
   */
  #headKeys(page: UmbraDesktopWelcomePage): { title: string; about: string } {
    switch (page) {
      case 'language':
        return { title: 'umbraDesktop_welcomeLanguageTitle', about: 'umbraDesktop_welcomeLanguageAbout' };
      case 'theme':
        return { title: 'umbraDesktop_welcomeThemeTitle', about: 'umbraDesktop_welcomeThemeAbout' };
      case 'sign-in':
        return { title: 'umbraDesktop_welcomeSignInTitle', about: 'umbraDesktop_welcomeSignInAbout' };
    }
  }

  /**
   * A page's own control.
   * @param page The page.
   * @returns Its element.
   */
  #renderBody(page: UmbraDesktopWelcomePage) {
    switch (page) {
      case 'language':
        return html`<umbradesktop-welcome-language
          .cultures=${this._cultures}
          .value=${this._language || this.localize.lang()}
          @change=${this.#onLanguage}></umbradesktop-welcome-language>`;
      case 'theme':
        return html`<umbradesktop-welcome-theme
          .value=${this._theme}
          @change=${this.#onTheme}></umbradesktop-welcome-theme>`;
      case 'sign-in':
        return html`<umbradesktop-welcome-sign-in
          .checked=${this._bootIntoDesktop}
          @change=${this.#onSignIn}></umbradesktop-welcome-sign-in>`;
    }
  }

  /**
   * One page: its head, its control, and the button row.
   * @returns The page.
   */
  #renderPage() {
    const page = UMBRADESKTOP_WELCOME_PAGES[this._page];
    const buttons = welcomeButtons(this._page);
    const head = this.#headKeys(page);
    const total = UMBRADESKTOP_WELCOME_PAGES.length;

    return html`<div class="page" data-page=${page}>
      <div class="head">
        <svg class="mini-mark" viewBox=${UMBRADESKTOP_MARK_VIEWBOX} aria-hidden="true">${svg`<path d=${UMBRADESKTOP_MARK_PATH}></path>`}</svg>
        <!-- An h2: the backoffice owns the page's h1, and this is a dialog's title, not the page's. -->
        <h2 id="welcome-title">${this.localize.term(head.title)}</h2>
        <p class="about">${this.localize.term(head.about)}</p>
      </div>
      <div class="body">${this.#renderBody(page)}</div>
      <div class="foot">
        ${buttons.back
          ? html`<button type="button" class="back" @click=${this.#back}>
              ${this.localize.term('umbraDesktop_welcomeBack')}
            </button>`
          : nothing}
        <div class="dots" role="img" aria-label=${this.localize.term('umbraDesktop_welcomeStep', this._page + 1, total)}>
          ${UMBRADESKTOP_WELCOME_PAGES.map((_, index) => html`<i class=${index === this._page ? 'on' : ''}></i>`)}
        </div>
        <uui-button
          class="main"
          look="primary"
          label=${this.localize.term(buttons.primaryKey)}
          @click=${this.#next}></uui-button>
      </div>
    </div>`;
  }

  override render() {
    return html`
      <div
        class="screen ${this._leaving ? 'leaving' : ''}"
        role="dialog"
        aria-modal="true"
        aria-label=${this.localize.term('umbraDesktop_welcomeLabel')}>
        ${this._page === GREETING ? this.#renderGreeting() : this.#renderPage()}
      </div>
    `;
  }

  static override styles = css`
    /* Absolute, covering the desktop it belongs to, for the reason the migration screen gives. */
    :host {
      position: absolute;
      inset: 0;
      z-index: ${UMBRADESKTOP_Z_SYSTEM_SCREEN};
      display: block;
      color: #fff;
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      /* The backoffice's primary colour is its dark navy, which disappears on this ground. The
         brighter Umbraco blue the boot splash's world already uses, for every uui control inside. */
      --uui-color-default: #3544b1;
      --uui-color-default-emphasis: #2152a3;
      --uui-color-default-contrast: #fff;
      --uui-color-focus: rgba(255, 255, 255, 0.92);
    }

    /* The splash's own ground and lift, as the migration screen writes them, for the same reason. */
    .screen {
      position: absolute;
      inset: 0;
      overflow: auto;
      background-color: #0b1024;
      background-image:
        radial-gradient(60% 72% at 50% 46%, rgba(38, 56, 111, 0.3) 0%, transparent 70%),
        radial-gradient(80% 90% at 50% 48%, transparent 38%, rgba(3, 5, 14, 0.7) 100%);
      opacity: 1;
      transition: opacity ${UMBRADESKTOP_WELCOME_FADE_MS}ms ease;
    }
    .screen.leaving {
      opacity: 0;
      pointer-events: none;
    }

    /* The greeting. The ring is centred on the screen exactly as the splash centres its own, and the
       word hangs below it out of flow, so the ring sits where the splash's was. */
    .greeting {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      cursor: default;
    }
    .ring-wrap {
      position: relative;
      width: ${UMBRADESKTOP_RING_VIEWBOX}px;
      height: ${UMBRADESKTOP_RING_VIEWBOX}px;
      display: grid;
      place-items: center;
    }
    .ring {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
    .track,
    .arc {
      fill: none;
      stroke-width: ${UMBRADESKTOP_RING_STROKE_PX};
    }
    .track {
      stroke: rgba(255, 255, 255, 0.14);
    }
    .arc {
      stroke: rgba(255, 255, 255, 0.92);
      stroke-linecap: round;
      stroke-dasharray: ${unsafeCSS(RING_CIRCUMFERENCE.toFixed(3))} ${unsafeCSS(RING_CIRCUMFERENCE.toFixed(3))};
      transform-origin: ${RING_CENTRE}px ${RING_CENTRE}px;
      transform: rotate(-90deg);
      animation: umbradesktop-welcome-close ${UMBRADESKTOP_WELCOME_CLOSE_MS}ms cubic-bezier(0.2, 0.7, 0.3, 1) both;
    }
    .mark {
      width: ${UMBRADESKTOP_MARK_SIZE_AT_VIEWBOX}px;
      height: ${UMBRADESKTOP_MARK_SIZE_AT_VIEWBOX}px;
      fill: #fff;
      filter: drop-shadow(0 8px 24px rgba(0, 0, 0, 0.45));
    }
    /* Out of flow, below the ring, so the ring keeps the splash's centre whatever the words say. */
    .words {
      position: absolute;
      left: 24px;
      right: 24px;
      top: calc(50% + ${UMBRADESKTOP_RING_VIEWBOX / 2}px + 26px);
      text-align: center;
    }
    .word {
      margin: 0;
      font-size: 40px;
      font-weight: 600;
      line-height: 1.1;
      animation: umbradesktop-welcome-word 600ms ease-out ${UMBRADESKTOP_WELCOME_CLOSE_MS - 200}ms both;
    }
    /* After the name, so the two read in order: who this is, then what happens next. */
    .lead {
      margin: 14px auto 0;
      max-width: 44ch;
      font-size: 17px;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.78);
      animation: umbradesktop-welcome-word 600ms ease-out ${UMBRADESKTOP_WELCOME_CLOSE_MS + 500}ms both;
    }

    /* From the splash's quarter arc to a full ring, coming round as it closes. */
    @keyframes umbradesktop-welcome-close {
      from {
        stroke-dasharray: ${unsafeCSS(UMBRADESKTOP_RING_DASHARRAY)};
        transform: rotate(-270deg);
      }
      to {
        stroke-dasharray: ${unsafeCSS(RING_CIRCUMFERENCE.toFixed(3))} ${unsafeCSS(RING_CIRCUMFERENCE.toFixed(3))};
        transform: rotate(-90deg);
      }
    }
    @keyframes umbradesktop-welcome-word {
      from {
        opacity: 0;
        transform: translateY(6px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }

    /* A page: head at the top, control in the middle, button row pinned to the bottom. */
    .page {
      min-height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 52px 24px 0;
      box-sizing: border-box;
      animation: umbradesktop-welcome-word 220ms ease-out both;
    }
    .head {
      text-align: center;
    }
    .mini-mark {
      width: 34px;
      height: 34px;
      fill: rgba(255, 255, 255, 0.9);
    }
    h2 {
      margin: 18px 0 0;
      font-size: 28px;
      font-weight: 600;
      line-height: 1.2;
    }
    .about {
      margin: 10px auto 0;
      max-width: 52ch;
      font-size: 15px;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.72);
    }
    .body {
      width: 100%;
      margin: 30px 0;
      flex: 1;
    }

    /* Three columns, so the dots are centred however wide Back is and the main button's slot is
       the same on every page: it is in the last column, against the right edge, always. */
    .foot {
      position: sticky;
      bottom: 0;
      width: 100%;
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      padding: 0 24px 36px;
      box-sizing: border-box;
    }
    .back {
      grid-column: 1;
      justify-self: start;
      padding: 10px 4px;
      border: 0;
      background: none;
      color: rgba(255, 255, 255, 0.72);
      font: inherit;
      font-size: 15px;
      cursor: pointer;
    }
    .back:hover {
      color: #fff;
    }
    .back:focus-visible {
      outline: 2px solid rgba(255, 255, 255, 0.92);
      outline-offset: 2px;
      border-radius: 3px;
    }
    .dots {
      grid-column: 2;
      display: flex;
      gap: 8px;
    }
    .dots i {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.24);
    }
    .dots i.on {
      background: rgba(255, 255, 255, 0.92);
    }
    .main {
      grid-column: 3;
      justify-self: end;
      /* Wide enough for Done, Next and their translations alike, so the button does not change
         size from page to page and the place you click stays the place you click. */
      min-width: 120px;
      --uui-button-height: 42px;
      --uui-button-font-weight: 600;
    }

    @media (prefers-reduced-motion: reduce) {
      /* The closed ring and the word, still, for the same time. */
      .arc,
      .word,
      .lead,
      .page {
        animation: none;
      }
      .screen {
        transition: none;
      }
    }
  `;
}

export default UmbraDesktopWelcomeScreenElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-welcome-screen': UmbraDesktopWelcomeScreenElement;
  }
}
