import { expect } from '@open-wc/testing';
import { groups } from './groups';
import { entries as forms } from './forms';
import { entries as workflow } from './workflow';
import { entries as deploy } from './deploy';
import { entries as uiBuilder } from './ui-builder';
import { entries as commerce } from './commerce';
import { entries as engage } from './engage';
import { entries as automate } from './automate';
import { entries as ai } from './ai';
import { catalogue } from './index';

/**
 * Invariants shared by the eight commercial-package fragments. Each fragment is a handful of data
 * literals, so the risk is never logic — it is an alias that does not exist, a group that does not
 * exist, or a `url` where a `ref` belongs. The last one is the expensive mistake: a `url` is not
 * checked against the registry, so it ships a tile that opens a 404 on every install without that
 * package. Cases are added here as each fragment lands.
 */

describe('the marketing-sales group', () => {
  it('exists with a localised label', () => {
    const group = groups.find((g) => g.alias === 'marketing-sales');
    expect(group, 'Commerce and Engage have nowhere else to go').to.not.be.undefined;
    expect(group!.label).to.equal('#umbraDesktop_groupMarketingSales');
  });

  it('sorts between Editing and Development', () => {
    const weightOf = (alias: string) => groups.find((g) => g.alias === alias)!.weight!;
    expect(weightOf('marketing-sales')).to.be.greaterThan(weightOf('editing'));
    expect(weightOf('marketing-sales')).to.be.lessThan(weightOf('development'));
  });
});

describe('the workflow group', () => {
  it('exists with a localised label', () => {
    const group = groups.find((g) => g.alias === 'workflow');
    expect(group, "Workflow's four tools would swamp Editing's three core apps").to.not.be
      .undefined;
    expect(group!.label).to.equal('#umbraDesktop_groupWorkflow');
  });

  it('sorts between Editing and Marketing and sales', () => {
    const weightOf = (alias: string) => groups.find((g) => g.alias === alias)!.weight!;
    expect(weightOf('workflow')).to.be.greaterThan(weightOf('editing'));
    expect(weightOf('workflow')).to.be.lessThan(weightOf('marketing-sales'));
  });
});

describe('the automation group', () => {
  it('exists with a localised label', () => {
    const group = groups.find((g) => g.alias === 'automation');
    expect(group, 'Automate is a capability platform, not administrative plumbing').to.not.be
      .undefined;
    expect(group!.label).to.equal('#umbraDesktop_groupAutomation');
  });

  it('sorts between Diagnostics and AI', () => {
    // Beside AI rather than inside System: the two capability platforms sit together, ahead of
    // System, which stays the administrative catch-all it has always been.
    const weightOf = (alias: string) => groups.find((g) => g.alias === alias)!.weight!;
    expect(weightOf('automation')).to.be.greaterThan(weightOf('diagnostics'));
    expect(weightOf('automation')).to.be.lessThan(weightOf('ai'));
  });
});

describe('the ai group', () => {
  it('exists with a localised label', () => {
    const group = groups.find((g) => g.alias === 'ai');
    expect(group, 'AI ships add-on packages that will earn their own entries').to.not.be.undefined;
    expect(group!.label).to.equal('#umbraDesktop_groupAi');
  });

  it('sorts between Diagnostics and System', () => {
    const weightOf = (alias: string) => groups.find((g) => g.alias === alias)!.weight!;
    expect(weightOf('ai')).to.be.greaterThan(weightOf('diagnostics'));
    expect(weightOf('ai')).to.be.lessThan(weightOf('system'));
  });
});

describe('Forms', () => {
  it('is one entry, the section itself', () => {
    expect(forms.map((e) => e.ref)).to.deep.equal(['Umb.Section.Forms']);
  });

  it('opens full-section, because the Forms sidebar is the navigation', () => {
    expect(forms[0].chromeProfile).to.equal('full-section');
  });

  it('inherits its name and supplies a core icon', () => {
    expect(forms[0].name, 'the section manifest label is #sections_forms').to.be.undefined;
    expect(forms[0].icon, 'a section manifest carries no icon').to.equal('icon-umb-contour');
  });
});

describe('Workflow', () => {
  it('carries the section plus its three Content-section dashboards', () => {
    expect(workflow.map((e) => e.ref)).to.deep.equal([
      'Umb.Section.Workflow',
      'workflow.editor.dashboard',
      'Workflow.AdvancedSearch.Dashboard',
      'Workflow.ReleaseSets.Dashboard',
    ]);
  });

  it('names the dashboards itself, because two would otherwise read as "Workflow"', () => {
    // workflow.editor.dashboard's label is #workflow_workflow — the same string as the section's.
    const dashboards = workflow.filter((e) => e.ref !== 'Umb.Section.Workflow');
    for (const entry of dashboards) {
      expect(entry.name, `${entry.alias} must name itself`).to.be.a('string');
    }
    expect(workflow[0].name, 'the section inherits #workflow_workflow').to.be.undefined;
  });

  it('evaluates only the two conditions the desktop can answer', () => {
    const search = workflow.find((e) => e.alias === 'workflow-search')!;
    const releaseSets = workflow.find((e) => e.alias === 'workflow-release-sets')!;
    expect(search.evaluateConditions).to.deep.equal(['Workflow.Condition.UserPermission']);
    expect(releaseSets.evaluateConditions).to.deep.equal([
      'Workflow.Condition.UserPermission',
      'Workflow.Condition.SettingEnabled',
    ]);
  });

  it('leaves the dashboards ungated, so the adapter derives Content from the manifest', () => {
    for (const entry of workflow) {
      expect(entry.section, `${entry.alias} must not hardcode a section`).to.be.undefined;
    }
  });

  it('lands all four entries in the workflow group, not Editing', () => {
    for (const entry of workflow) {
      expect(entry.group, `${entry.alias} must be in the workflow group`).to.equal('workflow');
    }
  });
});

describe('Deploy', () => {
  it('carries both majors, v17 dashboards then v18 menu items', () => {
    expect(deploy.map((e) => e.ref)).to.deep.equal([
      'Deploy.Management.Dashboard',
      'Deploy.Environments.Dashboard',
      'Deploy.MenuItem.Status',
      'Deploy.MenuItem.Schema',
      'Deploy.MenuItem.Configuration',
    ]);
  });

  it('gates the v18 menu items on Settings and leaves the v17 dashboards to derive', () => {
    const menuItems = deploy.filter((e) => e.ref!.startsWith('Deploy.MenuItem.'));
    const dashboards = deploy.filter((e) => e.ref!.endsWith('.Dashboard'));
    for (const entry of menuItems) {
      expect(entry.section, `${entry.alias} infers its URL from the section prefix`).to.equal(
        'Umb.Section.Settings',
      );
    }
    for (const entry of dashboards) {
      expect(entry.section, `${entry.alias} derives its gate from the manifest`).to.be.undefined;
    }
  });

  it('names every entry itself, because "Status" and "Schema" say nothing on a tile', () => {
    for (const entry of deploy) {
      expect(entry.name, `${entry.alias} must name itself`).to.be.a('string');
    }
  });

  it('resolves everything by ref, so the wrong major drops silently', () => {
    for (const entry of deploy) {
      expect(entry.ref, `${entry.alias} must resolve through the registry`).to.be.a('string');
      expect(entry.url, `${entry.alias} must not hardcode a URL`).to.be.undefined;
    }
  });
});

describe('UI Builder', () => {
  it('is its one static surface, the Settings menu item', () => {
    expect(uiBuilder.map((e) => e.ref)).to.deep.equal(['UiBuilder.MenuItem.Settings']);
    expect(uiBuilder[0].section).to.equal('Umb.Section.Settings');
  });

  it('inherits both name and icon, which the menu item supplies', () => {
    expect(uiBuilder[0].name).to.be.undefined;
    expect(uiBuilder[0].icon).to.be.undefined;
  });
});

describe('Commerce', () => {
  it('references the bare alias "commerce", which is not a typo', () => {
    // Commerce registers `alias: 'commerce'`, not `Umb.Section.Commerce`. Asserted so that a
    // well-meaning reviewer does not "fix" it into something that resolves to nothing.
    expect(commerce.map((e) => e.ref)).to.deep.equal(['commerce']);
  });

  it('lands in marketing-sales and opens full-section', () => {
    expect(commerce[0].group).to.equal('marketing-sales');
    expect(commerce[0].chromeProfile).to.equal('full-section');
  });
});

describe('Engage', () => {
  it('is the section plus its Settings configuration item', () => {
    expect(engage.map((e) => e.ref)).to.deep.equal([
      'Umb.Section.Engage',
      'Engage.MenuItem.Configuration',
    ]);
  });

  it('splits across two groups, because configuration is not marketing', () => {
    expect(engage[0].group).to.equal('marketing-sales');
    expect(engage[1].group).to.equal('system');
  });

  it('uses a core icon, because the package-registered one renders blank for unknown reasons', () => {
    expect(engage[0].icon, 'engage renders correctly in source but blank in the launcher').to.equal(
      'icon-megaphone',
    );
  });
});

describe('Automate', () => {
  it('is the section alone, referenced by alias so the pathname rename cannot break it', () => {
    expect(automate.map((e) => e.ref)).to.deep.equal(['Ua.Section.Automate']);
    expect(automate[0].url, 'the pathname is changing from automate to automation').to.be.undefined;
  });

  it('lands in its own group rather than System', () => {
    expect(automate[0].group).to.equal('automation');
  });
});

describe('Umbraco AI', () => {
  it('references the bare alias "ai", which is not a typo', () => {
    expect(ai.map((e) => e.ref)).to.deep.equal(['ai']);
  });

  it('lands in its own ai group, not system', () => {
    expect(ai[0].group).to.equal('ai');
  });
});

/** Every commercial fragment's entries, in the order the launcher will weigh them. */
const COMMERCIAL = [
  ...forms,
  ...workflow,
  ...deploy,
  ...uiBuilder,
  ...commerce,
  ...engage,
  ...automate,
  ...ai,
];

/** The only condition aliases the desktop may answer. See design §4.1. */
const ANSWERABLE_CONDITIONS = [
  'Workflow.Condition.UserPermission',
  'Workflow.Condition.SettingEnabled',
  'Ua.Condition.WorkspacesExist',
];

/**
 * The size a *commercial* `full-section` entry opens at: it frames the whole section, sidebar
 * included, so it starts at the size a section already needs and never shrinks below what its own
 * sidebar requires — hence no floor. Scoped to the commercial entries checked below: seven
 * pre-existing full-section entries (Content, Media, Settings, Packages, Users, Members,
 * Translation) are 960x680, and this constant is never applied to them.
 */
const FULL_SECTION_SIZE = { w: 1100, h: 760 };

/**
 * A `bare`/`workspace-only` entry frames a single dashboard or workspace rather than a whole
 * section. It has no sidebar of its own to lean on, so it opens larger, and it carries a resize
 * floor below which its own content stops working — a constraint a full section, with its own
 * sidebar doing the layout, does not have.
 */
const DASHBOARD_SIZE = { w: 1200, h: 780 };

/** The resize floor that goes with {@link DASHBOARD_SIZE}. */
const DASHBOARD_MIN_SIZE = { w: 900, h: 540 };

/** Whether `actual` is exactly `expected`, or both are absent when `expected` is undefined. */
const sizeMatches = (
  actual: { w: number; h: number } | undefined,
  expected: { w: number; h: number } | undefined,
) => {
  if (expected === undefined) return actual === undefined;
  return actual !== undefined && actual.w === expected.w && actual.h === expected.h;
};

/**
 * The registry surface each commercial `ref` points at, transcribed from the packages' own
 * manifests. Kept explicit rather than inferred from the alias, because the alias is a naming
 * convention and the type is what actually decides whether the entry needs a `section`: a
 * menu-item manifest does not say which section it belongs to, so `inferUrl` cannot build its URL
 * without one, while a dashboard and a section both derive their own.
 */
const REF_TYPES: Record<string, 'section' | 'dashboard' | 'menuItem'> = {
  'Umb.Section.Forms': 'section',
  'Umb.Section.Workflow': 'section',
  'workflow.editor.dashboard': 'dashboard',
  'Workflow.AdvancedSearch.Dashboard': 'dashboard',
  'Workflow.ReleaseSets.Dashboard': 'dashboard',
  'Deploy.Management.Dashboard': 'dashboard',
  'Deploy.Environments.Dashboard': 'dashboard',
  'Deploy.MenuItem.Status': 'menuItem',
  'Deploy.MenuItem.Schema': 'menuItem',
  'Deploy.MenuItem.Configuration': 'menuItem',
  'UiBuilder.MenuItem.Settings': 'menuItem',
  commerce: 'section',
  'Umb.Section.Engage': 'section',
  'Engage.MenuItem.Configuration': 'menuItem',
  'Ua.Section.Automate': 'section',
  ai: 'section',
};

describe('every commercial entry', () => {
  it('is sixteen entries', () => {
    expect(COMMERCIAL).to.have.lengthOf(16);
  });

  it('resolves by ref and hardcodes no URL', () => {
    // The load-bearing invariant. A `ref` is checked against the registry, so an absent package
    // drops the app; a `url` is not, so it ships a tile that 404s on every install without it.
    for (const entry of COMMERCIAL) {
      expect(entry.ref, `${entry.alias} must resolve through the registry`).to.be.a('string');
      expect(entry.url, `${entry.alias} must not hardcode a URL`).to.be.undefined;
    }
  });

  it('names a group that exists', () => {
    const known = new Set(catalogue.groups.map((g) => g.alias));
    for (const entry of COMMERCIAL) {
      expect(known.has(entry.group!), `${entry.alias} points at unknown group "${entry.group}"`).to
        .be.true;
    }
  });

  it('gates every menu-item ref on a section, and no other ref', () => {
    // A menu item's manifest does not say which section it belongs to, so `inferUrl` cannot build
    // its URL without one — the entry would resolve to null and vanish. A dashboard and a section
    // both derive their own, and stating one there would override the manifest with a guess.
    for (const entry of COMMERCIAL) {
      expect(
        REF_TYPES[entry.ref!],
        `${entry.alias} (${entry.ref}) is missing from REF_TYPES`,
      ).to.not.be.undefined;
      const isMenuItem = REF_TYPES[entry.ref!] === 'menuItem';
      expect(
        entry.section !== undefined,
        `${entry.alias} (${entry.ref}) ${isMenuItem ? 'needs' : 'must not declare'} a section`,
      ).to.equal(isMenuItem);
    }
  });

  it('sizes full-section entries as sections, and bare/workspace-only entries as dashboards', () => {
    // Commerce and Engage's section entries slipped in at dashboard size (design plan copied
    // faithfully, but nothing about either section is denser than Forms). Pin the convention so a
    // future entry that copies the wrong neighbour fails here instead of shipping a stray floor.
    const misSizedFullSections = COMMERCIAL.filter(
      (entry) =>
        entry.chromeProfile === 'full-section' &&
        (!sizeMatches(entry.defaultSize, FULL_SECTION_SIZE) || entry.minSize !== undefined),
    ).map((entry) => entry.alias);
    expect(
      misSizedFullSections,
      `full-section entries must be ${FULL_SECTION_SIZE.w}x${FULL_SECTION_SIZE.h} with no minSize`,
    ).to.deep.equal([]);

    const misSizedDashboards = COMMERCIAL.filter(
      (entry) =>
        entry.chromeProfile !== 'full-section' &&
        (!sizeMatches(entry.defaultSize, DASHBOARD_SIZE) ||
          !sizeMatches(entry.minSize, DASHBOARD_MIN_SIZE)),
    ).map((entry) => entry.alias);
    expect(
      misSizedDashboards,
      `bare/workspace-only entries must be ${DASHBOARD_SIZE.w}x${DASHBOARD_SIZE.h} floored at ${DASHBOARD_MIN_SIZE.w}x${DASHBOARD_MIN_SIZE.h}`,
    ).to.deep.equal([]);
  });

  it('evaluates only conditions the desktop can answer', () => {
    // Naming a mount-dependent condition here would deny the entry on every install, because the
    // desktop shell is mounted in its own section rather than the app's. Fail here instead.
    for (const entry of COMMERCIAL) {
      for (const alias of entry.evaluateConditions ?? []) {
        expect(
          ANSWERABLE_CONDITIONS,
          `${entry.alias} evaluates "${alias}", which is not a documented answerable condition`,
        ).to.contain(alias);
      }
    }
  });

  it('reaches the collated catalogue', () => {
    const collated = new Set(catalogue.entries.map((e) => e.alias));
    for (const entry of COMMERCIAL) {
      expect(collated.has(entry.alias), `${entry.alias} is not spread into index.ts`).to.be.true;
    }
  });
});

describe('the collated catalogue', () => {
  it('gives every entry a unique alias', () => {
    // Aliases key pinned favourites, so a duplicate silently steals another app's pin.
    const aliases = catalogue.entries.map((e) => e.alias);
    expect(new Set(aliases).size, `duplicate alias among ${aliases.join(', ')}`).to.equal(
      aliases.length,
    );
  });

  it('gives every entry a unique weight within its group', () => {
    const byGroup = new Map<string, number[]>();
    for (const entry of catalogue.entries) {
      const weights = byGroup.get(entry.group!) ?? [];
      weights.push(entry.weight!);
      byGroup.set(entry.group!, weights);
    }
    for (const [group, weights] of byGroup) {
      expect(new Set(weights).size, `${group} has two entries at the same weight`).to.equal(
        weights.length,
      );
    }
  });
});
