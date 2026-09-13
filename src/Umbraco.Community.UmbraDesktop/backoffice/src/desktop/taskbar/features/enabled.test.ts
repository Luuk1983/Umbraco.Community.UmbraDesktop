import { expect } from '@open-wc/testing';
import type { UmbraDesktopTaskbarFeature } from './types';
import { isFeatureEnabled, withFeatureEnabled } from './enabled.js';

/**
 * The stored map holds only the features a user has an opinion about, so a feature added in a
 * later release still arrives switched on for someone whose payload predates it. Same shape as
 * `UMBRADESKTOP_DEFAULT_PINNED`: a default that applies until the user says otherwise, not a value
 * written into everybody's storage on first boot.
 */

/** A stand-in feature. Nothing here renders, so only the two fields these functions read matter. */
const feature = (id: string, defaultEnabled: boolean): UmbraDesktopTaskbarFeature =>
  ({ id, defaultEnabled }) as UmbraDesktopTaskbarFeature;

describe('whether a feature is on', () => {
  it('takes the feature default when the user has no opinion', () => {
    expect(isFeatureEnabled({}, feature('ai-chat', true))).to.equal(true);
    expect(isFeatureEnabled({}, feature('later', false))).to.equal(false);
  });

  it('takes the feature default when nothing is stored at all', () => {
    expect(isFeatureEnabled(undefined, feature('ai-chat', true))).to.equal(true);
  });

  it('prefers the stored choice over the default, in both directions', () => {
    expect(isFeatureEnabled({ 'ai-chat': false }, feature('ai-chat', true))).to.equal(false);
    expect(isFeatureEnabled({ 'ai-chat': true }, feature('ai-chat', false))).to.equal(true);
  });

  it('ignores an entry for another feature', () => {
    expect(isFeatureEnabled({ 'pinned-apps': false }, feature('ai-chat', true))).to.equal(true);
  });
});

describe('switching a feature', () => {
  it('records the choice under the feature id', () => {
    expect(withFeatureEnabled({}, 'ai-chat', false)).to.deep.equal({ 'ai-chat': false });
  });

  it('records a choice that matches the default, so it survives a change of default', () => {
    // Switching on and off again has to leave a value rather than an absence: an absence means
    // "whatever the shell thinks", which is a different answer from "the user wants it on".
    expect(withFeatureEnabled({ 'ai-chat': false }, 'ai-chat', true)).to.deep.equal({ 'ai-chat': true });
  });

  it('leaves every other feature alone', () => {
    expect(withFeatureEnabled({ 'pinned-apps': false }, 'ai-chat', false)).to.deep.equal({
      'pinned-apps': false,
      'ai-chat': false,
    });
  });

  it('does not mutate the map it is given', () => {
    const before = { 'ai-chat': true };
    withFeatureEnabled(before, 'ai-chat', false);
    expect(before).to.deep.equal({ 'ai-chat': true });
  });
});
