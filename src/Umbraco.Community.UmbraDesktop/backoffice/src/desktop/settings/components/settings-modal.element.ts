import type { UmbraDesktopSettingsModalData } from '../modal-tokens';
import type { UmbraDesktopSettingsCategory } from '../categories/types';
import { UMBRADESKTOP_SETTINGS_CATEGORIES, findSettingsCategory } from '../categories/index';
import './settings-row.element.js';
import { css, customElement, html, nothing, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbModalBaseElement } from '@umbraco-cms/backoffice/modal';

/**
 * The Desktop settings panel, opened from the launcher footer as a sidebar from the right.
 *
 * **Two levels.** Opening it shows a list of categories; picking one shows that category's
 * settings. It was one screen with every setting on it, which stopped working at three settings:
 * previews large enough to read took three rows and pushed Wallpaper off the bottom of a 500px
 * sidebar, and a setting nobody scrolls to is a setting nobody finds.
 *
 * This element owns **navigation and nothing else** — it reads no setting at all. What a category
 * contains is that category's own element (see `categories/`), which is what makes a third category
 * a folder rather than an edit to a file that keeps growing.
 *
 * There is no Save at either level: every change applies through the settings context the moment it
 * is made, which is also what lets the user watch the result on the desktop beside the panel.
 */
@customElement('umbradesktop-settings-modal')
export class UmbraDesktopSettingsModalElement extends UmbModalBaseElement<UmbraDesktopSettingsModalData, never> {
  /** The category being shown, or undefined at the list. */
  @state()
  private _category?: UmbraDesktopSettingsCategory;

  /**
   * Where focus goes after the next render: the category heading on the way in, the row you came
   * from on the way out. Cleared once it has been used, so an unrelated re-render — a summary
   * changing while a picker is open — does not yank focus back.
   */
  #focusAfterRender?: 'heading' | string;

  override connectedCallback() {
    super.connectedCallback();
    // A caller can open the panel straight at a category — a right-click on the desktop meaning
    // "change the wallpaper" should not make you walk the list. An id this version does not know
    // lands on the list rather than on an empty screen, which is what a deep link from an older
    // version or a typo would otherwise do.
    this._category = findSettingsCategory(this.data?.category);
  }

  /**
   * Go into a category.
   * @param category The category to show.
   */
  #open(category: UmbraDesktopSettingsCategory) {
    this._category = category;
    this.#focusAfterRender = 'heading';
  }

  /**
   * Go back to the list, putting focus back on the row that was used to leave it.
   *
   * Back, rather than closing: Escape closes the whole panel from either level, because that is
   * what every other backoffice sidebar does and an Escape that sometimes goes back and sometimes
   * closes is worse than one that always closes. Nothing here intercepts it — the modal system's
   * own dialog handles it.
   */
  #back() {
    this.#focusAfterRender = this._category?.id;
    this._category = undefined;
  }

  /**
   * Move focus to wherever the last navigation said it should go.
   *
   * Without this, going into a category leaves focus on a button that is no longer on screen, and
   * coming back leaves it on the back button that has just gone — which for anyone on a keyboard or
   * a screen reader is the panel losing its place twice per visit.
   */
  protected override async updated() {
    const target = this.#focusAfterRender;
    if (!target) return;
    this.#focusAfterRender = undefined;

    const root = this.renderRoot as ShadowRoot;
    if (target === 'heading') {
      (root.querySelector('.heading') as HTMLElement | null)?.focus();
      return;
    }

    const row = root.querySelector(`umbradesktop-settings-row[data-category="${target}"]`) as
      | (HTMLElement & { updateComplete?: Promise<unknown> })
      | null;
    // The row has to have rendered before it can take focus. Its focus is delegated to the button
    // in its shadow root (see the row element), and a host whose shadow root is still empty has
    // nothing to delegate to — so focusing it right now silently does nothing, which is exactly
    // what coming back from a category used to do. The heading above needs no such wait: it is in
    // this element's own template and has been rendered by the time this runs.
    await row?.updateComplete;
    row?.focus();
  }

  /** The list of categories, which is what opening the panel shows. */
  #renderList() {
    return html`
      <div class="list">
        ${UMBRADESKTOP_SETTINGS_CATEGORIES.map(
          (category) => html`
            <umbradesktop-settings-row
              data-category=${category.id}
              headline=${this.localize.term(category.labelKey)}
              detail=${this.localize.term(category.descriptionKey)}
              @click=${() => this.#open(category)}>
              <uui-icon slot="lead" class="icon" name=${category.icon}></uui-icon>
            </umbradesktop-settings-row>
          `,
        )}
      </div>
    `;
  }

  /** One element per category, so going back and forth does not rebuild the screen each time. */
  #screens = new Map<string, HTMLElement>();

  /**
   * One category's screen, as an element made from its tag.
   *
   * Built with `createElement` and rendered as a node rather than written as a tag in a template,
   * because a template's tag name cannot come from data — that needs Lit's static-html, which the
   * backoffice does not re-export, and importing it from `lit` directly would bundle a second copy
   * of Lit beside the backoffice's own. A node in an expression needs neither.
   *
   * Kept per category rather than made fresh on each render: returning a new element every time
   * would tear the screen down and rebuild it on every unrelated state change, losing scroll
   * position and any context each screen has resolved.
   * @param category The category to render.
   * @returns The category's element.
   */
  #renderCategory(category: UmbraDesktopSettingsCategory): HTMLElement {
    let screen = this.#screens.get(category.tag);
    if (!screen) {
      screen = document.createElement(category.tag);
      this.#screens.set(category.tag, screen);
    }
    return screen;
  }

  override render() {
    const category = this._category;
    return html`
      <umb-body-layout headline=${category ? '' : this.localize.term('umbraDesktop_desktopSettings')}>
        ${category
          ? html`
              <div slot="header" class="crumb">
                <uui-button
                  compact
                  look="default"
                  label=${this.localize.term('umbraDesktop_settingsBack')}
                  @click=${this.#back}>
                  <uui-icon name="icon-navigation-left"></uui-icon>
                </uui-button>
                <h3 class="heading" tabindex="-1">${this.localize.term(category.labelKey)}</h3>
              </div>
            `
          : nothing}
        ${category ? this.#renderCategory(category) : this.#renderList()}
        <uui-button
          slot="actions"
          look="primary"
          label=${this.localize.term('general_close')}
          @click=${() => this._rejectModal()}></uui-button>
      </umb-body-layout>
    `;
  }

  static override styles = [
    css`
      .list {
        display: flex;
        flex-direction: column;
      }
      /* No rule between the rows, deliberately. One was tried: it is invisible in light mode, where
         the divider token is a hair off the panel's own surface, and too heavy in dark mode, where
         it is not. The height of the rows is what separates them. */
      /* Sized to the row it labels rather than to the icon's own box, so a category row and a
         setting row below it have their text starting at the same place. */
      .icon {
        flex-shrink: 0;
        width: 24px;
        font-size: 24px;
        color: var(--uui-color-text-alt, var(--uui-color-text));
      }
      /* The panel's own title while inside a category, standing in for umb-body-layout's headline
         so that the back arrow can sit before it rather than after. */
      .crumb {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-2);
      }
      .crumb h3 {
        margin: 0;
        font-size: var(--uui-type-h5-size, 1.2rem);
      }
      /* Focusable so that going into a category moves focus somewhere meaningful, without adding a
         tab stop for people who are not being sent here. */
      .heading:focus {
        outline: none;
      }
      .heading:focus-visible {
        outline: 2px solid var(--uui-color-focus);
        outline-offset: 2px;
      }
    `,
  ];
}

export default UmbraDesktopSettingsModalElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-settings-modal': UmbraDesktopSettingsModalElement;
  }
}
