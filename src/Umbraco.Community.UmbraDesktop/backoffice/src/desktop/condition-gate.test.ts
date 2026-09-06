import { expect } from '@open-wc/testing';
import { evaluableConditions, isPermitted } from './condition-gate';

/**
 * The gate's whole job is deciding what *not* to answer. A manifest's conditions are a mix of
 * mount-dependent ones the iframe answers correctly and user- or install-dependent ones the
 * desktop can answer early; only the second kind may be evaluated here, and an entry names them
 * explicitly. Getting this backwards hides an app on every install, so it is tested directly.
 */

const SECTION = { alias: 'Umb.Condition.SectionAlias', match: 'Umb.Section.Content' };
const PERMISSION = { alias: 'Workflow.Condition.UserPermission', match: 'Workflow.ReleaseSet.Read' };
const SETTING = { alias: 'Workflow.Condition.SettingEnabled', match: 'releaseSetsEnabled' };

describe('evaluableConditions', () => {
  it('keeps only the conditions the entry opted into', () => {
    const result = evaluableConditions(
      [SECTION, PERMISSION, SETTING],
      ['Workflow.Condition.UserPermission', 'Workflow.Condition.SettingEnabled'],
    );
    expect(result).to.deep.equal([PERMISSION, SETTING]);
  });

  it('evaluates nothing when the entry opted into nothing', () => {
    expect(evaluableConditions([SECTION, PERMISSION], undefined)).to.be.empty;
    expect(evaluableConditions([SECTION, PERMISSION], [])).to.be.empty;
  });

  it('ignores an opted-in alias the manifest does not actually carry', () => {
    expect(evaluableConditions([SECTION], ['Workflow.Condition.UserPermission'])).to.be.empty;
  });

  it('handles a manifest with no conditions at all', () => {
    expect(evaluableConditions(undefined, ['Workflow.Condition.UserPermission'])).to.be.empty;
  });
});

describe('isPermitted', () => {
  it('permits an entry with nothing to evaluate', () => {
    expect(isPermitted([])).to.be.true;
  });

  it('permits while a condition has not yet reported', () => {
    expect(isPermitted([undefined]), 'unknown must never hide an app').to.be.true;
    expect(isPermitted([true, undefined])).to.be.true;
  });

  it('permits when every condition has said yes', () => {
    expect(isPermitted([true, true])).to.be.true;
  });

  it('denies as soon as one condition has explicitly said no', () => {
    expect(isPermitted([false])).to.be.false;
    expect(isPermitted([true, false, undefined])).to.be.false;
  });
});
