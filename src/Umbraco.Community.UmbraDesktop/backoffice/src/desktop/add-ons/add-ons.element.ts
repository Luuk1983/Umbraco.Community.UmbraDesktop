import { css, customElement, html, nothing, property, repeat, state, styleMap } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMBRADESKTOP_DEFAULT_ICON, UMBRADESKTOP_OPEN_HELP_EVENT } from '../constants';
import { loadAddOns, type UmbraDesktopAddOnsData, type UmbraDesktopAddOnsSource } from './add-ons-data';
import { serverAddOnsSource } from './add-ons-source';
import { UMBRADESKTOP_ADD_ONS_APP_ICON } from './manifest';
import { installState, type UmbraDesktopAddOn } from './marketplace';
import { renderReadme } from './readme';

/**
 * The Help page the invitation links to: how to build an add-on and get it listed here. A page id
 * from the desktop's own docs, so the docs check fails the build if it ever moves.
 */
export const UMBRADESKTOP_ADD_ON_GUIDE_TARGET = 'umbradesktop/building-an-add-on';

/**
 * The Add-ons app (#188, Add-ons design): every add-on for the desktop that the Umbraco Marketplace
 * lists for this site's Umbraco major, ours first and then the community's, and per add-on what to
 * send to whoever builds the site.
 *
 * **It informs and never installs.** A NuGet package needs a code change, a build and a deploy, none
 * of which the backoffice can do, so there is no Install button and nothing that looks like one. The
 * not-installed state hands over a `dotnet add package` line to copy instead.
 *
 * Two views in one window, the list and one add-on's details, switched in place rather than routed:
 * the window is the app's own, and Back is the one way out of the details.
 *
 * Built from Umbraco's own pieces where they fit: `uui-tag` for the installed mark and the facts,
 * `uui-box` for the side panel, `uui-button` for every action, and `uui-button-copy-text` to copy
 * the install line. The line itself is a plain `code` that wraps, rather than core's
 * `umb-code-block`, whose block never wraps and scrolled the version out of the side panel (design §11). The card is the app's own markup, because none of
 * UUI's cards has a 16:9 cover, an author line and a three-line description (design §8).
 */
@customElement('umbradesktop-add-ons')
export class UmbraDesktopAddOnsElement extends UmbLitElement {
  /**
   * Where the facts come from. The real source unless a test hands over another before the element
   * connects.
   */
  @property({ attribute: false })
  source?: UmbraDesktopAddOnsSource;

  /** What is shown, once loaded. */
  @state()
  private _data?: UmbraDesktopAddOnsData;

  /** Whether a load is under way, which shows the loader in place of the list. */
  @state()
  private _loading = false;

  /** The add-on whose details are open, or undefined for the list. */
  @state()
  private _open?: UmbraDesktopAddOn;

  /** The Help product documenting the open add-on, once found. */
  @state()
  private _guide?: string;

  /** The open add-on's README, rendered once per opening so a re-render does not empty it. */
  #readme?: HTMLElement;

  /** How far the list was scrolled when an add-on was opened, so Back returns there. */
  #listScroll = 0;

  /** Whether the first load has been started, so a reconnect does not ask again. */
  #started = false;

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.#started) return;
    this.#started = true;
    this.source ??= serverAddOnsSource(this);
    void this.#load();
  }

  /** Loads, or loads again after "Try again". Never throws: `loadAddOns` cannot. */
  async #load(): Promise<void> {
    this._loading = true;
    this._data = await loadAddOns(this.source!);
    this._loading = false;
  }

  /**
   * Opens an add-on's details, and looks up its guide in Help when the site has it.
   * @param addOn The add-on.
   */
  #openDetails(addOn: UmbraDesktopAddOn): void {
    this.#listScroll = this.#scroller()?.scrollTop ?? 0;
    this._open = addOn;
    // One scroller serves both views, so the details would otherwise open as far down as the list was.
    this.updateComplete.then(() => this.#scroller()?.scrollTo(0, 0));
    this._guide = undefined;
    this.#readme = undefined;
    if (!this.#installedVersion(addOn)) return;
    this.source!.guide(addOn.id).then(
      (guide) => {
        if (this._open === addOn) this._guide = guide;
      },
      () => undefined,
    );
  }

  /** Back to the list, scrolled to where it was left. */
  #back(): void {
    this._open = undefined;
    this.updateComplete.then(() => this.#scroller()?.scrollTo(0, this.#listScroll));
  }

  /**
   * What scrolls: everything but the footer.
   * @returns The scroller, once rendered.
   */
  #scroller(): HTMLElement | null {
    return this.renderRoot.querySelector('.scroller');
  }

  /**
   * The version of an add-on this site runs.
   * @param addOn The add-on.
   * @returns The version, or undefined when it is not installed.
   */
  #installedVersion(addOn: UmbraDesktopAddOn): string | undefined {
    return this._data?.installed.get(addOn.id.toLowerCase());
  }

  /**
   * Asks the desktop to open Help at a target, through the published event, so the app needs no
   * reference to the Help context.
   * @param target A Help target string.
   */
  #openHelp(target: string): void {
    this.dispatchEvent(new CustomEvent(UMBRADESKTOP_OPEN_HELP_EVENT, { detail: { target }, bubbles: true, composed: true }));
  }

  /**
   * The text of a term with arguments.
   * @param key The key, without the area.
   * @param args What fills `%0%`, `%1%` and so on.
   * @returns The text.
   */
  #t(key: string, ...args: Array<string | number>): string {
    return this.localize.term(`umbraDesktop_${key}`, ...args);
  }

  override render() {
    if (!this._open && (!this._data || this._loading)) return html`<div class="loading"><uui-loader></uui-loader></div>`;
    return html`<div class="scroller">${this._open ? this.#renderDetails(this._open) : this.#renderList(this._data!)}</div>
      ${this.#renderFooter()}`;
  }

  /**
   * Where the list comes from, in a footer that stays at the bottom of the window whatever is
   * scrolled: the Marketplace for this site's Umbraco, or offline the list built into the desktop.
   * @returns The footer, or nothing before the first load.
   */
  #renderFooter() {
    const data = this._data;
    if (!data) return nothing;
    const text = !data.online
      ? this.#t('addOnsSourceOffline')
      : data.siteMajor === undefined
        ? this.#t('addOnsSourceAnyVersion')
        : this.#t('addOnsSource', data.siteMajor);
    return html`<footer><uui-icon name="icon-store"></uui-icon><span>${text}</span></footer>`;
  }

  /**
   * One section's heading: an icon, the name, and how many add-ons it holds, set large enough that
   * the two sections read as two at a glance.
   * @param icon The icon.
   * @param label The term key of the name.
   * @param count How many add-ons, or undefined to leave the count out.
   * @returns The heading.
   */
  #renderSectionHeading(icon: string, label: string, count: number | undefined) {
    return html`<h2 class="section-heading">
      <uui-icon name=${icon}></uui-icon><span>${this.#t(label)}</span>
      ${count ? html`<span class="count">${count}</span>` : nothing}
    </h2>`;
  }

  /**
   * The list: a header band, our section, the community's, and the invitation.
   *
   * The invitation takes the community's place while it has nothing to show, and otherwise closes the
   * list, so it is always there for whoever has something to list and never the first thing read.
   * @param data What to show.
   * @returns The list.
   */
  #renderList(data: UmbraDesktopAddOnsData) {
    const emptyCommunity = data.online && data.community.length === 0;
    return html`<header class="band">
        <div class="band-inner">
          <span class="band-icon"><uui-icon name=${UMBRADESKTOP_ADD_ONS_APP_ICON}></uui-icon></span>
          <div>
            <h1>${this.#t('appAddOns')}</h1>
            <p class="lede">${this.#t('addOnsIntro')}</p>
          </div>
        </div>
      </header>
      <div class="list">
      <section data-section="ours">
        ${this.#renderSectionHeading('icon-desktop', 'addOnsOurs', data.ours.length)}
        ${this.#renderGrid(data.ours)}
      </section>
      <section data-section="community">
        ${this.#renderSectionHeading('icon-users', 'addOnsCommunity', data.community.length)}
        ${data.online
          ? emptyCommunity
            ? this.#renderInvitation(data, true)
            : this.#renderGrid(data.community)
          : html`<div class="offline" role="status">
              <span>${this.#t('addOnsOffline')}</span>
              <uui-button class="retry" look="secondary" compact label=${this.#t('addOnsTryAgain')} @click=${() => this.#load()}></uui-button>
            </div>`}
      </section>
      ${emptyCommunity ? nothing : this.#renderInvitation(data, false)}
    </div>`;
  }

  /**
   * One section's cards.
   * @param addOns The add-ons.
   * @returns The grid.
   */
  #renderGrid(addOns: ReadonlyArray<UmbraDesktopAddOn>) {
    return html`<ul class="grid">
      ${repeat(
        addOns,
        (addOn) => addOn.id,
        (addOn) => html`<li>${this.#renderCard(addOn)}</li>`,
      )}
    </ul>`;
  }

  /**
   * One card. The whole card is one button, so anywhere on it opens the details, and the "Details ›"
   * at its foot says so without depending on a hover a touch screen does not have.
   * @param addOn The add-on.
   * @returns The card.
   */
  #renderCard(addOn: UmbraDesktopAddOn) {
    const installed = !!this.#installedVersion(addOn);
    return html`<button type="button" class="card" data-add-on=${addOn.id} @click=${() => this.#openDetails(addOn)}>
      ${this.#renderCover(addOn)}
      <span class="card-body">
        <span class="name">
          ${this.#renderIcon(addOn, 'icon')}
          <span class="name-text">
            <span class="title">${addOn.title}</span>
            ${addOn.authors ? html`<span class="by">${this.#t('addOnsBy', addOn.authors)}</span>` : nothing}
          </span>
        </span>
        <span class="description">${addOn.description}</span>
        <span class="card-foot">
          <uui-tag
            data-installed=${String(installed)}
            look=${installed ? 'primary' : 'secondary'}
            color=${installed ? 'positive' : 'default'}
            >${this.#t(installed ? 'addOnsInstalled' : 'addOnsNotInstalled')}</uui-tag
          >
          <span class="details-link">${this.#t('addOnsDetails')} ›</span>
        </span>
      </span>
    </button>`;
  }

  /**
   * A card's cover: the first screenshot, filled into the frame from the top; without one, the icon
   * on the colour the Marketplace reports as the icon's dominant one, so a card is never an empty box.
   * @param addOn The add-on.
   * @returns The cover.
   */
  #renderCover(addOn: UmbraDesktopAddOn) {
    const shot = addOn.screenshots[0];
    if (shot) return html`<span class="cover"><img src=${shot.url} alt="" loading="lazy" /></span>`;
    return html`<span class="cover fallback" style=${styleMap(addOn.color ? { backgroundColor: addOn.color } : {})}>
      ${this.#renderIcon(addOn, 'cover-icon')}
    </span>`;
  }

  /**
   * An add-on's icon, or the desktop's own app icon when it has none.
   * @param addOn The add-on.
   * @param className Which size: `icon`, `big-icon` or `cover-icon`.
   * @returns The icon.
   */
  #renderIcon(addOn: UmbraDesktopAddOn, className: string) {
    return addOn.icon
      ? html`<img class=${className} src=${addOn.icon} alt="" />`
      : html`<span class="${className} icon-fallback"><uui-icon name=${UMBRADESKTOP_DEFAULT_ICON}></uui-icon></span>`;
  }

  /**
   * The invitation to list an add-on here, which links to the developer guide in Help.
   * @param data What is shown, for the major it names.
   * @param none Whether it stands in for an empty community section, which it then says first.
   * @returns The invitation.
   */
  #renderInvitation(data: UmbraDesktopAddOnsData, none: boolean) {
    return html`<div class="invitation">
      <strong>
        ${none
          ? data.siteMajor === undefined
            ? this.#t('addOnsNoneYetAnyVersion')
            : this.#t('addOnsNoneYet', data.siteMajor)
          : this.#t('addOnsInviteTitle')}
      </strong>
      <p>${none ? `${this.#t('addOnsInviteTitle')} ` : nothing}${this.#t('addOnsInviteText')}</p>
      <uui-button look="secondary" compact label=${this.#t('addOnsInviteLink')} @click=${() => this.#openHelp(UMBRADESKTOP_ADD_ON_GUIDE_TARGET)}></uui-button>
    </div>`;
  }

  /**
   * One add-on's details: screenshots with captions and the README on the left; where it stands on
   * this site and where to read more on the right.
   * @param addOn The add-on.
   * @returns The page.
   */
  #renderDetails(addOn: UmbraDesktopAddOn) {
    const [first, ...rest] = addOn.screenshots;
    return html`<div class="details-page">
      <header class="band">
      <div class="band-inner details-band">
      <uui-button class="back" look="default" compact label=${this.#t('addOnsBack')} @click=${this.#back}>
        <uui-icon name="icon-navigation-left"></uui-icon>${this.#t('addOnsBack')}
      </uui-button>
      <div class="details-head">
        ${this.#renderIcon(addOn, 'big-icon')}
        <div>
          <h1>${addOn.title}</h1>
          ${addOn.authors ? html`<span class="by">${this.#t('addOnsBy', addOn.authors)}</span>` : nothing}
          <div class="facts">
            ${addOn.version ? html`<uui-tag look="secondary">${this.#t('addOnsVersion', addOn.version)}</uui-tag>` : nothing}
            ${addOn.majors.length ? html`<uui-tag look="secondary">${this.#t('addOnsUmbraco', addOn.majors.join(', '))}</uui-tag>` : nothing}
            ${addOn.licence ? html`<uui-tag look="secondary">${addOn.licence}</uui-tag>` : nothing}
            ${addOn.downloads !== undefined
              ? html`<uui-tag look="secondary">${this.#t('addOnsDownloads', this.localize.number(addOn.downloads))}</uui-tag>`
              : nothing}
          </div>
        </div>
      </div>
      </div>
      </header>
      <div class="details-grid">
        <div class="main">
          ${first ? this.#renderShot(first, 'shot') : nothing}
          ${rest.length ? html`<div class="thumbs">${rest.map((shot) => this.#renderShot(shot, 'thumb'))}</div>` : nothing}
          ${this.#renderSectionHeading('icon-info', 'addOnsAbout', undefined)}
          ${addOn.readme ? this.#readmeNode(addOn) : html`<p>${addOn.description}</p>`}
        </div>
        <aside class="side">${this.#renderState(addOn)} ${this.#renderLinks(addOn)}</aside>
      </div>
    </div>`;
  }

  /**
   * One screenshot with its caption. The picture opens at full size in a new tab, since in the card
   * column it is far smaller than it was taken.
   * @param shot The screenshot.
   * @param className `shot` for the first, `thumb` for the rest.
   * @returns The figure.
   */
  #renderShot(shot: UmbraDesktopAddOn['screenshots'][number], className: string) {
    return html`<figure class=${className}>
      <a href=${shot.url} target="_blank" rel="noopener noreferrer" data-router-slot="disabled">
        <img src=${shot.url} alt=${shot.caption} loading="lazy" />
      </a>
      ${shot.caption ? html`<figcaption>${shot.caption}</figcaption>` : nothing}
    </figure>`;
  }

  /**
   * The README, sanitised once per opening and kept in one node so a re-render shows it again
   * rather than an emptied fragment.
   * @param addOn The add-on.
   * @returns The node holding the README.
   */
  #readmeNode(addOn: UmbraDesktopAddOn): HTMLElement {
    if (!this.#readme) {
      this.#readme = document.createElement('div');
      this.#readme.className = 'readme';
      this.#readme.append(renderReadme(addOn.readme));
    }
    return this.#readme;
  }

  /**
   * The side panel: installed and up to date, an update available, or not on this site yet.
   * @param addOn The add-on.
   * @returns The panel.
   */
  #renderState(addOn: UmbraDesktopAddOn) {
    const installed = this.#installedVersion(addOn);
    const state = installState(installed, addOn.version);
    const major = this._data?.siteMajor;
    // Offline the newest version is not known, so an installed add-on is not claimed to be up to date.
    if (state === 'installed') {
      return html`<uui-box class="state" data-state="installed">
        <span slot="headline" class="state-headline"><span class="dot positive"></span>${this.#t('addOnsInstalledTitle', installed!)}</span>
        <p>
          ${major === undefined || !this._data?.online
            ? this.#t('addOnsInstalledTextAnyVersion')
            : this.#t('addOnsInstalledText', major)}
        </p>
        ${this._guide
          ? html`<uui-button class="guide" look="primary" label=${this.#t('addOnsOpenGuide')} @click=${() => this.#openHelp(this._guide!)}></uui-button>`
          : nothing}
      </uui-box>`;
    }
    const update = state === 'update';
    return html`<uui-box class="state" data-state=${state}>
      <span slot="headline" class="state-headline">
        ${update ? html`<span class="dot warning"></span>` : nothing}${this.#t(update ? 'addOnsUpdateTitle' : 'addOnsNotInstalledTitle')}
      </span>
      ${update
        ? html`<p>
            ${major === undefined
              ? this.#t('addOnsUpdateTextAnyVersion', installed!, addOn.version!)
              : this.#t('addOnsUpdateText', installed!, major, addOn.version!)}
          </p>`
        : nothing}
      <p>${this.#t(update ? 'addOnsSendUpdate' : 'addOnsSendThis')}</p>
      ${addOn.version ? this.#renderCommand(`dotnet add package ${addOn.id} --version ${addOn.version}`) : nothing}
      <p class="note">${addOn.version ? this.#versionNote(major) : this.#t('addOnsNoVersion')}</p>
    </uui-box>`;
  }

  /**
   * The install line and the button that copies it. The line wraps, so the version at its end is
   * always in sight in a narrow side panel.
   * @param line The command.
   * @returns The line and its button.
   */
  #renderCommand(line: string) {
    return html`<div class="command">
      <code>${line}</code>
      <uui-button-copy-text look="secondary" compact .text=${line} label=${this.localize.term('general_copy')}>
        <uui-icon name="copy"></uui-icon>${this.localize.term('general_copy')}
      </uui-button-copy-text>
    </div>`;
  }

  /**
   * Where the install line's version comes from, which differs offline.
   * @param major The site's major, if known.
   * @returns The note.
   */
  #versionNote(major: number | undefined): string {
    if (!this._data?.online) return this.#t('addOnsVersionNoteOffline');
    return major === undefined ? this.#t('addOnsVersionNoteAnyVersion') : this.#t('addOnsVersionNote', major);
  }

  /**
   * The links out: the Marketplace page, the documentation and the issue tracker, each where the
   * add-on has one. New tabs, and out of the backoffice router's reach.
   * @param addOn The add-on.
   * @returns The links.
   */
  #renderLinks(addOn: UmbraDesktopAddOn) {
    const links = [
      [addOn.links.marketplace, 'addOnsMarketplaceLink'],
      [addOn.links.documentation, 'addOnsDocsLink'],
      [addOn.links.issues, 'addOnsIssuesLink'],
    ].filter((link): link is [string, string] => !!link[0]);
    if (!links.length) return nothing;
    return html`<nav class="links">
      ${links.map(
        ([href, key]) =>
          html`<a href=${href} target="_blank" rel="noopener noreferrer" data-router-slot="disabled">${this.#t(key)} ↗</a>`,
      )}
    </nav>`;
  }

  static override styles = [
    css`
      /* Every colour and shape comes from the app tokens, each with the fallback the contract
         publishes, so the app reads as part of whichever theme the desktop wears. */
      :host {
        --add-ons-surface: var(--umbradesktop-app-surface, var(--uui-color-surface));
        --add-ons-sunken: var(--umbradesktop-app-surface-sunken, var(--uui-color-background));
        --add-ons-rule: var(--umbradesktop-app-edge-dark, var(--uui-color-border));
        --add-ons-text: var(--umbradesktop-app-text, var(--uui-color-text));
        --add-ons-muted: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
        --add-ons-accent: var(--umbradesktop-app-accent, var(--uui-color-selected));
        --add-ons-radius: var(--umbradesktop-app-radius, 3px);
        --add-ons-edge: var(--umbradesktop-app-edge-width, 1px);
        --add-ons-max-width: 1200px;

        display: flex;
        flex-direction: column;
        height: 100%;
        container-type: inline-size;
        color: var(--add-ons-text);
        background: var(--add-ons-sunken);
        font-family: var(--umbradesktop-app-font, inherit);
        line-height: 1.5;
      }

      .loading {
        display: grid;
        place-items: center;
        height: 100%;
      }

      /* Everything but the footer scrolls, so the footer stays at the bottom of the window. */
      .scroller {
        flex: 1;
        min-height: 0;
        overflow: auto;
      }

      .list,
      .details-grid {
        max-width: var(--add-ons-max-width);
        margin: 0 auto;
        padding: 4px 28px 32px;
        box-sizing: border-box;
      }

      .details-grid {
        padding-top: 24px;
      }

      /* The header band: a tint of the theme's accent rather than a fill of it, so the text on it
         stays the theme's own text colour and reads under all five themes. */
      .band {
        background: color-mix(in srgb, var(--add-ons-accent) 10%, var(--add-ons-surface));
        border-bottom: var(--add-ons-edge) solid var(--add-ons-rule);
      }

      .band-inner {
        display: flex;
        gap: 18px;
        align-items: center;
        max-width: var(--add-ons-max-width);
        margin: 0 auto;
        padding: 28px 28px 24px;
        box-sizing: border-box;
      }

      .details-band {
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
        padding-top: 16px;
      }

      .band-icon {
        display: grid;
        flex: none;
        place-items: center;
        width: 56px;
        height: 56px;
        color: var(--umbradesktop-app-accent-text, var(--uui-color-surface));
        font-size: 28px;
        background: var(--add-ons-accent);
        border-radius: 50%;
      }

      h1 {
        margin: 0;
        font-size: 1.75em;
        line-height: 1.25;
      }

      .lede {
        max-width: 640px;
        margin: 4px 0 0;
        color: var(--add-ons-muted);
      }

      /* Large enough that the sections read as sections at a glance, in sentence case and bold as
         Umbraco's own headings are. */
      .section-heading {
        display: flex;
        gap: 10px;
        align-items: center;
        margin: 28px 0 14px;
        font-size: 1.3em;
        font-weight: 700;
        line-height: 1.3;
      }

      .section-heading uui-icon {
        color: var(--add-ons-accent);
      }

      .count {
        padding: 0 9px;
        font-size: 0.65em;
        line-height: 1.7;
        background: color-mix(in srgb, var(--add-ons-accent) 14%, var(--add-ons-surface));
        border-radius: 999px;
      }

      footer {
        display: flex;
        flex: none;
        gap: 8px;
        align-items: center;
        padding: 8px 28px;
        color: var(--add-ons-muted);
        font-size: var(--uui-type-small-size, 12px);
        background: var(--add-ons-surface);
        border-top: var(--add-ons-edge) solid var(--add-ons-rule);
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 16px;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .card {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        padding: 0;
        overflow: hidden;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
        background: var(--add-ons-surface);
        border: var(--add-ons-edge) solid var(--add-ons-rule);
        border-radius: calc(var(--add-ons-radius) * 2);
        transition: border-color 120ms, box-shadow 120ms;
      }

      .card:hover,
      .card:focus-visible {
        border-color: var(--add-ons-accent);
        box-shadow: 0 4px 16px color-mix(in srgb, var(--add-ons-text) 12%, transparent);
      }

      .card:hover .title {
        text-decoration: underline;
      }

      .cover {
        display: block;
        aspect-ratio: 16 / 9;
        overflow: hidden;
        background: var(--add-ons-sunken);
        border-bottom: var(--add-ons-edge) solid var(--add-ons-rule);
      }

      /* Filled from the top: a screenshot's top is a window's titlebar and content, its bottom is
         usually the taskbar, and the top is what tells two add-ons apart. */
      .cover img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: top;
      }

      .cover.fallback {
        display: grid;
        place-items: center;
      }

      .cover .cover-icon {
        width: 72px;
        height: 72px;
        object-fit: contain;
        border-radius: 16px;
        box-shadow: 0 4px 14px rgb(0 0 0 / 25%);
      }

      .card-body {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: 6px;
        padding: 12px 14px 14px;
      }

      .name {
        display: flex;
        gap: 10px;
        align-items: center;
      }

      .name-text {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .icon {
        flex: none;
        width: 36px;
        height: 36px;
        object-fit: contain;
        border-radius: 8px;
      }

      .big-icon {
        flex: none;
        width: 60px;
        height: 60px;
        object-fit: contain;
        border-radius: 12px;
      }

      .icon-fallback {
        display: grid;
        place-items: center;
        color: var(--add-ons-muted);
        background: var(--add-ons-sunken);
        font-size: 24px;
      }

      .title {
        font-weight: 700;
      }

      .by {
        color: var(--add-ons-muted);
        font-size: var(--uui-type-small-size, 12px);
      }

      /* Not stretched to fill the card: a clamped box taller than its three lines shows the fourth
         below the ellipsis. The foot's auto margin takes up the slack instead. */
      .description {
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .card-foot {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        margin-top: auto;
        padding-top: 4px;
      }

      .details-link {
        color: var(--add-ons-accent);
        font-weight: 700;
        font-size: var(--uui-type-small-size, 12px);
      }

      .invitation,
      .offline {
        padding: 12px 14px;
        background: var(--add-ons-surface);
        border: var(--add-ons-edge) dashed var(--add-ons-rule);
        border-radius: calc(var(--add-ons-radius) * 2);
      }

      .invitation {
        margin-top: 16px;
      }

      section .invitation {
        margin-top: 0;
      }

      .invitation p {
        margin: 4px 0 8px;
      }

      .offline {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 12px;
        align-items: center;
        justify-content: space-between;
        border-style: solid;
        border-color: var(--uui-color-warning, var(--add-ons-rule));
      }

      .details-head {
        display: flex;
        gap: 14px;
        align-items: center;
      }

      .facts {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 6px;
      }

      .details-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 300px;
        gap: 24px;
        align-items: start;
      }

      @container (max-width: 720px) {
        .details-grid {
          grid-template-columns: minmax(0, 1fr);
        }
      }

      figure {
        margin: 0;
      }

      figure img {
        display: block;
        width: 100%;
        border: var(--add-ons-edge) solid var(--add-ons-rule);
        border-radius: var(--add-ons-radius);
      }

      figcaption {
        margin-top: 4px;
        color: var(--add-ons-muted);
        font-size: var(--uui-type-small-size, 12px);
      }

      .thumbs {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 12px;
        margin-top: 12px;
      }

      .thumb img {
        aspect-ratio: 16 / 10;
        object-fit: cover;
        object-position: top;
      }

      .thumb figcaption {
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .readme {
        overflow-wrap: anywhere;
      }

      /* A README's own headings, sized under the page's so its structure shows. */
      .readme h1 {
        margin: 24px 0 8px;
        font-size: 1.5em;
      }

      .readme h2 {
        margin: 24px 0 8px;
        font-size: 1.3em;
      }

      .readme h3,
      .readme h4 {
        margin: 20px 0 6px;
        font-size: 1.1em;
      }

      .readme img {
        max-width: 100%;
        height: auto;
      }

      .readme pre {
        overflow: auto;
      }

      .readme a,
      .links a {
        color: var(--add-ons-accent);
      }

      .side {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .state p {
        margin: 0 0 8px;
      }

      .state .note {
        margin: 8px 0 0;
        color: var(--add-ons-muted);
        font-size: var(--uui-type-small-size, 12px);
      }

      .state-headline {
        display: inline-flex;
        gap: 8px;
        align-items: center;
      }

      /* A command line, on the sunken surface every theme gives a well, in the monospace font. */
      .command {
        display: flex;
        flex-direction: column;
        gap: 6px;
        align-items: flex-start;
      }

      .command code {
        display: block;
        box-sizing: border-box;
        width: 100%;
        padding: 8px 10px;
        font-family: var(--uui-font-monospace, monospace);
        font-size: var(--uui-type-small-size, 12px);
        overflow-wrap: anywhere;
        background: var(--add-ons-sunken);
        border: var(--add-ons-edge) solid var(--add-ons-rule);
        border-radius: var(--add-ons-radius);
      }

      .command uui-icon {
        margin-right: 4px;
      }

      .dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
      }

      .dot.positive {
        background: var(--uui-color-positive);
      }

      .dot.warning {
        background: var(--uui-color-warning);
      }

      .links {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
    `,
  ];
}

export default UmbraDesktopAddOnsElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-add-ons': UmbraDesktopAddOnsElement;
  }
}
