import type { UmbraDesktopApp } from '../types';
import { alphabetise, filterApps } from './alphabet';
import { css, html } from '@umbraco-cms/backoffice/external/lit';
import type { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * Escape in a filter field: with text in it, clear the text and stop the key there; empty, let it
 * through, so the taskbar closes the launcher exactly as Escape does anywhere else. One press undoes
 * the typing rather than throwing the whole panel away with it, and a second press still gets out.
 * Shared by the drawer's filter and the palette's.
 * @param e The key event.
 * @param clear Empties the filter and redraws.
 */
export function escapeClearsFilter(e: KeyboardEvent, clear: () => void): void {
  const input = e.target as HTMLInputElement;
  if (e.key !== 'Escape' || input.value === '') return;
  e.preventDefault();
  e.stopPropagation();
  input.value = '';
  clear();
}

/**
 * All apps (design §3.2): the drawer that replaces the launcher's body with every app the user may
 * open, alphabetical and filterable.
 *
 * A controller rendering into the launcher's own shadow root rather than an element of its own, so
 * the theme's launcher sheet reaches it (see design §7, and `theme/theme-styles.controller.ts`).
 */
export class UmbraDesktopDrawerController {
  /** The launcher this renders into. */
  #host: UmbLitElement;

  /** What the user has typed into the filter. Cleared each time the drawer opens. */
  #query = '';

  /** What a row and the Back button do; the launcher owns both. */
  #actions: { launch(app: UmbraDesktopApp): void; back(): void };

  /**
   * Wire the controller to the launcher it renders into and to what its two controls do.
   * @param host The launcher.
   * @param actions What a row click and Back do.
   */
  constructor(host: UmbLitElement, actions: { launch(app: UmbraDesktopApp): void; back(): void }) {
    this.#host = host;
    this.#actions = actions;
  }

  /** Start fresh: an empty filter each time the drawer is opened. */
  reset(): void {
    this.#query = '';
  }

  /** Put the caret in the filter, so typing filters straight away. Call after the host has rendered. */
  focus(): void {
    this.#host.shadowRoot?.querySelector<HTMLInputElement>('.drawer-filter')?.focus();
  }

  /**
   * The translated name, which is what the drawer sorts and filters on.
   * @param app The app.
   * @returns Its name in the backoffice language.
   */
  #nameOf = (app: UmbraDesktopApp): string => this.#host.localize.string(app.name);

  /**
   * The header row and body for drawer mode.
   * @param apps Every app the user may open.
   * @returns The template.
   */
  render(apps: ReadonlyArray<UmbraDesktopApp>) {
    const localize = this.#host.localize;
    const sections = alphabetise(filterApps(apps, this.#nameOf, this.#query), this.#nameOf, localize.lang());
    return html`
      <div class="hdr">
        <button class="ctl back" @click=${() => this.#actions.back()}>
          <umb-icon name="icon-arrow-left"></umb-icon>
          <span>${localize.term('umbraDesktop_back')}</span>
        </button>
        <input
          class="search drawer-filter"
          type="search"
          .value=${this.#query}
          placeholder=${localize.term('umbraDesktop_filterApps')}
          aria-label=${localize.term('umbraDesktop_filterApps')}
          @input=${(e: Event) => {
            this.#query = (e.target as HTMLInputElement).value;
            this.#host.requestUpdate();
          }}
          @keydown=${(e: KeyboardEvent) =>
            escapeClearsFilter(e, () => {
              this.#query = '';
              this.#host.requestUpdate();
            })} />
      </div>
      <div class="body drawer">
        ${sections.length === 0 ? html`<p class="empty-note">${localize.term('umbraDesktop_noAppsMatch')}</p>` : ''}
        <div class="alpha">
          ${sections.map(
            (section) => html`
              <div class="letter">
                <div class="lh">${section.letter}</div>
                ${section.apps.map(
                  (app) => html`
                    <button class="row" data-alias=${app.alias} @click=${() => this.#actions.launch(app)}>
                      <umb-icon name=${app.icon}></umb-icon>
                      <span class="row-name">${this.#nameOf(app)}</span>
                    </button>
                  `,
                )}
              </div>
            `,
          )}
        </div>
      </div>
    `;
  }
}

/**
 * The drawer's CSS, included in the launcher's `static styles`. Columns flow like a phone's contact
 * list: as many as fit, each letter kept together.
 */
export const drawerStyles = css`
  .alpha {
    columns: 4 200px;
    column-gap: var(--uui-size-space-5);
  }
  .letter {
    break-inside: avoid;
    margin-bottom: var(--uui-size-space-3);
  }
  .lh {
    padding: var(--uui-size-space-1) var(--uui-size-space-2);
    margin-bottom: var(--uui-size-space-1);
    border-bottom: var(--umbradesktop-launcher-letter-border, var(--umbradesktop-launcher-card-border, 1px solid var(--uui-color-border)));
    color: var(--umbradesktop-launcher-letter-text, var(--umbradesktop-launcher-text, var(--uui-color-text)));
    font-weight: 700;
    font-size: var(--uui-type-small-size);
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--uui-size-space-3);
    width: 100%;
    padding: var(--uui-size-space-2);
    border: none;
    border-radius: var(--uui-border-radius, 3px);
    background: transparent;
    color: var(--umbradesktop-launcher-text, var(--uui-color-text));
    font-family: inherit;
    font-size: var(--uui-type-small-size);
    text-align: left;
    cursor: pointer;
  }
  .row:hover {
    background: var(--umbradesktop-launcher-hover-background, var(--uui-color-surface-alt, rgba(0, 0, 0, 0.05)));
  }
  .row umb-icon {
    flex-shrink: 0;
    font-size: 20px;
  }
  .row-name {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  /* It shares the base .search rule, whose pointer cursor is right for a button but wrong for a
     field the user types into. */
  .drawer-filter {
    cursor: text;
  }
  .empty-note {
    color: var(--umbradesktop-launcher-text-muted, var(--umbradesktop-launcher-text, var(--uui-color-text)));
    font-size: var(--uui-type-small-size);
  }
`;
