import {
  CHARACTER_MAP_CELL_PX,
  CHARACTER_MAP_PADDING_PX,
  CHARACTER_MAP_ROW_PX,
  CHARACTER_MAP_STATUS_PX,
} from './constants.js';
import { altKeystroke, characterBlocks, codeLabel, displayName, findCharacters, glyphOf } from './characters.js';
import type { CharacterEntry } from './characters.js';
import { AREA } from '../shared/area.js';
import { copyToClipboard } from '../shared/clipboard.js';
import { accessoryStyles } from '../shared/styles.js';
import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/** The fonts on offer: the theme's own, then the three generic families every browser has. */
const FONTS: Array<[value: string, key: string, english: string]> = [
  ['', 'characterMapFontTheme', 'Theme font'],
  ['serif', 'characterMapFontSerif', 'Serif'],
  ['sans-serif', 'characterMapFontSans', 'Sans serif'],
  ['monospace', 'characterMapFontMono', 'Monospace'],
];

/** The English name of each group, the fallback for its dictionary key `characterMapGroup_<id>`. */
const GROUP_NAMES: Record<string, string> = {
  basicLatin: 'Basic Latin',
  latin1: 'Latin-1 Supplement',
  latinExtendedA: 'Latin Extended-A',
  greek: 'Greek and Coptic',
  cyrillic: 'Cyrillic',
  punctuation: 'General Punctuation',
  superscripts: 'Superscripts and Subscripts',
  currency: 'Currency Symbols',
  letterlike: 'Letterlike Symbols',
  numberForms: 'Number Forms',
  arrows: 'Arrows',
  maths: 'Mathematical Operators',
  technical: 'Miscellaneous Technical',
  boxDrawing: 'Box Drawing',
  blockElements: 'Block Elements',
  shapes: 'Geometric Shapes',
  symbols: 'Miscellaneous Symbols',
  dingbats: 'Dingbats',
};

/**
 * Character Map, as Windows had it: a grid of characters in a font, the one you click shown larger
 * with its name and code in the status bar, and a "Characters to copy" box that Select and a
 * double-click add to and Copy puts on the clipboard. With the advanced view's search built in,
 * because a name is how most people know the character they want.
 *
 * For the characters a keyboard does not have: the arrows, the dashes, the currency signs and the
 * accented capitals that end up in content. The names are Unicode's, from a table generated once by
 * `scripts/character-map-data.py`, since a browser has no way to name a character.
 */
@customElement('umbradesktop-character-map')
export class CharacterMapElement extends UmbLitElement {
  /** How text reaches the clipboard. The real clipboard unless a test says otherwise. */
  @property({ attribute: false })
  copyText: (text: string) => Promise<boolean> = copyToClipboard;

  /** The group on show when nothing is being searched for. */
  @state()
  private _group = characterBlocks()[0].id;

  /** What is being searched for. */
  @state()
  private _query = '';

  /** The chosen character's code point. */
  @state()
  private _selected?: number;

  /** The characters to copy. */
  @state()
  private _toCopy = '';

  /** The font the grid is drawn in, as a CSS family; empty for the theme's. */
  @state()
  private _font = '';

  /** A message in place of the character's name, until the next choice. */
  @state()
  private _notice = '';

  /** Whether the next render should bring the chosen cell into view: after a key, not after a click. */
  #reveal = false;

  /**
   * One word from this package's dictionary.
   * @param key The key inside the area.
   * @param fallback The English, shown if the dictionary has not loaded.
   * @returns The localised string.
   */
  #term(key: string, fallback: string): string {
    return this.localize.termOrDefault(`${AREA}_${key}`, fallback);
  }

  /** The characters in the grid: the search's matches, or the group's. */
  get #visible(): CharacterEntry[] {
    if (this._query.trim()) return findCharacters(this._query);
    return characterBlocks().find((block) => block.id === this._group)!.characters;
  }

  /**
   * The chosen character, falling back to the grid's first when the choice is not in it.
   * @param visible The grid's characters.
   * @returns The character, or undefined for an empty grid.
   */
  #chosen(visible: CharacterEntry[]): CharacterEntry | undefined {
    return visible.find((character) => character.code === this._selected) ?? visible[0];
  }

  /**
   * Choose a character.
   * @param code Its code point.
   */
  #choose(code: number): void {
    this._selected = code;
    this._notice = '';
  }

  /**
   * Add a character to the characters to copy.
   * @param character The character.
   */
  #add(character: CharacterEntry | undefined): void {
    if (character) this._toCopy += character.char;
  }

  /**
   * The code point of the cell an event happened on.
   * @param event A click or double-click in the grid.
   * @returns The code point, or undefined outside a cell.
   */
  #codeAt(event: Event): number | undefined {
    const target = (event.target as HTMLElement).closest<HTMLElement>('.cell');
    return target ? Number(target.dataset.code) : undefined;
  }

  /** @param event A click in the grid: choose the character under it. */
  #onClick = (event: MouseEvent): void => {
    const code = this.#codeAt(event);
    if (code !== undefined) this.#choose(code);
  };

  /** @param event A double-click in the grid: choose the character and add it, as Windows did. */
  #onDoubleClick = (event: MouseEvent): void => {
    const code = this.#codeAt(event);
    if (code === undefined) return;
    this.#choose(code);
    this.#add(this.#visible.find((character) => character.code === code));
  };

  /**
   * The grid's keys: the arrows move the choice, a row at a time up and down, Home and End go to the
   * ends, and Enter or Space adds the chosen character.
   * @param event The keydown.
   */
  #onKey = (event: KeyboardEvent): void => {
    const visible = this.#visible;
    const current = this.#chosen(visible);
    if (!current) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.#add(current);
      return;
    }
    const grid = event.currentTarget as HTMLElement;
    const columns = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').length);
    const step: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: columns,
      ArrowUp: -columns,
      Home: -Infinity,
      End: Infinity,
    };
    if (!(event.key in step)) return;
    event.preventDefault();
    const index = visible.indexOf(current);
    const next = Math.min(visible.length - 1, Math.max(0, index + step[event.key]));
    this.#reveal = true;
    this.#choose(visible[next].code);
  };

  /** Put the characters to copy on the clipboard, and say how that went. */
  async #copy(): Promise<void> {
    if (!this._toCopy) return;
    const copied = await this.copyText(this._toCopy);
    this._notice = copied
      ? this.#term('characterMapCopied', 'Copied to the clipboard.')
      : this.#term('characterMapCopyFailed', 'Could not copy. Select the characters and press Ctrl+C.');
  }

  /** Keep the chosen cell in view after the keyboard moved it. */
  override updated(): void {
    if (!this.#reveal) return;
    this.#reveal = false;
    this.shadowRoot!.querySelector('.cell[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }

  /**
   * The status bar: a message, or the chosen character's code and name, and its keystroke.
   * @param chosen The chosen character.
   * @param visible The grid's characters.
   * @returns The bar's contents.
   */
  #renderStatus(chosen: CharacterEntry | undefined, visible: CharacterEntry[]) {
    if (this._notice) return html`<span class="notice" role="status">${this._notice}</span>`;
    if (!visible.length) {
      return html`<span class="notice" role="status">${this.#term('characterMapNoResults', 'No character is called that.')}</span>`;
    }
    const keystroke = chosen && altKeystroke(chosen.code);
    return html`
      <span class="name">${chosen ? `${codeLabel(chosen.code)}: ${displayName(chosen.name)}` : ''}</span>
      ${keystroke ? html`<span class="keystroke">${this.#term('characterMapKeystroke', 'Keystroke')}: ${keystroke}</span>` : nothing}
    `;
  }

  /**
   * The window.
   * @returns The controls, the grid, the characters to copy and the status bar.
   */
  override render() {
    const visible = this.#visible;
    const chosen = this.#chosen(visible);
    const searching = !!this._query.trim();
    return html`
      <div class="row">
        <select
          class="control"
          data-field="font"
          aria-label=${this.#term('characterMapFont', 'Font')}
          title=${this.#term('characterMapFont', 'Font')}
          @change=${(event: Event) => (this._font = (event.target as HTMLSelectElement).value)}>
          ${FONTS.map(([value, key, english]) => html`<option value=${value} ?selected=${value === this._font}>${this.#term(key, english)}</option>`)}
        </select>
        <select
          class="control group"
          data-field="group"
          aria-label=${this.#term('characterMapGroup', 'Group')}
          title=${this.#term('characterMapGroup', 'Group')}
          ?disabled=${searching}
          @change=${(event: Event) => {
            this._group = (event.target as HTMLSelectElement).value;
            this._selected = undefined;
            this._notice = '';
          }}>
          ${characterBlocks().map(
            (block) =>
              html`<option value=${block.id} ?selected=${block.id === this._group}>
                ${this.#term(`characterMapGroup_${block.id}`, GROUP_NAMES[block.id] ?? block.id)}
              </option>`,
          )}
        </select>
        <input
          class="search sunken"
          type="search"
          data-field="search"
          placeholder=${this.#term('characterMapSearch', 'Search')}
          aria-label=${this.#term('characterMapSearch', 'Search')}
          .value=${this._query}
          @input=${(event: Event) => {
            this._query = (event.target as HTMLInputElement).value;
            this._notice = '';
          }} />
      </div>
      <div
        class="grid sunken"
        role="listbox"
        tabindex="0"
        aria-label=${this.#term('charactermap', 'Character Map')}
        aria-activedescendant=${chosen ? `c${chosen.code}` : nothing}
        style=${this._font ? `font-family: ${this._font}` : ''}
        @click=${this.#onClick}
        @dblclick=${this.#onDoubleClick}
        @keydown=${this.#onKey}>
        ${visible.map(
          (character) => html`<span
            class="cell"
            role="option"
            id=${`c${character.code}`}
            data-code=${character.code}
            aria-selected=${character === chosen ? 'true' : 'false'}
            aria-label=${displayName(character.name)}
            title=${displayName(character.name)}
            >${glyphOf(character)}</span
          >`,
        )}
      </div>
      <div class="row">
        <label class="to-copy">
          <span>${this.#term('characterMapToCopy', 'Characters to copy')}:</span>
          <input
            class="sunken"
            data-field="copy"
            .value=${this._toCopy}
            @input=${(event: Event) => (this._toCopy = (event.target as HTMLInputElement).value)} />
        </label>
        <button class="control" data-action="select" ?disabled=${!chosen} @click=${() => this.#add(chosen)}>
          ${this.#term('characterMapSelect', 'Select')}
        </button>
        <button class="control" data-action="copy" ?disabled=${!this._toCopy} @click=${() => this.#copy()}>
          ${this.#term('characterMapCopy', 'Copy')}
        </button>
      </div>
      <div class="status muted">${this.#renderStatus(chosen, visible)}</div>
    `;
  }

  /**
   * The shared accessory look, a grid that takes whatever the rows leave it and scrolls, and every
   * fixed height from `constants.ts`, which the manifest's minimum is summed from.
   */
  static override styles = [
    accessoryStyles,
    css`
      :host {
        height: 100%;
        padding: ${CHARACTER_MAP_PADDING_PX}px;
        gap: ${CHARACTER_MAP_PADDING_PX}px;
      }

      .row {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
        height: ${CHARACTER_MAP_ROW_PX}px;
      }

      .row .control,
      .row input {
        height: ${CHARACTER_MAP_ROW_PX}px;
      }

      .group {
        flex: 1;
        min-width: 0;
      }

      .search {
        flex: 0 1 10em;
        min-width: 5em;
      }

      input {
        padding: 0 6px;
        border: none;
        color: var(--umbradesktop-app-text, var(--uui-color-text));
        font: inherit;
      }

      input:focus-visible,
      .grid:focus-visible {
        outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
        outline-offset: 0;
      }

      .control:disabled {
        opacity: 0.5;
        cursor: default;
      }

      /* The grid: as many columns as fit, scrolling down. The paper stays white under every theme,
         as Windows' did: it is the characters on show, not the chrome. */
      .grid {
        flex: 1;
        min-height: ${CHARACTER_MAP_CELL_PX * 3 + 2}px;
        overflow: auto;
        display: grid;
        grid-template-columns: repeat(auto-fill, ${CHARACTER_MAP_CELL_PX}px);
        grid-auto-rows: ${CHARACTER_MAP_CELL_PX}px;
        align-content: start;
        padding: 1px;
        background: #fff;
        color: #000;
        font-size: 18px;
      }

      .cell {
        display: grid;
        place-items: center;
        box-shadow: inset -1px -1px 0 #c8c8c8;
        cursor: default;
        user-select: none;
        white-space: pre;
      }

      /* The chosen character, larger, as Windows popped it out of the grid. A transform, so it takes
         no layout and nothing moves round it. */
      .cell[aria-selected='true'] {
        position: relative;
        z-index: 1;
        transform: scale(1.5);
        background: #fff;
        box-shadow: 0 0 0 1px #000, 2px 2px 4px rgb(0 0 0 / 0.4);
      }

      .to-copy {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
      }

      .to-copy input {
        flex: 1;
        min-width: 3em;
      }

      .status {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-shrink: 0;
        height: ${CHARACTER_MAP_STATUS_PX}px;
        padding: 0 2px;
        font-size: 0.85em;
        white-space: nowrap;
        overflow: hidden;
      }

      .name,
      .notice {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `,
  ];
}

export { CharacterMapElement as element };

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so templates type-check. */
    'umbradesktop-character-map': CharacterMapElement;
  }
}
