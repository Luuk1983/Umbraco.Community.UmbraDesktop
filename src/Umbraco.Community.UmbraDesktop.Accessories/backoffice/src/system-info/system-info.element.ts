import { SYSTEM_INFO_BAR_PX, SYSTEM_INFO_GENERAL_PX, SYSTEM_INFO_PADDING_PX, SYSTEM_INFO_SIDE_PX } from './constants.js';
import {
  browserName,
  colourDepth,
  formatBytes,
  formatUptime,
  memorySize,
  operatingSystem,
  packageVersion,
  releaseVersion,
  reportText,
  themeName,
} from './facts.js';
import type { ReportSection } from './facts.js';
import { createSystemInfoSource } from './source.js';
import type { MachineFacts, ServerFacts, SystemInfoSource } from './source.js';
import { AREA } from '../shared/area.js';
import { copyToClipboard } from '../shared/clipboard.js';
import { accessoryStyles } from '../shared/styles.js';
import { UMBRACO_BLUE, UMBRACO_LOGO_PATH, UMBRACO_LOGO_SIZE, UMBRACO_LOGO_VIEWBOX } from '../shared/umbraco-logo.js';
import { css, customElement, html, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/** The host package's id, whose version is the desktop's. */
const DESKTOP_PACKAGE_ID = 'Umbraco.Community.UmbraDesktop';

/** This package's id. */
const ACCESSORIES_PACKAGE_ID = 'Umbraco.Community.UmbraDesktop.Accessories';

/** The two tabs, as Windows 98's System Properties had General first. */
type Tab = 'general' | 'details';

/**
 * System Information: what this desktop is running on, the way Windows 98 said it in System
 * Properties and in System Information.
 *
 * **General** is System Properties' General tab, group for group: *System* (Umbraco's version, the
 * desktop's, and the theme), *Registered to* (the signed-in user, where Windows put the licence
 * holder), and *Computer* (the site, the browser and the machine it runs on). **Details** is
 * System Information's tree of categories: Umbraco, Desktop, Server, Computer and Installed
 * packages. **Copy** puts all of it on the clipboard as text, which is what anybody asking for help
 * is asked for first.
 *
 * Everything shown is what Umbraco and the browser report, and nothing is guessed: a browser that
 * will not say how much memory there is gets no memory line, and a server that keeps its details to
 * administrators says so. The server's details are the ones Umbraco's own Help > System information
 * shows, from the same endpoints.
 */
@customElement('umbradesktop-system-info')
export class SystemInfoElement extends UmbLitElement {
  /** Where the facts come from. The server and the browser unless a test says otherwise. */
  @property({ attribute: false })
  source?: SystemInfoSource;

  /** How text reaches the clipboard. The real clipboard unless a test says otherwise. */
  @property({ attribute: false })
  copyText: (text: string) => Promise<boolean> = copyToClipboard;

  /**
   * The active theme's id, which the desktop stamps on every app and restamps when it changes
   * (`docs/desktop-apps.md` §5). Read here as a fact to report, not only as a style hook.
   */
  @property({ attribute: 'data-umbradesktop-theme' })
  theme?: string;

  /** The tab on show. */
  @state()
  private _tab: Tab = 'general';

  /** The Details category on show, by index. */
  @state()
  private _section = 0;

  /** What the server said, once it has. */
  @state()
  private _server?: ServerFacts;

  /** What the browser said, once it has. */
  @state()
  private _machine?: MachineFacts;

  /** A message beside the buttons. */
  @state()
  private _notice = '';

  /** Ask for the facts as the window opens. */
  override connectedCallback(): void {
    super.connectedCallback();
    const source = this.source ?? createSystemInfoSource(this);
    void source.server().then((server) => (this._server = server));
    void source.machine().then((machine) => (this._machine = machine));
  }

  /**
   * One word from this package's dictionary.
   * @param key The key inside the area.
   * @param fallback The English, shown if the dictionary has not loaded.
   * @param args Values for `%0%` and on.
   * @returns The localised string, with the fallback's `%0%` filled too.
   */
  #term(key: string, fallback: string, ...args: unknown[]): string {
    return this.localize
      .termOrDefault(`${AREA}_${key}`, fallback, ...args)
      .replace(/%(\d+)%/g, (token, index: string) => String(args[Number(index)] ?? token));
  }

  /** Words for a fact that could not be read. */
  get #unknown(): string {
    return this.#term('systemInfoUnknown', 'Could not be read');
  }

  /**
   * Umbraco's name and release, for General. Details has the full version, build and all.
   * @returns "Umbraco 17.7.0", or that it could not be read.
   */
  #umbraco(): string {
    const version = this._server?.information?.version;
    return version ? `Umbraco ${releaseVersion(version)}` : this.#term('systemInfoUmbracoUnknown', 'Umbraco (the version could not be read)');
  }

  /**
   * A package's version among the installed ones.
   * @param id The package id.
   * @returns The version, or the words for unknown.
   */
  #version(id: string): string {
    return packageVersion(this._server?.packages ?? [], id) ?? this.#unknown;
  }

  /**
   * The browser and the operating system under it.
   * @param machine The browser's facts.
   * @returns "Firefox 131 on Linux".
   */
  #browserOn(machine: MachineFacts): string {
    const system = operatingSystem(machine.userAgent, machine.platform);
    const browser = browserName(machine.userAgent);
    return system ? this.#term('systemInfoBrowserOn', '%0% on %1%', browser, system) : browser;
  }

  /**
   * The processors and memory, as the Computer group's last line.
   * @param machine The browser's facts.
   * @returns "8 logical processors, 8 GB or more RAM", or whichever half the browser gives.
   */
  #hardware(machine: MachineFacts): string {
    const parts: string[] = [];
    if (machine.processors) parts.push(this.#term('systemInfoProcessors', '%0% logical processors', machine.processors));
    const memory = memorySize(machine.memoryGb);
    if (memory) parts.push(this.#term('systemInfoRam', '%0% RAM', memory));
    return parts.join(', ');
  }

  /**
   * The report: Details' categories, and what Copy copies.
   * @returns The sections, in order.
   */
  #sections(): ReportSection[] {
    const server = this._server;
    const machine = this._machine;
    const information = server?.information;
    const row = (key: string, english: string, value: string | undefined): [string, string] => [
      this.#term(key, english),
      value ?? this.#unknown,
    ];
    const troubleshooting = server?.troubleshooting;
    const memory = memorySize(machine?.memoryGb);
    return [
      {
        heading: this.#term('systemInfoSectionUmbraco', 'Umbraco'),
        rows: [
          row('systemInfoVersion', 'Version', information?.version),
          row('systemInfoAssemblyVersion', 'Assembly version', information?.assemblyVersion),
          row('systemInfoRuntimeMode', 'Runtime mode', information?.runtimeMode),
          row('systemInfoServerOffset', 'Server time offset', information?.baseUtcOffset),
        ],
      },
      {
        heading: this.#term('systemInfoSectionDesktop', 'Desktop'),
        rows: [
          row('systemInfoDesktopVersion', 'UmbraDesktop', this.#version(DESKTOP_PACKAGE_ID)),
          row('systemInfoAccessoriesVersion', 'Accessories', this.#version(ACCESSORIES_PACKAGE_ID)),
          row('systemInfoTheme', 'Theme', themeName(this.theme)),
          row('systemInfoLanguage', 'Backoffice language', this.localize.lang() || undefined),
          row('systemInfoRegisteredTo', 'Registered to', server?.user?.name),
          row('systemInfoEmail', 'Email', server?.user?.email),
        ],
      },
      {
        heading: this.#term('systemInfoSectionServer', 'Server'),
        rows:
          troubleshooting === 'denied'
            ? [[this.#term('systemInfoDetails', 'Details'), this.#term('systemInfoDenied', 'Not available to your account')]]
            : troubleshooting
              ? troubleshooting.map(({ name, data }): [string, string] => [name, data])
              : [[this.#term('systemInfoDetails', 'Details'), this.#unknown]],
      },
      {
        heading: this.#term('systemInfoSectionComputer', 'Computer'),
        rows: machine
          ? [
              row('systemInfoSite', 'Site', machine.host),
              row('systemInfoBrowser', 'Browser', browserName(machine.userAgent)),
              row('systemInfoOs', 'Operating system', operatingSystem(machine.userAgent, machine.platform)),
              row('systemInfoProcessorCount', 'Processors', machine.processors?.toString()),
              row('systemInfoMemory', 'Memory', memory ?? this.#term('systemInfoNotReported', 'Not reported by this browser')),
              row('systemInfoGraphics', 'Graphics', machine.graphics ?? this.#term('systemInfoNotReported', 'Not reported by this browser')),
              row('systemInfoDisplay', 'Display', `${machine.screen.width} × ${machine.screen.height}`),
              row('systemInfoColours', 'Colours', colourDepth(machine.screen.colorDepth)),
              row('systemInfoPixelRatio', 'Pixel ratio', `${machine.pixelRatio}×`),
              row(
                'systemInfoStorage',
                'Stored by this site',
                machine.storage &&
                  this.#term('systemInfoStorageOf', '%0% of %1%', formatBytes(machine.storage.usage), formatBytes(machine.storage.quota)),
              ),
              row('systemInfoBrowserLanguage', 'Browser language', machine.language),
              row('systemInfoTimeZone', 'Time zone', machine.timeZone),
              row('systemInfoUptime', 'Up time', formatUptime(machine.uptimeMs)),
            ]
          : [],
      },
      {
        heading: this.#term('systemInfoSectionPackages', 'Installed packages'),
        // Only for users with the Packages section, and left out of the copied report for everyone
        // else too, since the report is this same table. See ServerFacts.packagesVisible.
        rows: server?.packagesVisible
          ? [...(server.packages ?? [])]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((installed): [string, string] => [installed.name, installed.version || this.#unknown])
          : [
              [
                this.#term('systemInfoSectionPackages', 'Installed packages'),
                this.#term('systemInfoPackagesDenied', 'Only users with the Packages section can see these'),
              ],
            ],
      },
    ];
  }

  /** Copy the whole report, and say how that went. */
  async #copy(): Promise<void> {
    const copied = await this.copyText(reportText(this.#sections()));
    this._notice = copied
      ? this.#term('systemInfoCopied', 'Copied to the clipboard.')
      : this.#term('systemInfoCopyFailed', 'Could not copy.');
  }

  /**
   * The Umbraco logo, from the path in Umbraco's own `icon-umbraco` (see `shared/umbraco-logo.ts`).
   *
   * The mark is a disc with the U cut out of it, so a white disc sits underneath, a little smaller
   * than the blue one so no white shows at the edge. That keeps the U white on every theme, as it
   * is in the logo, rather than whatever colour the window happens to be.
   * @returns The logo.
   */
  #renderLogo() {
    const half = UMBRACO_LOGO_SIZE / 2;
    return html`<svg class="logo" viewBox=${UMBRACO_LOGO_VIEWBOX} aria-hidden="true">
      <circle cx=${half} cy=${half} r=${half * 0.95} fill="#fff"></circle>
      <path d=${UMBRACO_LOGO_PATH} fill=${UMBRACO_BLUE}></path>
    </svg>`;
  }

  /**
   * One group of the General tab: a caption and its lines, as System Properties set them out.
   * @param id The group's id, for tests and styles.
   * @param caption The caption.
   * @param lines Its lines; empty ones are left out.
   * @returns The group.
   */
  #renderGroup(id: string, caption: string, lines: Array<string | undefined>) {
    return html`<div class="group" data-group=${id}>
      <span class="caption">${caption}</span>
      ${lines.filter(Boolean).map((line) => html`<span class="line">${line}</span>`)}
    </div>`;
  }

  /**
   * The General tab.
   * @returns System, Registered to and Computer, beside the logo.
   */
  #renderGeneral() {
    const machine = this._machine;
    const theme = themeName(this.theme);
    return html`
      <div class="general">
        ${this.#renderLogo()}
        <div class="groups">
          ${this.#renderGroup('system', this.#term('systemInfoSystem', 'System:'), [
            this.#umbraco(),
            `UmbraDesktop ${this.#version(DESKTOP_PACKAGE_ID)}`,
            theme && this.#term('systemInfoThemeLine', '%0% theme', theme),
          ])}
          ${this.#renderGroup('registered', this.#term('systemInfoRegistered', 'Registered to:'), [
            this._server?.user?.name,
            this._server?.user?.email,
          ])}
          ${this.#renderGroup('computer', this.#term('systemInfoComputer', 'Computer:'), [
            machine?.host,
            machine && this.#browserOn(machine),
            machine && this.#hardware(machine),
          ])}
        </div>
      </div>
    `;
  }

  /**
   * The Details tab: the categories, and the chosen one's table.
   * @returns The tab.
   */
  #renderDetails() {
    const sections = this.#sections();
    const chosen = sections[this._section] ?? sections[0];
    return html`
      <div class="details">
        <div class="sections sunken" role="tablist" aria-orientation="vertical">
          ${sections.map(
            (section, index) =>
              html`<button
                class="section"
                role="tab"
                data-section=${index}
                aria-selected=${index === this._section ? 'true' : 'false'}
                @click=${() => (this._section = index)}>
                ${section.heading}
              </button>`,
          )}
        </div>
        <div class="table sunken" role="tabpanel">
          <table>
            <thead>
              <tr>
                <th>${this.#term('systemInfoItem', 'Item')}</th>
                <th>${this.#term('systemInfoValue', 'Value')}</th>
              </tr>
            </thead>
            <tbody>
              ${chosen.rows.map(([item, value]) => html`<tr><td>${item}</td><td>${value}</td></tr>`)}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /**
   * The window.
   * @returns The tabs, the tab on show, and the buttons.
   */
  override render() {
    const tab = (id: Tab, key: string, english: string) =>
      html`<button class="control" role="tab" data-tab=${id} aria-pressed=${this._tab === id ? 'true' : 'false'} @click=${() => (this._tab = id)}>
        ${this.#term(key, english)}
      </button>`;
    return html`
      <div class="bar" role="tablist">
        ${tab('general', 'systemInfoGeneral', 'General')} ${tab('details', 'systemInfoDetailsTab', 'Details')}
      </div>
      <div class="page">${this._tab === 'general' ? this.#renderGeneral() : this.#renderDetails()}</div>
      <div class="bar">
        ${this._notice ? html`<span class="notice" role="status">${this._notice}</span>` : html`<span class="notice"></span>`}
        <button class="control" data-action="copy" ?disabled=${!this._server || !this._machine} @click=${() => this.#copy()}>
          ${this.#term('systemInfoCopy', 'Copy all')}
        </button>
      </div>
    `;
  }

  /** The shared accessory look, and every fixed size from `constants.ts`, which the manifest sums. */
  static override styles = [
    accessoryStyles,
    css`
      :host {
        height: 100%;
        padding: ${SYSTEM_INFO_PADDING_PX}px;
        gap: ${SYSTEM_INFO_PADDING_PX}px;
      }

      .bar {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
        height: ${SYSTEM_INFO_BAR_PX}px;
      }

      .bar .control {
        height: ${SYSTEM_INFO_BAR_PX}px;
      }

      .notice {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.85em;
      }

      .page {
        flex: 1;
        min-height: ${SYSTEM_INFO_GENERAL_PX + 2}px;
        display: flex;
        flex-direction: column;
      }

      .general {
        display: flex;
        gap: ${SYSTEM_INFO_PADDING_PX}px;
        flex: 1;
      }

      .logo {
        flex-shrink: 0;
        width: ${SYSTEM_INFO_SIDE_PX - 24}px;
        height: ${SYSTEM_INFO_SIDE_PX - 24}px;
        margin: 8px 12px;
      }

      .groups {
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-width: 0;
      }

      .group {
        display: flex;
        flex-direction: column;
        line-height: 18px;
      }

      .line {
        padding-left: 1.5em;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .details {
        display: flex;
        gap: ${SYSTEM_INFO_PADDING_PX}px;
        flex: 1;
        min-height: 0;
      }

      .sections {
        flex: 0 0 ${SYSTEM_INFO_SIDE_PX}px;
        display: flex;
        flex-direction: column;
        padding: 2px;
        overflow: auto;
      }

      .section {
        padding: 4px 6px;
        border: none;
        background: none;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }

      .section[aria-selected='true'] {
        background: var(--umbradesktop-app-accent, var(--uui-color-selected));
        color: var(--umbradesktop-app-accent-text, var(--uui-color-surface));
      }

      .section:focus-visible {
        outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
        outline-offset: -2px;
      }

      .table {
        flex: 1;
        min-width: 0;
        overflow: auto;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.9em;
      }

      th {
        position: sticky;
        top: 0;
        background: var(--umbradesktop-app-surface-raised, var(--uui-color-surface-emphasis));
        font-weight: 600;
        text-align: left;
      }

      th,
      td {
        padding: 3px 8px;
        vertical-align: top;
        border-bottom: 1px solid var(--umbradesktop-app-border, var(--uui-color-border));
      }

      td:first-child {
        white-space: nowrap;
      }

      td:last-child {
        word-break: break-word;
      }
    `,
  ];
}

export { SystemInfoElement as element };

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so templates type-check. */
    'umbradesktop-system-info': SystemInfoElement;
  }
}
