import { accessoryStyles } from '../shared/styles.js';
import { AREA } from '../shared/area.js';
import {
  CALCULATOR_COLUMNS,
  CALCULATOR_DISPLAY_HEIGHT_PX,
  CALCULATOR_EXPRESSION_HEIGHT_PX,
  CALCULATOR_KEY_GAP_PX,
  CALCULATOR_KEY_SIZE,
  CALCULATOR_KEYPAD,
  CALCULATOR_PADDING_PX,
} from './constants.js';
import { OPERATOR_GLYPHS, initialCalculator, press } from './engine.js';
import type { CalculatorKey, CalculatorOperator, CalculatorState } from './engine.js';
import { css, customElement, html, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * What each key says on its face, where that is not the key itself.
 *
 * The operators use {@link OPERATOR_GLYPHS} so the key and the expression line above it draw the
 * same sign. The rest are the glyphs every calculator face uses.
 */
const FACES: Partial<Record<CalculatorKey, string>> = {
  ...OPERATOR_GLYPHS,
  Negate: '±',
  Backspace: '⌫',
};

/**
 * What a screen reader should call the keys whose face is a symbol, as a localisation key and its
 * English fallback. A digit reads as itself and needs no entry.
 */
const KEY_NAMES: Partial<Record<CalculatorKey, [string, string]>> = {
  '+': ['calculatorAdd', 'Plus'],
  '-': ['calculatorSubtract', 'Minus'],
  '*': ['calculatorMultiply', 'Multiply by'],
  '/': ['calculatorDivide', 'Divide by'],
  '=': ['calculatorEquals', 'Equals'],
  '%': ['calculatorPercent', 'Percent'],
  '.': ['calculatorDecimal', 'Decimal separator'],
  Negate: ['calculatorNegate', 'Positive negative'],
  Backspace: ['calculatorBackspace', 'Backspace'],
  C: ['calculatorClear', 'Clear'],
  CE: ['calculatorClearEntry', 'Clear entry'],
};

/**
 * The keyboard, mapped onto the keypad.
 *
 * Most keys are their own name, which is why the engine's operators are spelled the way a keyboard
 * types them. The rest are the conventions every desktop calculator honours: Enter is equals,
 * Escape clears, Delete clears the entry. A comma is a decimal point too, because on a Dutch or
 * German keypad that is what the decimal key types.
 */
const KEYBOARD: Record<string, CalculatorKey> = {
  Enter: '=',
  '=': '=',
  Escape: 'C',
  Delete: 'CE',
  Backspace: 'Backspace',
  ',': '.',
  '.': '.',
  '%': '%',
  '+': '+',
  '-': '-',
  '*': '*',
  '/': '/',
  ...Object.fromEntries([...'0123456789'].map((digit) => [digit, digit as CalculatorKey])),
};

/** The keys that finish or change a sum, drawn as the emphasised kind. */
const OPERATORS = new Set<CalculatorKey>(Object.keys(OPERATOR_GLYPHS) as CalculatorOperator[]);

/**
 * Calculator, as a self-contained UmbraDesktop app.
 *
 * The element is the face and nothing else. It holds a {@link CalculatorState} in one reactive
 * field, hands every key to the pure {@link press}, and draws what comes back, so every rule of
 * arithmetic is tested without a DOM in `engine.test.ts` and this file is only wiring.
 *
 * It takes the keyboard as well as the pointer, because nobody types a long sum by clicking. The
 * host is focusable for that, and it focuses itself when it first renders, so a person can open
 * Calculator and start typing. The desktop does not do that for it: bringing a window to the front
 * moves no keyboard focus into the app, and before this the keys typed into a newly opened
 * Calculator went nowhere until one of its buttons had been clicked.
 */
@customElement('umbradesktop-calculator')
export class CalculatorElement extends UmbLitElement {
  /** The calculator. */
  @state()
  private _calculator: CalculatorState = initialCalculator();

  /** Take focus and listen for keys. */
  override connectedCallback(): void {
    super.connectedCallback();
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    this.addEventListener('keydown', this.#onKeyDown);
  }

  /**
   * Take the keyboard as soon as the calculator is on screen. Without scrolling, since a window that
   * has just opened has nothing to scroll to.
   */
  override firstUpdated(): void {
    this.focus({ preventScroll: true });
  }

  /** Stop listening. The whole of teardown: there is no timer here. */
  override disconnectedCallback(): void {
    this.removeEventListener('keydown', this.#onKeyDown);
    super.disconnectedCallback();
  }

  /**
   * A key from the keyboard.
   *
   * A key the calculator used has its default prevented, so Enter does not also press whichever
   * button last had focus and `/` does not open the browser's find bar. Anything else is left
   * alone, so the browser's and the desktop's own shortcuts keep working with Calculator focused.
   * Modified keys are left alone too: Ctrl+C is a copy, not a clear.
   * @param event The keydown.
   */
  #onKeyDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = KEYBOARD[event.key];
    if (!key) return;
    event.preventDefault();
    this.#press(key);
  };

  /**
   * Press one key on the engine.
   * @param key The key.
   */
  #press(key: CalculatorKey): void {
    this._calculator = press(this._calculator, key);
  }

  /**
   * One word from this package's dictionary.
   * @param key The key inside the area.
   * @param fallback The English, shown if the dictionary has not loaded.
   * @returns The localised string.
   */
  #term(key: string, fallback: string): string {
    return this.localize.termOrDefault(`${AREA}_${key}`, fallback);
  }

  /**
   * One key on the pad.
   * @param key The key.
   * @returns Its button.
   */
  #renderKey(key: CalculatorKey) {
    const name = KEY_NAMES[key];
    const kind = key === '=' ? 'equals' : OPERATORS.has(key) ? 'operator' : /\d/.test(key) ? 'digit' : 'function';
    return html`<button
      class="control key"
      data-key=${key}
      data-kind=${kind}
      aria-label=${name ? this.#term(name[0], name[1]) : key}
      @click=${() => this.#press(key)}
    >
      ${FACES[key] ?? key}
    </button>`;
  }

  /**
   * The whole window body: the expression line, the display, and the pad.
   * @returns The calculator's face.
   */
  override render() {
    const { display, expression, error } = this._calculator;
    const shown = error === 'divideByZero' ? this.#term('calculatorDivideByZero', 'Cannot divide by zero') : display;
    return html`
      <div class="screen sunken">
        <div class="expression muted">${expression}</div>
        <div class="display" aria-live="polite" data-error=${error ?? ''}>${shown}</div>
      </div>
      <div class="pad">
        ${CALCULATOR_KEYPAD.map((row) =>
          row.map((key) => (row.length === 1 ? html`<div class="wide">${this.#renderKey(key)}</div>` : this.#renderKey(key))),
        )}
      </div>
    `;
  }

  /**
   * The shared accessory look, plus the calculator's own layout.
   *
   * The pad is a grid of `1fr` tracks with the key size as their minimum, so the keys start at the
   * size the manifest declared and grow when the window does. A maximized calculator gets big keys
   * rather than a small pad in a corner.
   */
  static override styles = [
    accessoryStyles,
    css`
      :host {
        padding: ${CALCULATOR_PADDING_PX}px;
        gap: ${CALCULATOR_PADDING_PX}px;
        outline: none;
      }

      .screen {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        justify-content: flex-end;
        padding: 0 ${CALCULATOR_PADDING_PX}px;
        overflow: hidden;
      }

      .expression {
        height: ${CALCULATOR_EXPRESSION_HEIGHT_PX}px;
        line-height: ${CALCULATOR_EXPRESSION_HEIGHT_PX}px;
        font-size: 0.85em;
        white-space: nowrap;
      }

      .display {
        height: ${CALCULATOR_DISPLAY_HEIGHT_PX}px;
        line-height: ${CALCULATOR_DISPLAY_HEIGHT_PX}px;
        font-size: 1.75em;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      .display[data-error='divideByZero'] {
        font-size: 1.1em;
      }

      .pad {
        flex: 1;
        display: grid;
        grid-template-columns: repeat(${CALCULATOR_COLUMNS}, minmax(${CALCULATOR_KEY_SIZE.w}px, 1fr));
        grid-auto-rows: minmax(${CALCULATOR_KEY_SIZE.h}px, 1fr);
        gap: ${CALCULATOR_KEY_GAP_PX}px;
      }

      .wide {
        display: grid;
        grid-column: 1 / -1;
      }

      .key {
        width: 100%;
        height: 100%;
        min-height: ${CALCULATOR_KEY_SIZE.h}px;
        padding: 0;
        font-size: 1.05em;
      }

      .key[data-kind='digit'] {
        font-weight: 600;
      }

      /* Equals is the one key drawn in the accent, as it is on every calculator face that has
         colour at all. accent-text rather than white, because white is unreadable on some themes'
         accent and that token exists to say what is not. */
      .key[data-kind='equals'] {
        background: var(--umbradesktop-app-accent, var(--uui-color-selected));
        color: var(--umbradesktop-app-accent-text, var(--uui-color-surface));
      }

      /* Windows 98 draws its calculator's operators in red and its digits in blue, and equals as a
         plain grey key like the rest. That is the original's own face rather than a theme value,
         so it is hardcoded here like the bevel greys. Colour only, no geometry. */
      :host([data-umbradesktop-theme='win98']) .key[data-kind='digit'] {
        color: #00007b;
      }

      :host([data-umbradesktop-theme='win98']) .key[data-kind='operator'],
      :host([data-umbradesktop-theme='win98']) .key[data-kind='equals'] {
        color: #e00000;
      }

      :host([data-umbradesktop-theme='win98']) .key[data-kind='equals'] {
        background: var(--umbradesktop-app-surface-raised, var(--uui-color-surface-emphasis));
      }
    `,
  ];
}

export { CalculatorElement as element };

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so templates type-check. */
    'umbradesktop-calculator': CalculatorElement;
  }
}
