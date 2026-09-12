import type { UmbraDesktopWallpaperView } from '../wallpaper-view';
import type { UmbraDesktopSettingsContext } from '../settings.context';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../settings.context-token';
import { UMBRADESKTOP_THEME_PICKER_MODAL, UMBRADESKTOP_WALLPAPER_PICKER_MODAL } from '../modal-tokens';
import type { UmbraDesktopResolvedTheme } from '../../theme/resolve-variant';
import { UMBRADESKTOP_THEME_CONTEXT } from '../../theme/theme.context-token';
import { UMBRADESKTOP_THEMES } from '../../theme/themes/index';
import { UMBRADESKTOP_BUILTIN_WALLPAPERS } from '../wallpapers.generated';
import { wallpaperLabels } from '../wallpaper-labels';
import { UMBRADESKTOP_PREVIEW_SCALE, UMBRADESKTOP_PREVIEW_SCENE } from '../../theme/preview/constants';
import './wallpaper-picker-modal.element.js';
import './theme-picker-modal.element.js';
import '../../theme/preview/theme-preview.element.js';
import { css, customElement, html, nothing, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbModalBaseElement } from '@umbraco-cms/backoffice/modal';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';

/**
 * The Desktop settings panel, opened from the launcher footer as a sidebar from the right.
 *
 * Laid out as a list of sections so that adding another one means appending it, not restructuring
 * this element. Today there are three: Theme, Wallpaper and Startup.
 *
 * There is no Save: every change applies through the settings context the moment it is made, which
 * is also what lets the user watch the result on the desktop beside the panel. Startup is the one
 * setting that cannot show its result, since it is read while the backoffice boots — hence the hint
 * under it saying so.
 */
@customElement('umbradesktop-settings-modal')
export class UmbraDesktopSettingsModalElement extends UmbModalBaseElement {
  @state()
  private _wallpaper?: UmbraDesktopWallpaperView;

  /**
   * The theme actually *in force* — what is painted right now, including the variant and whether
   * high contrast has overridden the user's choice. Distinct from `_chosenThemeId` below, which is
   * the user's *choice*: the two agree except under high contrast, where this reflects the forced
   * theme while `_chosenThemeId` still reflects what the user picked.
   */
  @state()
  private _theme?: UmbraDesktopResolvedTheme;

  /**
   * The theme the user *chose*, which is not always the one in force: high contrast overrides the
   * choice without discarding it. The picker marks this one, so switching the backoffice to high
   * contrast never looks like it silently reset the user's selection — the hint below explains the
   * override instead.
   */
  @state()
  private _chosenThemeId?: string;

  /** Whether this user boots straight into the desktop. */
  @state()
  private _bootIntoDesktop = false;

  #settings?: UmbraDesktopSettingsContext;

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_SETTINGS_CONTEXT, (context) => {
      this.#settings = context ?? undefined;
      if (!context) return;
      this.observe(context.wallpaper, (wallpaper) => (this._wallpaper = wallpaper));
      this.observe(context.theme, (id) => (this._chosenThemeId = id));
      this.observe(context.bootIntoDesktop, (enabled) => (this._bootIntoDesktop = enabled === true));
    });

    this.consumeContext(UMBRADESKTOP_THEME_CONTEXT, (context) => {
      if (!context) return;
      this.observe(context.resolved, (resolved) => (this._theme = resolved));
    });
  }

  /**
   * Open the wallpaper picker.
   *
   * Nothing comes back, for the same reason nothing comes back from the theme picker: both apply
   * through the settings context this panel is already observing, so the row above updates while
   * the picker is still open. Rejected rather than resolved when closed, which is why the rejection
   * is swallowed.
   */
  #pickWallpaper = async () => {
    const current = this._wallpaper?.ref;
    if (!current) return;
    await umbOpenModal(this, UMBRADESKTOP_WALLPAPER_PICKER_MODAL, {
      data: { current, currentThumbUrl: this._wallpaper?.thumbUrl },
    }).catch(() => undefined);
  };

  /**
   * One setting, as the panel states it: what you have, what it is, and a way in.
   *
   * Both settings under Appearance render through this, which is the point of it — they ask the
   * same question and used to answer it in two different shapes, with two sizes of preview and two
   * treatments of button. The whole row is the control, so there is no button to bolt on beside it.
   *
   * The chevron is not decoration. The pickers this opens have no OK and no Cancel: every click
   * applies to the desktop behind and you leave by closing them, which makes each one a place you
   * go and come back from rather than a dialog that ends. That is what a chevron says, and what a
   * verb like "Change" would say wrongly. It is also the affordance the settings categories use one
   * level up, so the whole surface reads as one grammar.
   * @param preview The thing being chosen, drawn small.
   * @param title What is in use.
   * @param sub A line under it, or nothing.
   * @param open What clicking the row opens.
   * @returns The row template.
   */
  #renderRow(preview: unknown, title: string, sub: string | undefined, open: () => void) {
    return html`
      <button class="pick-row" type="button" @click=${open}>
        ${preview}
        <span class="text">
          <span class="row-title">${title}</span>
          ${sub ? html`<span class="row-sub">${sub}</span>` : nothing}
        </span>
        <span class="chev" aria-hidden="true">
          <uui-icon name="icon-navigation-right"></uui-icon>
        </span>
      </button>
    `;
  }

  /**
   * The theme in use, and the way to change it.
   *
   * The preview is painted in the variant actually in force, from `_theme` rather than from the
   * backoffice's setting directly, so it agrees with the desktop behind the panel under high
   * contrast too — where the variant is decided by the accessibility setting. The hint about that
   * override stays here rather than moving into the picker, since this is where you read what is
   * actually on.
   * @returns The Theme subsection template.
   */
  #renderThemes() {
    // The user's choice, not the theme in force — see "_chosenThemeId".
    const activeId = this._chosenThemeId ?? this._theme?.theme.id;
    const current = UMBRADESKTOP_THEMES.find((theme) => theme.id === activeId);
    return html`
      <section class="subsection">
        <h4>${this.localize.term('umbraDesktop_theme')}</h4>
        ${this.#renderRow(
          html`<umbradesktop-theme-preview
            .theme=${current}
            .variant=${this._theme?.variant ?? 'light'}></umbradesktop-theme-preview>`,
          current?.name ?? '',
          current ? this.localize.term(current.descriptionKey) : undefined,
          this.#pickTheme,
        )}
        ${this._theme?.highContrast
          ? html`<p class="hint warn">${this.localize.term('umbraDesktop_themeHighContrast')}</p>`
          : ''}
      </section>
    `;
  }

  /**
   * Open the theme picker.
   *
   * Nothing comes back and nothing needs to: the picker applies each choice through the same
   * settings context this panel observes, so the row above updates while the picker is still open.
   * Rejected rather than resolved when closed, like every other picker here, which is why the
   * rejection is swallowed.
   */
  #pickTheme = async () => {
    const current = this._chosenThemeId ?? this._theme?.theme.id;
    if (!current) return;
    await umbOpenModal(this, UMBRADESKTOP_THEME_PICKER_MODAL, { data: { current } }).catch(() => undefined);
  };

  /**
   * The wallpaper in use, and the way to change it.
   *
   * One row where there were two buttons. Both sources now live inside the picker, which is where
   * you are already choosing an image — and which is the only place that can show a Media Library
   * wallpaper as the one in use, since it is not in the built-in grid.
   * @returns The Wallpaper subsection template.
   */
  #renderWallpaper() {
    const labels = wallpaperLabels(this._wallpaper?.ref, UMBRADESKTOP_BUILTIN_WALLPAPERS);
    return html`
      <section class="subsection">
        <h4>${this.localize.term('umbraDesktop_wallpaper')}</h4>
        ${this.#renderRow(
          this.#renderPreview(),
          labels.title ?? (labels.titleKey ? this.localize.term(labels.titleKey) : ''),
          labels.subKey ? this.localize.term(labels.subKey) : undefined,
          this.#pickWallpaper,
        )}
      </section>
    `;
  }

  /**
   * The startup setting: one toggle, and the sentence that stops it looking broken.
   *
   * No sub-heading of its own, unlike the two under Appearance: the toggle's own label says what it
   * does, and a heading over a single switch would be a label for a label. Add one when a second
   * setting arrives.
   *
   * The hint is load-bearing. The preference is read while the backoffice boots, so flipping it
   * changes nothing on screen, and a toggle that appears to do nothing reads as a bug. It also
   * names the escape hatch, because the desktop hides the backoffice header and somebody whose
   * desktop breaks needs a way back that does not depend on the desktop.
   * @returns The Settings group's contents.
   */
  #renderBoot() {
    return html`
      <uui-toggle
        label=${this.localize.term('umbraDesktop_bootIntoDesktop')}
        ?checked=${this._bootIntoDesktop}
        @change=${(event: Event) =>
          this.#settings?.setBootIntoDesktop(!!(event.target as HTMLInputElement | null)?.checked)}></uui-toggle>
      <p class="hint below">${this.localize.term('umbraDesktop_bootDescription')}</p>
    `;
  }

  /** The current wallpaper's preview, or the gradient swatch when none is set. */
  #renderPreview() {
    const thumbUrl = this._wallpaper?.thumbUrl;
    return thumbUrl
      ? html`<img class="preview" src=${thumbUrl} alt="" />`
      : html`<span class="preview gradient" aria-hidden="true"></span>`;
  }

  override render() {
    return html`
      <umb-body-layout headline=${this.localize.term('umbraDesktop_desktopSettings')}>
        <div class="groups">
          <uui-box headline=${this.localize.term('umbraDesktop_groupAppearance')}>
            ${this.#renderThemes()} ${this.#renderWallpaper()}
          </uui-box>
          <uui-box headline=${this.localize.term('umbraDesktop_groupSettings')}> ${this.#renderBoot()} </uui-box>
        </div>
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
      /* The groups need air between them: slotted into umb-body-layout they butt up against each
         other, and two boxes touching read as one slab with a line through it. */
      .groups {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-5);
      }
      /* One setting group inside a box. The divider rather than spacing alone, because in a 500px
         panel the wallpaper preview sits directly under the theme swatches and the eye needs
         telling where one ends. */
      .subsection + .subsection {
        margin-top: var(--uui-size-space-5);
        padding-top: var(--uui-size-space-5);
        border-top: 1px solid var(--uui-color-divider);
      }
      /* Subordinate to the box's own headline, which uui-box renders at h5 size — an h5-sized
         subsection heading competes with the category above it and inverts the hierarchy. This is
         the launcher's group-label treatment (see .ch in launcher.element), so the two surfaces
         label a group of things the same way. */
      .subsection h4 {
        margin: 0 0 var(--uui-size-space-3);
        font-size: var(--uui-type-small-size);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--uui-color-text-alt, var(--uui-color-text));
        opacity: 0.6;
      }
      /* One row shape for every setting that opens a picker. The negative margin lets the hover
         fill reach past the box's own padding, so the row reads as the width of the panel the way a
         list row does, rather than as a button that happens to be wide. */
      .pick-row {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-4);
        width: calc(100% + var(--uui-size-space-3) * 2);
        margin: 0 calc(var(--uui-size-space-3) * -1);
        padding: var(--uui-size-space-3);
        border: 0;
        border-radius: var(--uui-border-radius, 3px);
        background: transparent;
        color: inherit;
        font-family: inherit;
        text-align: left;
        cursor: pointer;
      }
      .pick-row:hover {
        background: var(--uui-color-surface-alt, rgba(0, 0, 0, 0.05));
      }
      .pick-row .text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .row-title {
        font-weight: 700;
      }
      .row-sub {
        color: var(--uui-color-text-alt, var(--uui-color-text));
        font-size: var(--uui-type-small-size);
      }
      /* At the trailing edge, where a "there is more this way" marker belongs. */
      .pick-row .chev {
        margin-left: auto;
        display: flex;
        color: var(--uui-color-text-alt, var(--uui-color-text));
      }
      /* The same box as the theme preview beside it, ratio included: 16:10, what the theme
         miniature is drawn at, with the image cover-cropped into it. Two settings of the same kind
         showing two sizes of picture was most of what made this panel look assembled rather than
         designed. */
      .preview {
        flex-shrink: 0;
        display: block;
        width: ${UMBRADESKTOP_PREVIEW_SCENE.w * UMBRADESKTOP_PREVIEW_SCALE}px;
        aspect-ratio: ${UMBRADESKTOP_PREVIEW_SCENE.w} / ${UMBRADESKTOP_PREVIEW_SCENE.h};
        object-fit: cover;
        border: 1px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius, 3px);
      }
      /* Mirrors the desktop's own gradient, so "None" previews what it actually does. */
      .gradient {
        background-color: #0e1329;
        background-image: radial-gradient(
          130% 130% at 25% 8%,
          var(--uui-color-header-background, #1b264f),
          color-mix(in srgb, var(--uui-color-header-background, #1b264f) 50%, black) 70%
        );
      }
      .hint {
        margin: 0 0 var(--uui-size-space-4);
        color: var(--uui-color-text-alt, var(--uui-color-text));
        font-size: var(--uui-type-small-size);
      }
      .hint.warn {
        margin: var(--uui-size-space-4) 0 0;
      }
      /* A hint that explains the control above it rather than the one below. */
      .hint.below {
        margin: var(--uui-size-space-3) 0 0;
      }
      /* The preview sizes itself — see its own constants, which '.preview' above reads too so the
         two boxes cannot drift apart — so all this adds is the frame, which is the panel's own
         chrome rather than the theme's look. */
      umbradesktop-theme-preview {
        flex-shrink: 0;
        overflow: hidden;
        border: 1px solid var(--uui-color-border);
        border-radius: var(--uui-border-radius, 3px);
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
