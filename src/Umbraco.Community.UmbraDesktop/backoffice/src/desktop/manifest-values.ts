/**
 * What counts as a valid value in untyped manifest JSON.
 *
 * A static `umbraco-package.json` is type-checked by nothing, and a bundle can be built against a
 * stale copy of our types, so both manifest types the desktop reads arrive as `unknown` in practice.
 * These are the only checks either validator uses, so "a size" means the same thing everywhere.
 */

/**
 * Whether a value is a plain object: the only shape a manifest, its `meta`, or an item can have.
 * @param value Anything.
 * @returns True for a non-null, non-array object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether a value is a string with something in it. An empty alias, name or icon is never meant.
 * @param value Anything.
 * @returns True for a non-empty string.
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Whether a value is a real number: not `NaN`, not `Infinity`, and not a numeric string.
 * @param value Anything.
 * @returns True for a finite number.
 */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Whether a value is a boolean. `'yes'` and `1` are not, however they read.
 * @param value Anything.
 * @returns True for `true` or `false`.
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Whether a value is a `{ w, h }` box of finite, positive numbers, the shape of every size field.
 * @param value Anything.
 * @returns True for a usable size.
 */
export function isSize(value: unknown): value is { w: number; h: number } {
  return isRecord(value) && isFiniteNumber(value.w) && isFiniteNumber(value.h) && value.w > 0 && value.h > 0;
}

/**
 * Whether a value is a list of non-empty strings, the shape of `evaluateConditions`.
 * @param value Anything.
 * @returns True for an array whose every element is a non-empty string.
 */
export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}
