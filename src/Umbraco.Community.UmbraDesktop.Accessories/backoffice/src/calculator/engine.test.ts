import { expect } from '@open-wc/testing';
import { CALCULATOR_MAX_DIGITS } from './constants.js';
import { initialCalculator, press } from './engine.js';
import type { CalculatorKey, CalculatorState } from './engine.js';

/**
 * Press a sequence of keys from a fresh calculator, the way a person types a sum.
 *
 * Every case goes through {@link press} one key at a time rather than building a state by hand, so
 * each is a statement about what a sequence of keypresses shows and not about the shape of the
 * state object, which is free to change.
 * @param keys The keys, in order.
 * @returns The state after the last one.
 */
function type(...keys: CalculatorKey[]): CalculatorState {
  return keys.reduce(press, initialCalculator());
}

it('starts at zero', () => {
  expect(initialCalculator().display).to.equal('0');
});

it('builds a number from its digits, replacing the leading zero', () => {
  expect(type('1', '2', '3').display).to.equal('123');
  expect(type('0', '0', '7').display, 'a run of zeros does not pile up in front').to.equal('7');
});

it('accepts one decimal point and no more', () => {
  expect(type('.', '5').display, 'a bare point means nought point').to.equal('0.5');
  expect(type('1', '.', '2', '.', '3').display).to.equal('1.23');
});

it('stops taking digits at the display width', () => {
  const keys = Array.from({ length: CALCULATOR_MAX_DIGITS + 3 }, () => '9' as const);
  expect(type(...keys).display).to.have.length(CALCULATOR_MAX_DIGITS);
});

it('adds, subtracts, multiplies and divides', () => {
  expect(type('2', '+', '3', '=').display).to.equal('5');
  expect(type('2', '-', '3', '=').display).to.equal('-1');
  expect(type('6', '*', '7', '=').display).to.equal('42');
  expect(type('1', '/', '4', '=').display).to.equal('0.25');
});

/**
 * Immediate execution, which is what the Windows calculator in Standard mode does and what a
 * person who grew up on a pocket calculator expects: each operator settles the sum so far. It is
 * **not** precedence, and a calculator that answered 14 here would be a different calculator.
 */
it('settles each operation as the next operator is pressed, left to right', () => {
  const state = type('2', '+', '3', '*');
  expect(state.display, 'the running total shows as soon as the second operator lands').to.equal('5');
  expect(press(press(state, '4'), '=').display).to.equal('20');
});

it('takes the last operator when two are pressed in a row', () => {
  expect(type('8', '+', '-', '3', '=').display).to.equal('5');
});

it('repeats the last operation on each further press of equals', () => {
  expect(type('2', '+', '3', '=', '=', '=').display).to.equal('11');
});

it('starts a new number after equals rather than appending to the answer', () => {
  expect(type('2', '+', '3', '=', '4').display).to.equal('4');
});

/**
 * Floating point is the user's problem nowhere. `0.1 + 0.2` is `0.30000000000000004` in the
 * language this is written in, and a calculator that showed that would be reported the first day.
 */
it('shows the answer a person expects rather than the float underneath it', () => {
  expect(type('.', '1', '+', '.', '2', '=').display).to.equal('0.3');
  expect(type('1', '/', '3', '=').display.length, 'a repeating decimal fits the display').to.be.at.most(
    CALCULATOR_MAX_DIGITS + 2,
  );
});

it('refuses to divide by zero, and says so until cleared', () => {
  const state = type('5', '/', '0', '=');
  expect(state.error).to.equal('divideByZero');
  expect(press(state, '+').error, 'an operator does not quietly carry on from an error').to.equal(
    'divideByZero',
  );
  const recovered = press(state, '7');
  expect(recovered.error, 'a digit starts afresh').to.equal(null);
  expect(recovered.display).to.equal('7');
});

it('clears everything with C and only the entry with CE', () => {
  const pending = type('9', '+', '4');
  expect(press(pending, 'C').display).to.equal('0');
  expect(press(press(press(pending, 'C'), '1'), '=').display, 'C forgets the pending sum').to.equal(
    '1',
  );
  const entryCleared = press(pending, 'CE');
  expect(entryCleared.display).to.equal('0');
  expect(press(press(entryCleared, '2'), '=').display, 'CE keeps the pending sum').to.equal('11');
});

it('deletes the last digit with backspace, down to zero', () => {
  expect(type('1', '2', '3', 'Backspace').display).to.equal('12');
  expect(type('5', 'Backspace', 'Backspace').display).to.equal('0');
  expect(type('2', '+', '3', '=', 'Backspace').display, 'an answer is not an entry to edit').to.equal('5');
});

it('flips the sign of the entry', () => {
  expect(type('4', 'Negate').display).to.equal('-4');
  expect(type('4', 'Negate', 'Negate').display).to.equal('4');
  expect(type('0', 'Negate').display, 'there is no negative zero on a calculator').to.equal('0');
});

/**
 * Percent means what it means on the Windows calculator: after an operator, the entry becomes that
 * percentage **of the running total**, so "200 + 10 %" adds twenty. On its own there is nothing to
 * take a percentage of, and the entry becomes a hundredth of itself.
 */
it('takes a percentage of the running total', () => {
  expect(type('2', '0', '0', '+', '1', '0', '%').display).to.equal('20');
  expect(type('2', '0', '0', '+', '1', '0', '%', '=').display).to.equal('220');
  expect(type('5', '0', '%').display).to.equal('0.5');
});

it('shows a pending operation as an expression above the entry', () => {
  expect(type('1', '2', '+').expression).to.equal('12 +');
  expect(type('1', '2', '+', '3', '=').expression).to.equal('12 + 3 =');
  expect(initialCalculator().expression).to.equal('');
});
