import { expect } from '@open-wc/testing';
import {
  formatUmbraCoffeeDate,
  UMBRACOFFEE_TIME_OPTIONS,
  type UmbraDesktopSettingsContextLike,
} from './desktop-format.js';
import { UmbStringState } from '@umbraco-cms/backoffice/observable-api';

/**
 * The formatting rule on its own, without an element around it: the desktop's `formatDateTime` when
 * the context has one, `localize.date` when there is no context or the context predates the method.
 * The elements' tests hold that each call site goes through it.
 */

/** A fixed moment, so every case formats the same one. */
const MOMENT = new Date('2026-10-30T11:30:00Z');

/** Stands in for `this.localize`, writing what it was given, so a case can tell it was the one used. */
const localize = {
  date: (date: Date | string, options?: Intl.DateTimeFormatOptions) =>
    `backoffice ${JSON.stringify(options)} ${new Date(date).toISOString()}`,
};

/**
 * A settings context stand-in, with or without the method.
 * @param withMethod Whether it has `formatDateTime`, as a current desktop does.
 * @returns The context.
 */
function desktop(withMethod: boolean): UmbraDesktopSettingsContextLike {
  const context: UmbraDesktopSettingsContextLike = {
    locale: new UmbStringState('h23').asObservable(),
    getHostElement: () => document.body,
  };
  if (withMethod) context.formatDateTime = (date, options) => `desktop ${JSON.stringify(options)} ${date.toISOString()}`;
  return context;
}

it("uses the desktop's formatDateTime when the context has it", () => {
  expect(formatUmbraCoffeeDate(desktop(true), localize, MOMENT, UMBRACOFFEE_TIME_OPTIONS)).to.equal(
    `desktop ${JSON.stringify(UMBRACOFFEE_TIME_OPTIONS)} ${MOMENT.toISOString()}`,
  );
});

it('uses localize.date outside a desktop', () => {
  expect(formatUmbraCoffeeDate(undefined, localize, MOMENT, UMBRACOFFEE_TIME_OPTIONS)).to.equal(
    localize.date(MOMENT, UMBRACOFFEE_TIME_OPTIONS),
  );
});

it('uses localize.date inside a desktop older than formatDateTime', () => {
  expect(formatUmbraCoffeeDate(desktop(false), localize, MOMENT, UMBRACOFFEE_TIME_OPTIONS)).to.equal(
    localize.date(MOMENT, UMBRACOFFEE_TIME_OPTIONS),
  );
});

it('asks for a time with an hour, so the 12/24 hour setting applies, and never with timeStyle', () => {
  expect(UMBRACOFFEE_TIME_OPTIONS.hour).to.not.equal(undefined);
  expect(UMBRACOFFEE_TIME_OPTIONS.timeStyle).to.equal(undefined);
  expect(() => new Intl.DateTimeFormat('en-GB', UMBRACOFFEE_TIME_OPTIONS).format(MOMENT)).to.not.throw();
});
