import { fallbackExplanation, welcomeLanguages } from '../languages';
import { manifests as desktopLocalizations } from '../../localization/manifest';
import { css, customElement, html, nothing, property, repeat } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbChangeEvent } from '@umbraco-cms/backoffice/event';

/**
 * The cultures the desktop has its own strings for, read from its localization registrations.
 *
 * Read from the manifests rather than kept as a list, so a new translation removes its mark from
 * the language page without anybody touching the page (design doc §3.2).
 */
const DESKTOP_CULTURES = desktopLocalizations.map((manifest) => manifest.meta.culture);

/**
 * The welcome wizard's language page: every backoffice language, alphabetical by its own name, the
 * current one selected (design doc D14).
 *
 * A language the desktop is not translated into ends its row in the desktop icon and "English". The
 * icon is the one on the header button that opens the desktop, so it already means "the desktop".
 * Hovering it says what that means for that language, and the same sentence is the mark's
 * accessible name and the choice's description, so a keyboard or screen reader user gets it as well
 * as a mouse.
 *
 * Native radios rather than buttons: arrow keys, one tab stop and "1 of 24" come with them.
 *
 * Presentational. The screen supplies the cultures and the current value, and saves the choice.
 */
@customElement('umbradesktop-welcome-language')
export class UmbraDesktopWelcomeLanguagePageElement extends UmbLitElement {
  /** The backoffice's registered cultures, in any case and order. */
  @property({ attribute: false })
  public cultures: ReadonlyArray<string> = [];

  /** The selected culture. Compared lowercased, since the profile and the registry disagree on case. */
  @property({ type: String })
  public value = '';

  /** Whether the list has been scrolled to the selection, which happens once, on first showing it. */
  #scrolled = false;

  /**
   * Take a new choice and report it.
   * @param culture The culture chosen.
   */
  #choose(culture: string): void {
    this.value = culture;
    this.dispatchEvent(new UmbChangeEvent());
  }

  /**
   * Scroll the selection into the middle of the list the first time it is on screen, so somebody
   * whose language is far down the alphabet sees it chosen without looking for it.
   *
   * By the list's own scroll position rather than `scrollIntoView`, which would also scroll every
   * ancestor, the desktop included.
   */
  override updated(changed: Map<string, unknown>): void {
    super.updated(changed);
    if (this.#scrolled) return;
    const list = this.renderRoot.querySelector<HTMLElement>('.list');
    const selected = this.renderRoot.querySelector<HTMLElement>('label.on');
    if (!list || !selected || list.clientHeight === 0) return;
    list.scrollTop = selected.offsetTop - (list.clientHeight - selected.offsetHeight) / 2;
    this.#scrolled = true;
  }

  override render() {
    const rows = welcomeLanguages(this.cultures, DESKTOP_CULTURES, (culture) =>
      this.localize.term(`uiCulture_${culture}`),
    );
    // A profile language with no dictionary of its own (en-gb, say) selects its base language, which
    // is the one the backoffice is actually showing. Core's culture picker does the same.
    const value = this.value.toLowerCase();
    const current = rows.some((row) => row.culture === value) ? value : value.split('-')[0];

    return html`
      <div class="list" role="radiogroup" aria-label=${this.localize.term('umbraDesktop_welcomeLanguageTitle')}>
        ${repeat(
          rows,
          (row) => row.culture,
          (row) => {
            const on = row.culture === current;
            const markId = `fallback-${row.culture}`;
            const explanation = row.desktopInEnglish
              ? fallbackExplanation(row.culture, this.localize.lang(), (key, ...args) => this.localize.term(key, ...args))
              : '';
            return html`
              <label class=${on ? 'on' : ''}>
                <input
                  type="radio"
                  name="language"
                  value=${row.culture}
                  .checked=${on}
                  aria-describedby=${row.desktopInEnglish ? markId : nothing}
                  @change=${() => this.#choose(row.culture)} />
                <span class="name">${row.name}</span>
                ${row.desktopInEnglish
                  ? html`<span
                      class="fallback"
                      id=${markId}
                      role="img"
                      title=${explanation}
                      aria-label=${explanation}>
                      <umb-icon name="icon-desktop"></umb-icon>
                      <span aria-hidden="true">${this.localize.term('umbraDesktop_welcomeLanguageEnglish')}</span>
                    </span>`
                  : nothing}
                ${on ? html`<uui-icon class="tick" name="check" aria-hidden="true"></uui-icon>` : nothing}
              </label>
            `;
          },
        )}
      </div>
    `;
  }

  static override styles = css`
    :host {
      display: block;
    }

    .list {
      width: min(420px, 100%);
      /* Grows with the screen, up to about ten rows, and leaves room for the head above and the
         button row below. A row cut off at the bottom says "there is more" without a scrollbar
         having to say it. */
      max-height: clamp(220px, calc(100vh - 400px), 420px);
      overflow-y: auto;
      margin: 0 auto;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.04);
      scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
    }

    label {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 40px;
      padding: 0 18px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      font-size: 15px;
      cursor: pointer;
    }
    label:last-child {
      border-bottom: 0;
    }
    label:hover {
      background: rgba(255, 255, 255, 0.06);
    }
    label.on {
      background: rgba(53, 68, 177, 0.55);
    }
    /* The radio itself is hidden: the row is the control, and the focus ring goes on the row. It
       sits inside its row, which is positioned for it. Positioned against the screen instead, it
       landed outside the list's scroll area, and focusing a language far down the list scrolled
       the whole wizard to it, off its own head and buttons. */
    label {
      position: relative;
    }
    input {
      position: absolute;
      inset: 0;
      margin: 0;
      opacity: 0;
      pointer-events: none;
    }
    label:has(input:focus-visible) {
      outline: 2px solid rgba(255, 255, 255, 0.92);
      outline-offset: -2px;
    }

    .name {
      flex: 1;
    }

    .fallback {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: rgba(255, 255, 255, 0.5);
    }
    label.on .fallback {
      color: rgba(255, 255, 255, 0.8);
    }
    .fallback umb-icon {
      font-size: 15px;
    }

    .tick {
      font-size: 15px;
    }
  `;
}

export default UmbraDesktopWelcomeLanguagePageElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-welcome-language': UmbraDesktopWelcomeLanguagePageElement;
  }
}
