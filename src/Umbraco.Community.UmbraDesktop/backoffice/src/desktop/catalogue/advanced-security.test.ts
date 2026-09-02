import { expect } from '@open-wc/testing';
import { entries } from './advanced-security';
import { groups } from './groups';

/**
 * The Advanced Permissions fragment carries the whole v18 surface (8 tools) while the v17
 * release of that package registers only 4 of them. Nothing detects the package version —
 * the fragment relies entirely on `ref` resolution dropping an app whose menu item is not
 * registered. These tests lock the invariants that make that work, because an entry written
 * with `url` instead of `ref` would silently ship four dead tiles to every v17 install.
 */

/** Every menu-item alias the fragment references, in launcher order. */
const EXPECTED_REFS = [
  'UAP.MenuItem.PermissionsEditor',
  'UAP.MenuItem.AccessViewer',
  'UAP.MenuItem.DocTypePermissions',
  'UAP.MenuItem.InsertOptions',
  'UAP.MenuItem.LibraryPermissions',
  'UAP.MenuItem.LibraryAccessViewer',
  'UAP.MenuItem.ElementTypePermissions',
  'UAP.MenuItem.LibraryInsertOptions',
];

it('covers the full v18 Advanced Permissions surface', () => {
  expect(entries.map((e) => e.ref)).to.deep.equal(EXPECTED_REFS);
});

it('references every tool by ref so an absent menu item drops the app', () => {
  for (const e of entries) {
    expect(e.ref, `${e.alias} must resolve through the registry`).to.be.a('string');
    expect(e.url, `${e.alias} must not hardcode a URL`).to.be.undefined;
  }
});

it('marks every entry optional so a v17 install stays quiet', () => {
  for (const e of entries) {
    expect(e.optional, `${e.alias} must be optional`).to.be.true;
  }
});

it('gates every entry on the Users section', () => {
  for (const e of entries) {
    expect(e.section, `${e.alias} needs the section gate its menu-item ref infers from`).to.equal(
      'Umb.Section.Users',
    );
  }
});

it('places every entry in the advanced-security group', () => {
  for (const e of entries) {
    expect(e.group, `${e.alias} must land in advanced-security`).to.equal('advanced-security');
  }
});

it('gives every entry a unique alias and an explicit name', () => {
  const aliases = entries.map((e) => e.alias);
  expect(new Set(aliases).size, 'aliases must be unique — they key pinned favourites').to.equal(
    aliases.length,
  );
  for (const e of entries) {
    // Four v18 menu items share the label '#uap_menuItem_permissionsEditor', so an inherited
    // name would give four identical tiles. Every entry names itself.
    expect(e.name, `${e.alias} must name itself rather than inherit`).to.be.a('string');
  }
});

it('opens every tool workspace-only — the UAP workspaces carry their own selection panel', () => {
  for (const e of entries) {
    expect(e.chromeProfile, `${e.alias} should strip the Users sidebar`).to.equal('workspace-only');
  }
});

it('declares the security and advanced-security groups, ordered adjacently', () => {
  const security = groups.find((g) => g.alias === 'security');
  const advanced = groups.find((g) => g.alias === 'advanced-security');
  expect(security, 'the renamed Security group must exist').to.not.be.undefined;
  expect(advanced, 'the Advanced security group must exist').to.not.be.undefined;
  expect(groups.some((g) => g.alias === 'users-members'), 'users-members is renamed away').to.be
    .false;
  expect(advanced!.weight!).to.be.greaterThan(security!.weight!);
  const between = groups.filter(
    (g) => (g.weight ?? 0) > security!.weight! && (g.weight ?? 0) < advanced!.weight!,
  );
  expect(between, 'nothing may sort between Security and Advanced security').to.be.empty;
});
