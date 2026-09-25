import { expect, fixture, html } from '@open-wc/testing';
import './system-info.element.js';
import type { SystemInfoElement } from './system-info.element.js';
import type { MachineFacts, ServerFacts, SystemInfoSource } from './source.js';
import { UMBRACO_BLUE, UMBRACO_LOGO_PATH, UMBRACO_LOGO_VIEWBOX } from '../shared/umbraco-logo.js';

/**
 * System Information: Windows 98's System Properties General tab (System, Registered to, Computer)
 * and, under Details, System Information's categories. Driven by a fake source; `source.ts` is the
 * real server and browser, checked against a running Umbraco.
 */

const SERVER: ServerFacts = {
  information: { version: '17.7.0+d64a209', assemblyVersion: '17.7.0.0', baseUtcOffset: '+01:00', runtimeMode: 'BackofficeDevelopment' },
  troubleshooting: [
    { name: 'Server OS', data: 'Linux 6.8' },
    { name: 'Database Provider', data: 'Microsoft.Data.Sqlite' },
  ],
  packages: [
    { name: 'UmbraDesktop', id: 'Umbraco.Community.UmbraDesktop', version: '17.3.0' },
    { name: 'UmbraDesktop Accessories', id: 'Umbraco.Community.UmbraDesktop.Accessories', version: '17.3.0' },
    { name: 'Another', id: 'Another', version: '2.1.0' },
  ],
  user: { name: 'Grace Hopper', email: 'grace@example.test' },
  packagesVisible: true,
};

const MACHINE: MachineFacts = {
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
  host: 'cms.example.test',
  processors: 8,
  memoryGb: 8,
  screen: { width: 1920, height: 1080, colorDepth: 24 },
  pixelRatio: 2,
  language: 'en-GB',
  timeZone: 'Europe/London',
  uptimeMs: 3_723_000,
  graphics: 'ANGLE (Intel UHD Graphics 620)',
  storage: { usage: 2048, quota: 10 * 1024 ** 3 },
};

/**
 * A mounted System Information over a fake source.
 * @param server What the server says.
 * @param theme The theme id the desktop stamped on it.
 */
async function sysinfo(server: ServerFacts = SERVER, theme = 'win98') {
  const copied: string[] = [];
  const source: SystemInfoSource = { server: async () => server, machine: async () => MACHINE };
  const element = await fixture<SystemInfoElement>(html`<umbradesktop-system-info
    data-umbradesktop-theme=${theme}
    .source=${source}
    .copyText=${async (text: string) => {
      copied.push(text);
      return true;
    }}
  ></umbradesktop-system-info>`);
  await settle(element);
  return { element, copied };
}

/** Let the facts arrive and render. */
async function settle(element: SystemInfoElement): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    await element.updateComplete;
  }
}

/** The visible text, with whitespace run together. */
const text = (element: SystemInfoElement, selector = ':host') =>
  ((selector === ':host' ? element.shadowRoot! : element.shadowRoot!.querySelector(selector))?.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim();

/** Press a button by its data-action or data-section. */
async function press(element: SystemInfoElement, selector: string): Promise<void> {
  element.shadowRoot!.querySelector<HTMLElement>(selector)!.click();
  await settle(element);
}

describe('General', () => {
  /** The real Umbraco mark, from Umbraco's own icon, not a drawing that only resembles it. */
  it('shows the Umbraco logo', async () => {
    const { element } = await sysinfo();
    const logo = element.shadowRoot!.querySelector('svg.logo')!;
    expect(logo.getAttribute('viewBox')).to.equal(UMBRACO_LOGO_VIEWBOX);
    const path = logo.querySelector('path')!;
    expect(path.getAttribute('d')).to.equal(UMBRACO_LOGO_PATH);
    expect(path.getAttribute('fill')).to.equal(UMBRACO_BLUE);
  });

  it('says which Umbraco, which desktop and which theme, as System Properties said System', async () => {
    const { element } = await sysinfo();
    const system = text(element, '[data-group="system"]');
    expect(system).to.contain('Umbraco 17.7.0').and.to.not.contain('d64a209');
    expect(system).to.contain('UmbraDesktop 17.3.0');
    expect(system).to.contain('Windows 98');
  });

  it('says who it is registered to: the signed-in user', async () => {
    const { element } = await sysinfo();
    expect(text(element, '[data-group="registered"]')).to.contain('Grace Hopper').and.to.contain('grace@example.test');
  });

  it('describes the computer: the site, the browser, the processors and the memory', async () => {
    const { element } = await sysinfo();
    const computer = text(element, '[data-group="computer"]');
    expect(computer).to.contain('cms.example.test');
    expect(computer).to.contain('Firefox 131');
    expect(computer).to.contain('Linux');
    expect(computer).to.contain('8 GB or more');
  });

  /** The theme can change with the window open; the desktop restamps the attribute. */
  it('follows a change of theme', async () => {
    const { element } = await sysinfo();
    element.setAttribute('data-umbradesktop-theme', 'macos');
    await element.updateComplete;
    expect(text(element, '[data-group="system"]')).to.contain('macOS');
  });

  it('says so when the server’s version could not be read', async () => {
    const { element } = await sysinfo({ ...SERVER, information: undefined });
    expect(text(element, '[data-group="system"]')).to.contain('could not be read');
  });
});

describe('Details', () => {
  /** The details' sections, by name. */
  const sections = (element: SystemInfoElement) =>
    [...element.shadowRoot!.querySelectorAll('[data-section]')].map((each) => each.textContent!.trim());

  it('lists the categories, and opens on Umbraco', async () => {
    const { element } = await sysinfo();
    await press(element, '[data-tab="details"]');
    expect(sections(element)).to.deep.equal(['Umbraco', 'Desktop', 'Server', 'Computer', 'Installed packages']);
    expect(text(element, '.table')).to.contain('Runtime mode').and.to.contain('BackofficeDevelopment');
  });

  it('shows what the server reports about itself', async () => {
    const { element } = await sysinfo();
    await press(element, '[data-tab="details"]');
    await press(element, '[data-section="2"]');
    expect(text(element, '.table')).to.contain('Database Provider').and.to.contain('Microsoft.Data.Sqlite');
  });

  /** Umbraco decides who may see the server's details; the rest of the window still works. */
  it('says so when the server keeps its details to administrators', async () => {
    const { element } = await sysinfo({ ...SERVER, troubleshooting: 'denied' });
    await press(element, '[data-tab="details"]');
    await press(element, '[data-section="2"]');
    expect(text(element, '.table')).to.contain('Not available to your account');
  });

  it('describes the display in the old words', async () => {
    const { element } = await sysinfo();
    await press(element, '[data-tab="details"]');
    await press(element, '[data-section="3"]');
    const table = text(element, '.table');
    expect(table).to.contain('1920 × 1080');
    expect(table).to.contain('True Color (24 bit)');
    expect(table).to.contain('0:01:02:03');
  });

  /**
   * The list of installed packages is for people who manage packages. It is Umbraco's own manifest
   * endpoint, which every signed-in backoffice user can already call, so this hides it from the
   * window rather than keeping it secret; what it does do is stop the window laying the whole list
   * out for anyone who opens it. Shown to users with the Packages section, as Umbraco shows it.
   */
  it('keeps the installed packages to users with the Packages section', async () => {
    const { element } = await sysinfo({ ...SERVER, packagesVisible: false });
    await press(element, '[data-tab="details"]');
    await press(element, '[data-section="4"]');
    const table = text(element, '.table');
    expect(table, 'no package names').to.not.contain('Another');
    expect(table).to.contain('Packages section');
  });

  it('leaves the installed packages out of the copied report too, and keeps the desktop’s own version', async () => {
    const { element, copied } = await sysinfo({ ...SERVER, packagesVisible: false });
    await press(element, '[data-action="copy"]');
    expect(copied[0], 'no package names').to.not.contain('Another');
    expect(copied[0], 'the desktop is still named').to.contain('17.3.0');
  });

  it('lists every installed package with its version', async () => {
    const { element } = await sysinfo();
    await press(element, '[data-tab="details"]');
    await press(element, '[data-section="4"]');
    expect(text(element, '.table')).to.contain('Another').and.to.contain('2.1.0');
  });
});

it('copies the whole report as text, for a support request', async () => {
  const { element, copied } = await sysinfo();
  await press(element, '[data-action="copy"]');
  expect(copied).to.have.length(1);
  expect(copied[0]).to.contain('[Umbraco]').and.to.contain('17.7.0+d64a209').and.to.contain('[Installed packages]');
  expect(text(element, '.notice')).to.contain('Copied');
});
