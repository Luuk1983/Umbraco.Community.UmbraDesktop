import { CALCULATOR_MAX_DIGITS, CALCULATOR_SIGNIFICANT_DIGITS } from './constants.js';

/**
 * The four operators, keyed the way a keyboard types them.
 *
 * `*` and `/` rather than `×` and `÷` because these are also the `KeyboardEvent.key` values, so the
 * element can hand a keypress straight to {@link press} without a lookup table. The pretty glyphs are
 * a rendering concern and live in {@link OPERATOR_GLYPHS}.
 */
export type CalculatorOperator = '+' | '-' | '*' | '/';

/** Every key the calculator has, including the ones only a button can press. */
export type CalculatorKey =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '.'
  | CalculatorOperator
  | '='
  | '%'
  | 'Negate'
  | 'Backspace'
  | 'C'
  | 'CE';

/**
 * Why the calculator is refusing to show a number. One value today; a union so the element's
 * message lookup is exhaustive the day a second one arrives.
 */
export type CalculatorError = 'divideByZero';

/**
 * Everything the calculator knows, and nothing it can derive.
 *
 * Immutable: {@link press} returns a new one. The element holds it in one reactive field, which is
 * the same arrangement Minesweeper uses with its rules module, and for the same reason: every rule
 * of arithmetic here is testable without a DOM.
 */
export interface CalculatorState {
  /** What the big display shows, exactly as it should be drawn. */
  display: string;
  /** The small line above it: the sum in progress, or the sum just finished. */
  expression: string;
  /** The running total a pending operator will apply to, or null before the first operator. */
  accumulator: number | null;
  /** The operator waiting for its right-hand side, or null. */
  operator: CalculatorOperator | null;
  /**
   * Whether the next digit starts a new entry rather than extending {@link display}. True straight
   * after an operator or equals, which is what makes "2 + 3 = 4" show 4 rather than 54.
   */
  fresh: boolean;
  /**
   * The operator and right-hand side of the last equals, so that pressing it again repeats the
   * operation. Null until an equals has run.
   */
  repeat: { operator: CalculatorOperator; operand: number } | null;
  /** Set while the display holds an error rather than a number. */
  error: CalculatorError | null;
}

/**
 * How each operator is drawn in the expression line and on its key.
 *
 * The minus is U+2212 rather than the hyphen the keyboard types, because a hyphen sits too high and
 * too short beside a plus and every calculator face draws the real sign.
 */
export const OPERATOR_GLYPHS: Record<CalculatorOperator, string> = {
  '+': '+',
  '-': '−',
  '*': '×',
  '/': '÷',
};

/** A calculator that has just been switched on. */
export function initialCalculator(): CalculatorState {
  return {
    display: '0',
    expression: '',
    accumulator: null,
    operator: null,
    fresh: true,
    repeat: null,
    error: null,
  };
}

/**
 * Turn a result into what the display shows.
 *
 * Rounded to {@link CALCULATOR_SIGNIFICANT_DIGITS} first, which is the whole trick behind showing
 * `0.3` for `0.1 + 0.2`: binary floating point is exact to about seventeen significant digits and
 * noisy past that, so rounding a few digits short of it throws away exactly the noise and nothing a
 * person typed. What is left is drawn plainly if it fits the display and in exponent form if not.
 * @param value A finite number.
 * @returns The display string.
 */
export function formatResult(value: number): string {
  const rounded = Number(value.toPrecision(CALCULATOR_SIGNIFICANT_DIGITS));
  // Object.is rather than ===, because -0 === 0 and a calculator must never show "-0".
  if (Object.is(rounded, -0)) return '0';
  const plain = String(rounded);
  const digits = plain.replace(/[-.]/g, '');
  if (!plain.includes('e') && digits.length <= CALCULATOR_MAX_DIGITS) return plain;
  return rounded.toExponential(CALCULATOR_SIGNIFICANT_DIGITS - 4).replace(/\.?0+e/, 'e');
}

/**
 * Apply one operator.
 * @param left The running total.
 * @param operator The operation.
 * @param right The entry.
 * @returns The result, or null for a division by zero.
 */
function apply(left: number, operator: CalculatorOperator, right: number): number | null {
  switch (operator) {
    case '+':
      return left + right;
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
      return right === 0 ? null : left / right;
  }
}

/**
 * The expression-line spelling of a number: the same as the display, so the line above and the
 * figure below never disagree about how a value is written.
 * @param value The number.
 * @returns Its display form.
 */
function show(value: number): string {
  return formatResult(value);
}

/**
 * A state showing an error. Everything pending is dropped, because nothing sensible follows from a
 * division by zero; the next digit or C starts afresh.
 * @param error Which error.
 * @param expression The sum that caused it, left visible so the person can see what they typed.
 * @returns The error state.
 */
function failed(error: CalculatorError, expression: string): CalculatorState {
  return { ...initialCalculator(), display: '', expression, error };
}

/**
 * Press one key.
 *
 * Immediate execution, as the Windows calculator does in Standard mode: each operator settles the
 * sum so far, so `2 + 3 ×` shows 5 before the 4 is typed. That is not precedence, and it is not
 * meant to be; it is what a person who has used a calculator expects from one.
 * @param state The calculator before the key.
 * @param key The key.
 * @returns The calculator after it.
 */
export function press(state: CalculatorState, key: CalculatorKey): CalculatorState {
  if (key === 'C') return initialCalculator();

  // In an error, only something that starts a new entry is meaningful. An operator would carry on
  // from a number that does not exist, so it is ignored and the message stays up.
  if (state.error) {
    if (key === 'CE' || key === 'Backspace') return initialCalculator();
    if (/^[0-9.]$/.test(key)) return press(initialCalculator(), key);
    return state;
  }

  switch (key) {
    case '0':
    case '1':
    case '2':
    case '3':
    case '4':
    case '5':
    case '6':
    case '7':
    case '8':
    case '9':
      return typeDigit(state, key);
    case '.':
      return typePoint(state);
    case '+':
    case '-':
    case '*':
    case '/':
      return typeOperator(state, key);
    case '=':
      return typeEquals(state);
    case '%':
      return typePercent(state);
    case 'Negate':
      return typeNegate(state);
    case 'Backspace':
      return typeBackspace(state);
    case 'CE':
      return { ...state, display: '0', fresh: true };
  }
}

/**
 * Append a digit, or start a new entry with it.
 * @param state The calculator before.
 * @param digit The digit.
 * @returns The calculator after.
 */
function typeDigit(state: CalculatorState, digit: string): CalculatorState {
  // After equals, a digit is a new sum, not a continuation of the last one.
  const afterEquals = state.fresh && state.operator === null && state.repeat !== null;
  const base = afterEquals ? { ...state, expression: '', accumulator: null, repeat: null } : state;
  if (base.fresh) return { ...base, display: digit, fresh: false };
  if (countDigits(base.display) >= CALCULATOR_MAX_DIGITS) return base;
  const display = base.display === '0' ? digit : base.display === '-0' ? `-${digit}` : base.display + digit;
  return { ...base, display };
}

/**
 * Add the decimal point, once.
 * @param state The calculator before.
 * @returns The calculator after.
 */
function typePoint(state: CalculatorState): CalculatorState {
  if (state.fresh) return { ...typeDigit(state, '0'), display: '0.' };
  if (state.display.includes('.')) return state;
  return { ...state, display: `${state.display}.` };
}

/**
 * Settle the pending operation, if any, and queue a new one.
 * @param state The calculator before.
 * @param operator The operator pressed.
 * @returns The calculator after.
 */
function typeOperator(state: CalculatorState, operator: CalculatorOperator): CalculatorState {
  const entry = Number(state.display);
  // Two operators in a row: the second replaces the first rather than applying it to itself.
  if (state.fresh && state.operator !== null && state.accumulator !== null) {
    return { ...state, operator, expression: `${show(state.accumulator)} ${OPERATOR_GLYPHS[operator]}` };
  }
  let total = entry;
  if (state.operator !== null && state.accumulator !== null) {
    const result = apply(state.accumulator, state.operator, entry);
    if (result === null) return failed('divideByZero', `${state.expression} ${show(entry)}`);
    total = result;
  }
  return {
    ...state,
    display: formatResult(total),
    expression: `${show(total)} ${OPERATOR_GLYPHS[operator]}`,
    accumulator: total,
    operator,
    fresh: true,
    repeat: null,
  };
}

/**
 * Finish the sum, or repeat the last operation if there is nothing pending.
 * @param state The calculator before.
 * @returns The calculator after.
 */
function typeEquals(state: CalculatorState): CalculatorState {
  const entry = Number(state.display);
  let left: number;
  let operation: { operator: CalculatorOperator; operand: number };
  if (state.operator !== null && state.accumulator !== null) {
    left = state.accumulator;
    operation = { operator: state.operator, operand: entry };
  } else if (state.repeat) {
    left = entry;
    operation = state.repeat;
  } else {
    return { ...state, expression: `${show(entry)} =`, fresh: true };
  }
  const expression = `${show(left)} ${OPERATOR_GLYPHS[operation.operator]} ${show(operation.operand)} =`;
  const result = apply(left, operation.operator, operation.operand);
  if (result === null) return failed('divideByZero', expression);
  return {
    ...state,
    display: formatResult(result),
    expression,
    accumulator: null,
    operator: null,
    fresh: true,
    repeat: operation,
  };
}

/**
 * Turn the entry into a percentage: of the running total after an operator, of one otherwise.
 * @param state The calculator before.
 * @returns The calculator after.
 */
function typePercent(state: CalculatorState): CalculatorState {
  const entry = Number(state.display);
  const value = state.accumulator !== null ? (state.accumulator * entry) / 100 : entry / 100;
  return { ...state, display: formatResult(value), fresh: false };
}

/**
 * Flip the sign of the entry. Zero stays zero, since there is no negative zero on a calculator.
 * @param state The calculator before.
 * @returns The calculator after.
 */
function typeNegate(state: CalculatorState): CalculatorState {
  if (Number(state.display) === 0 && !state.display.includes('.')) return { ...state, display: '0' };
  const display = state.display.startsWith('-') ? state.display.slice(1) : `-${state.display}`;
  // Negating an answer makes it an entry the person can keep typing into, as Windows does.
  return { ...state, display, fresh: false };
}

/**
 * Delete the last typed digit. An answer is not something typed, so it is left alone.
 * @param state The calculator before.
 * @returns The calculator after.
 */
function typeBackspace(state: CalculatorState): CalculatorState {
  if (state.fresh) return state;
  const display = state.display.slice(0, -1);
  return { ...state, display: display === '' || display === '-' ? '0' : display };
}

/**
 * Count the digits in a display string, ignoring its sign and point, which do not take a digit's
 * place on a calculator face.
 * @param display The display string.
 * @returns How many digits it holds.
 */
function countDigits(display: string): number {
  return display.replace(/[-.]/g, '').length;
}
