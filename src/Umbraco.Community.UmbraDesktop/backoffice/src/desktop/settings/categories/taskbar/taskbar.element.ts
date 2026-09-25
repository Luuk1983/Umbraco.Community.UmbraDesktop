import type { UmbraDesktopSettingsContext } from '../../settings.context';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../../settings.context-token';
import { UMBRADESKTOP_APP_CATALOGUE_CONTEXT } from '../../../app-catalogue.context-token';
import type { UmbraDesktopAppCatalogueContext } from '../../../app-catalogue.context';
import { UMBRADESKTOP_TASKBAR_REGIONS, taskbarFeaturesIn } from '../../../taskbar/features/index';
import { isFeatureEnabled } from '../../../taskbar/features/enabled';
import type {
  UmbraDesktopTaskbarFeature,
  UmbraDesktopTaskbarFeatureContext,
  UmbraDesktopTaskbarRegionInfo,
} from '../../../taskbar/features/types';
import type { UmbraDesktopApp } from '../../../types';
import { css, customElement, html, nothing, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * What the taskbar carries beside the launcher button: one switch per fixed feature.
 *
 * **Every feature is listed, always**, including ones this install cannot use. That is the half of
 * the rule the taskbar itself does not follow — the row shows only what the user can actually use,
 * matching the launcher, while settings is where a user finds out what the product can do. A
 * feature that cannot be switched on is shown with its control disabled and the reason in place of
 * its description, because somebody looking at a greyed-out switch needs to know why before they
 * need to know what it would have done.
 *
 * Nothing here pins, unpins or reorders anything. Pinning stays one gesture in the launcher with
 * one meaning; this switch only decides whether that same list is drawn in a second place.
 */
@customElement('umbradesktop-settings-taskbar')
export class UmbraDesktopSettingsTaskbarElement extends UmbLitElement {
  /** Which features this user has switched on or off; anything absent takes the feature's default. */
  @state()
  private _features: Readonly<Record<string, boolean>> = {};

  /** Every app this user may launch, which is how a feature answers whether it is usable. */
  @state()
  private _apps: ReadonlyArray<UmbraDesktopApp> = [];

  #settings?: UmbraDesktopSettingsContext;

  #catalogue?: UmbraDesktopAppCatalogueContext;

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_SETTINGS_CONTEXT, (context) => {
      this.#settings = context ?? undefined;
      if (!context) return;
      this.observe(context.taskbarFeatures, (features) => (this._features = features ?? {}));
    });
    this.consumeContext(UMBRADESKTOP_APP_CATALOGUE_CONTEXT, (context) => {
      this.#catalogue = context ?? undefined;
      if (!context) return;
      // Observed rather than sampled for the same reason the taskbar observes it: a package's
      // bundle can register after this panel is open, and a row that said "not installed" on the
      // way in should stop saying it the moment that stops being true.
      this.observe(context.apps, (apps) => (this._apps = apps));
    });
  }

  /**
   * What a feature is handed in order to answer whether it can be used here.
   *
   * The same context the taskbar builds, minus nothing: a feature must give the same verdict on
   * both surfaces, and the only way to guarantee that is for both to ask the same question with the
   * same inputs. `open` is never called from here — settings launches nothing — but leaving it out
   * would mean a second, narrower context type for features to be written against.
   * @returns The context for this render.
   */
  get #featureContext(): UmbraDesktopTaskbarFeatureContext {
    return {
      apps: this._apps,
      pinned: [],
      isRefRegistered: (ref) => this.#catalogue?.isRefRegistered(ref) ?? false,
      open: () => undefined,
      localize: (value) => this.localize.string(value),
      // Only availability is asked for here, and it reads nothing but whether full screen is
      // allowed; settings neither shows nor changes the page's full screen state.
      fullscreen: false,
      canFullscreen: document.fullscreenEnabled,
      toggleFullscreen: () => undefined,
    };
  }

  /**
   * One feature's switch, and the lines under it.
   *
   * The description is always there. A reason, when there is one, goes *beneath* it rather than in
   * its place, and that is the whole of the fix for a screen that told a site without Umbraco AI why
   * the chat could not be switched on and never once said what the chat would have put on the
   * taskbar. Somebody reading a disabled switch is usually deciding whether to go and install the
   * thing it needs.
   * @param feature The feature to draw.
   * @param context The shared feature context, built once per render.
   * @returns The row's template.
   */
  #renderFeature(feature: UmbraDesktopTaskbarFeature, context: UmbraDesktopTaskbarFeatureContext) {
    const availability = feature.availability(context);
    return html`
      <div class="feature">
        <uui-toggle
          label=${this.localize.term(feature.labelKey)}
          ?checked=${isFeatureEnabled(this._features, feature)}
          ?disabled=${!availability.available}
          @change=${(event: Event) =>
            this.#settings?.setTaskbarFeature(
              feature.id,
              !!(event.target as HTMLInputElement | null)?.checked,
            )}></uui-toggle>
        <p class="hint">${this.localize.term(feature.descriptionKey)}</p>
        ${availability.available ? nothing : html`<p class="reason">${this.localize.term(availability.reasonKey)}</p>`}
      </div>
    `;
  }

  /**
   * One region: a heading, what that end of the taskbar is, and its switches.
   *
   * A region with nothing in it draws nothing at all. The system tray is declared but empty, and a
   * heading with no switches under it reads worse than no heading — while leaving it declared is
   * what lets the first tray feature appear here without a change to this file.
   * @param region The region to draw.
   * @param context The shared feature context, built once per render.
   * @returns The section's template, or nothing.
   */
  #renderRegion(region: UmbraDesktopTaskbarRegionInfo, context: UmbraDesktopTaskbarFeatureContext) {
    const features = taskbarFeaturesIn(region.id);
    if (features.length === 0) return nothing;
    return html`
      <section>
        <h4>${this.localize.term(region.labelKey)}</h4>
        <p class="about">${this.localize.term(region.descriptionKey)}</p>
        ${features.map((feature) => this.#renderFeature(feature, context))}
      </section>
    `;
  }

  /**
   * Every feature, grouped by the end of the taskbar it belongs to.
   *
   * Grouped rather than the flat list of switches this was, which opened on a control labelled "AI
   * chat" with nothing anywhere saying what part of the product it was a setting about. Windows
   * groups the same two — taskbar items above system tray icons — and having the grouping now is
   * what makes the system tray's settings a third entry in the region list rather than a screen of
   * their own.
   * @returns The screen's contents.
   */
  override render() {
    const context = this.#featureContext;
    return html`${UMBRADESKTOP_TASKBAR_REGIONS.map((region) => this.#renderRegion(region, context))}`;
  }

  static override styles = [
    css`
      :host {
        display: block;
      }
      /* The backoffice's own way of heading a group of settings, restated exactly as the Appearance
         category restates it, and for the same reason: core draws a 'uui-box' headline as
         <h5 class="uui-h5"> and 'uui-text.css' sizes that class, but that stylesheet is global to
         the backoffice document and a class in it reaches nothing inside a shadow root. Two settings
         screens in one panel heading their groups differently would read as two products. */
      h4 {
        margin: 0 0 var(--uui-size-space-2);
        font-size: var(--uui-type-h5-size, 16px);
        font-weight: 400;
        line-height: inherit;
        color: var(--uui-color-text);
      }
      section + section {
        margin-top: calc(var(--uui-size-space-5) * 2);
      }
      /* What this end of the taskbar is, before any switch under it. Nothing separates it from the
         per-feature hints below but its position — above the first switch rather than under one —
         and once the heading is there that is the only cue needed. */
      .about {
        margin: 0 0 var(--uui-size-space-4);
        color: var(--uui-color-text-alt, var(--uui-color-text));
        font-size: var(--uui-type-small-size);
      }
      /* Enough air between two switches that each hint reads as belonging to the switch above it
         rather than to the one below. */
      .feature + .feature {
        margin-top: var(--uui-size-space-5);
      }
      /* A hint that explains the control above it, exactly as the General category's does. */
      .hint {
        margin: var(--uui-size-space-3) 0 0;
        color: var(--uui-color-text-alt, var(--uui-color-text));
        font-size: var(--uui-type-small-size);
      }
      /* Why a switch is disabled, under what it would have done. Full-strength ink against the
         hint's dimmed grey, because it is the line that explains a control the reader cannot use,
         and the description above it is that line's context rather than the other way round. */
      .reason {
        margin: var(--uui-size-space-2) 0 0;
        color: var(--uui-color-text);
        font-size: var(--uui-type-small-size);
      }
    `,
  ];
}

export default UmbraDesktopSettingsTaskbarElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-settings-taskbar': UmbraDesktopSettingsTaskbarElement;
  }
}
