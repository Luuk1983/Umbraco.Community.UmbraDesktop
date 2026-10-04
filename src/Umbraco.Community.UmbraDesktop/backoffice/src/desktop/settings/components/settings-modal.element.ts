import type { UmbraDesktopSettingsModalData } from '../modal-tokens';
import type { UmbraDesktopSettingsCategory } from '../categories/types';
import { UMBRADESKTOP_SETTINGS_CATEGORIES, findSettingsCategory } from '../categories/index';
import type { UmbraDesktopSettingsPackage } from '../package-settings';
import { normalisePackageSettings } from '../package-settings.js';
import { UMBRADESKTOP_DEFAULT_ICON } from '../../constants';
import './settings-row.element.js';
import './package-settings-screen.element.js';
import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbExtensionsManifestInitializer } from '@umbraco-cms/backoffice/extension-api';
import type { UmbExtensionRegistry } from '@umbraco-cms/backoffice/extension-api';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import { UmbModalBaseElement } from '@umbraco-cms/backoffice/modal';

/**
 * The icon every package row carries. One icon for all of them, rather than one each package
 * chooses, so the row reads as "a package" before its name is read (design §3). The desktop's own
 * fallback app icon, read from where that is defined, so it is known to exist in the shipped set.
 */
const PACKAGE_ROW_ICON = UMBRADESKTOP_DEFAULT_ICON;

/** The prefix of a package row's id, which keeps package names apart from our category ids. */
const PACKAGE_ROW_PREFIX = 'package:';

/** Where the panel is: one of our categories, or a package's screen, by the package's name. */
type PanelPlace =
  | { kind: 'category'; category: UmbraDesktopSettingsCategory }
  | { kind: 'package'; name: string };

/**
 * The Desktop settings panel, opened from the launcher footer as a sidebar from the right.
 *
 * **Two levels.** Opening it shows a list of categories; picking one shows that category's
 * settings. It was one screen with every setting on it, which stopped working at three settings:
 * previews large enough to read took three rows and pushed Wallpaper off the bottom of a 500px
 * sidebar, and a setting nobody scrolls to is a setting nobody finds.
 *
 * This element owns **navigation and nothing else** — it reads no setting at all. What a category
 * contains is that category's own element (see `categories/`), which is what makes a third category
 * a folder rather than an edit to a file that keeps growing.
 *
 * Below our own categories, other packages' settings: one row per package with an
 * `umbraDesktopPackageSettings` manifest whose conditions are met, under a heading that says they are
 * not ours (design §4). A package's screen is `umbradesktop-settings-package`, which this element
 * navigates to exactly as it does to a category.
 *
 * There is no Save at either level: every change applies through the settings context the moment it
 * is made, which is also what lets the user watch the result on the desktop beside the panel.
 */
@customElement('umbradesktop-settings-modal')
export class UmbraDesktopSettingsModalElement extends UmbModalBaseElement<UmbraDesktopSettingsModalData, never> {
  /**
   * Where package settings come from. The backoffice's registry unless a test says otherwise; read
   * once, the first time the panel connects.
   */
  @property({ attribute: false })
  registry: UmbExtensionRegistry<UmbExtensionManifest> = umbExtensionsRegistry;

  /** Where the panel is, or undefined at the list. */
  @state()
  private _place?: PanelPlace;

  /** The packages with settings whose conditions are met, grouped and sorted. */
  @state()
  private _packages: UmbraDesktopSettingsPackage[] = [];

  /**
   * A deep link naming something that is not one of our categories. Package settings arrive after
   * the panel connects, once their conditions are evaluated, so the link is held and answered when a
   * package by that name arrives. It never arriving leaves the list showing, as an unknown id did.
   */
  #pending?: string;

  /** Report keys already printed, so a re-evaluation does not print the same line again. */
  #reported = new Set<string>();

  /**
   * Whether the package observer exists. It is made once rather than on every connect: a second one
   * under the same controller alias would replace the first, and the first's teardown reports "no
   * packages", which would throw an open package's screen back to the list for no reason. A
   * controller outlives a disconnect anyway, pausing and resuming with its host.
   */
  #observingPackages = false;

  /**
   * Where focus goes after the next render: the category heading on the way in, the row you came
   * from on the way out. Cleared once it has been used, so an unrelated re-render — a summary
   * changing while a picker is open — does not yank focus back.
   */
  #focusAfterRender?: 'heading' | string;

  override connectedCallback() {
    super.connectedCallback();
    // A caller can open the panel straight at a category — a right-click on the desktop meaning
    // "change the wallpaper" should not make you walk the list. An id this version does not know
    // lands on the list rather than on an empty screen, which is what a deep link from an older
    // version or a typo would otherwise do. Or a package's name, which cannot be answered yet: see
    // `#pending`.
    const category = findSettingsCategory(this.data?.category);
    this._place = category ? { kind: 'category', category } : undefined;
    this.#pending = category ? undefined : this.data?.category;
    // On a reconnect the packages are already here, and the observer reports nothing when nothing
    // changed, so a package link waiting on it would leave the list showing where a category link
    // reopens. The first connect has no packages yet, and this does nothing.
    this.#answerPending();

    if (this.#observingPackages) return;
    this.#observingPackages = true;
    // `UmbExtensionsManifestInitializer` rather than `byType`, because `byType` never evaluates a
    // manifest's `conditions`, and a box whose author said it should not show would show anyway.
    new UmbExtensionsManifestInitializer(
      this,
      this.registry,
      'umbraDesktopPackageSettings',
      null,
      (permitted) => this.#onPackages(permitted.map((controller) => controller.manifest)),
      'observePackageSettings',
    );
  }

  /**
   * Take the permitted manifests: validate and group them, print what was dropped, answer a held
   * deep link, and leave a package's screen that has nothing left to show.
   * @param manifests The permitted manifests.
   */
  #onPackages(manifests: ReadonlyArray<unknown>) {
    const { packages, reports } = normalisePackageSettings(manifests);
    for (const { key, message } of reports) {
      if (this.#reported.has(key)) continue;
      this.#reported.add(key);
      console.warn(message);
    }
    this._packages = packages;

    if (this.#answerPending()) return;
    const place = this._place;
    if (place?.kind === 'package' && !packages.some((value) => value.name === place.name)) {
      // Straight to the list with no focus target: the row that would take it has just gone too.
      this.#focusAfterRender = undefined;
      this._place = undefined;
    }
  }

  /**
   * Open the package a held deep link names, if it is among the packages now known and the panel is
   * still at the list. One place for it, because it is answered both when packages arrive and on a
   * reconnect, when they are already here.
   * @returns Whether the link was answered.
   */
  #answerPending(): boolean {
    const pending = this.#pending && this._packages.find((value) => value.name === this.#pending);
    if (!pending || this._place) return false;
    this.#open({ kind: 'package', name: pending.name });
    return true;
  }

  /**
   * A place's id, which is also its row's `data-category`: our category ids as they are, package
   * names behind a prefix so a package cannot take the id of one of ours.
   * @param place The place.
   * @returns The id.
   */
  #idOf(place: PanelPlace): string {
    return place.kind === 'category' ? place.category.id : `${PACKAGE_ROW_PREFIX}${place.name}`;
  }

  /**
   * Go into a category or a package's screen.
   *
   * Drops a held deep link, as `#back` does: once the user has gone somewhere, or the link has been
   * answered, a package arriving later must not move the panel under them.
   * @param place Where to go.
   */
  #open(place: PanelPlace) {
    this.#pending = undefined;
    this._place = place;
    this.#focusAfterRender = 'heading';
  }

  /**
   * Go back to the list, putting focus back on the row that was used to leave it.
   *
   * Back, rather than closing: Escape closes the whole panel from either level, because that is
   * what every other backoffice sidebar does and an Escape that sometimes goes back and sometimes
   * closes is worse than one that always closes. Nothing here intercepts it — the modal system's
   * own dialog handles it.
   *
   * Drops a held deep link too, for the reason given on `#open`.
   */
  #back() {
    this.#pending = undefined;
    this.#focusAfterRender = this._place && this.#idOf(this._place);
    this._place = undefined;
  }

  /**
   * Move focus to wherever the last navigation said it should go.
   *
   * Without this, going into a category leaves focus on a button that is no longer on screen, and
   * coming back leaves it on the back button that has just gone — which for anyone on a keyboard or
   * a screen reader is the panel losing its place twice per visit.
   */
  protected override async updated() {
    const target = this.#focusAfterRender;
    if (!target) return;
    this.#focusAfterRender = undefined;

    const root = this.renderRoot as ShadowRoot;
    if (target === 'heading') {
      (root.querySelector('.heading') as HTMLElement | null)?.focus();
      return;
    }

    // Escaped, because a package row's id carries the package's name, which may hold anything.
    const row = root.querySelector(`umbradesktop-settings-row[data-category="${CSS.escape(target)}"]`) as
      | (HTMLElement & { updateComplete?: Promise<unknown> })
      | null;
    // The row has to have rendered before it can take focus. Its focus is delegated to the button
    // in its shadow root (see the row element), and a host whose shadow root is still empty has
    // nothing to delegate to — so focusing it right now silently does nothing, which is exactly
    // what coming back from a category used to do. The heading above needs no such wait: it is in
    // this element's own template and has been rendered by the time this runs.
    await row?.updateComplete;
    row?.focus();
  }

  /**
   * The list of categories, which is what opening the panel shows, then a row per package with
   * settings. The package section and its heading are left out entirely when there are none, so an
   * install without such packages sees the panel exactly as before.
   *
   * A package row's detail is its box headings joined, the same "what is in here" a category's
   * description gives, without asking a package for a sentence it would have to translate.
   */
  #renderList() {
    return html`
      <div class="list">
        ${UMBRADESKTOP_SETTINGS_CATEGORIES.map(
          (category) => html`
            <umbradesktop-settings-row
              data-category=${category.id}
              headline=${this.localize.term(category.labelKey)}
              detail=${this.localize.term(category.descriptionKey)}
              @click=${() => this.#open({ kind: 'category', category })}>
              <uui-icon slot="lead" class="icon" name=${category.icon}></uui-icon>
            </umbradesktop-settings-row>
          `,
        )}
        ${this._packages.length
          ? html`
              <h4 class="section">${this.localize.term('umbraDesktop_settingsAddOns')}</h4>
              ${this._packages.map(
                (value) => html`
                  <umbradesktop-settings-row
                    data-category=${`${PACKAGE_ROW_PREFIX}${value.name}`}
                    headline=${value.name}
                    detail=${value.boxes.map((box) => this.localize.string(box.label)).join(', ')}
                    @click=${() => this.#open({ kind: 'package', name: value.name })}>
                    <uui-icon slot="lead" class="icon" name=${PACKAGE_ROW_ICON}></uui-icon>
                  </umbradesktop-settings-row>
                `,
              )}
            `
          : nothing}
      </div>
    `;
  }

  /** One element per category, so going back and forth does not rebuild the screen each time. */
  #screens = new Map<string, HTMLElement>();

  /**
   * One category's screen, as an element made from its tag.
   *
   * Built with `createElement` and rendered as a node rather than written as a tag in a template,
   * because a template's tag name cannot come from data — that needs Lit's static-html, which the
   * backoffice does not re-export, and importing it from `lit` directly would bundle a second copy
   * of Lit beside the backoffice's own. A node in an expression needs neither.
   *
   * Kept per category rather than made fresh on each render: returning a new element every time
   * would tear the screen down and rebuild it on every unrelated state change, losing scroll
   * position and any context each screen has resolved.
   * @param category The category to render.
   * @returns The category's element.
   */
  #renderCategory(category: UmbraDesktopSettingsCategory): HTMLElement {
    let screen = this.#screens.get(category.tag);
    if (!screen) {
      screen = document.createElement(category.tag);
      this.#screens.set(category.tag, screen);
    }
    return screen;
  }

  /**
   * Package screens by name, kept like category screens so their loaded boxes survive a visit to the
   * list.
   */
  #packageScreens = new Map<string, HTMLElement & { package?: UmbraDesktopSettingsPackage }>();

  /**
   * A package's screen, handed the package as it stands now so a box that came or went shows.
   * @param name The package name.
   * @returns The screen element.
   */
  #renderPackage(name: string): HTMLElement {
    let screen = this.#packageScreens.get(name);
    if (!screen) {
      screen = document.createElement('umbradesktop-settings-package');
      this.#packageScreens.set(name, screen);
    }
    screen.package = this._packages.find((value) => value.name === name);
    return screen;
  }

  override render() {
    const place = this._place;
    return html`
      <umb-body-layout headline=${place ? '' : this.localize.term('umbraDesktop_desktopSettings')}>
        ${place
          ? html`
              <div slot="header" class="crumb">
                <uui-button
                  compact
                  look="default"
                  label=${this.localize.term('umbraDesktop_settingsBack')}
                  @click=${this.#back}>
                  <uui-icon name="icon-navigation-left"></uui-icon>
                </uui-button>
                <h3 class="heading" tabindex="-1">
                  ${place.kind === 'category' ? this.localize.term(place.category.labelKey) : place.name}
                </h3>
              </div>
            `
          : nothing}
        ${!place
          ? this.#renderList()
          : place.kind === 'category'
            ? this.#renderCategory(place.category)
            : this.#renderPackage(place.name)}
        <uui-button
          slot="actions"
          look="primary"
          label=${this.localize.term('general_close')}
          @click=${() => this._rejectModal()}></uui-button>
      </umb-body-layout>
    `;
  }

  static override styles = [
    css`
      .list {
        display: flex;
        flex-direction: column;
      }
      /* No rule between the rows, deliberately. One was tried: it is invisible in light mode, where
         the divider token is a hair off the panel's own surface, and too heavy in dark mode, where
         it is not. The height of the rows is what separates them. */
      /* Sized to the row it labels rather than to the icon's own box, so a category row and a
         setting row below it have their text starting at the same place. */
      .icon {
        flex-shrink: 0;
        width: 24px;
        font-size: 24px;
        color: var(--uui-color-text-alt, var(--uui-color-text));
      }
      /* Sets the package rows apart from ours: these are not UmbraDesktop's (design D2). Sentence
         case and bold, as Umbraco's own headings are, never an uppercase eyebrow. */
      .section {
        margin: var(--uui-size-space-5) 0 var(--uui-size-space-2);
        font-size: var(--uui-type-small-size);
        font-weight: 700;
        color: var(--uui-color-text-alt, var(--uui-color-text));
      }
      /* The panel's own title while inside a category, standing in for umb-body-layout's headline
         so that the back arrow can sit before it rather than after. */
      .crumb {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-2);
      }
      .crumb h3 {
        margin: 0;
        font-size: var(--uui-type-h5-size, 1.2rem);
      }
      /* Focusable so that going into a category moves focus somewhere meaningful, without adding a
         tab stop for people who are not being sent here. */
      .heading:focus {
        outline: none;
      }
      .heading:focus-visible {
        outline: 2px solid var(--uui-color-focus);
        outline-offset: 2px;
      }
    `,
  ];
}

export default UmbraDesktopSettingsModalElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-settings-modal': UmbraDesktopSettingsModalElement;
  }
}
