import { UMBRADESKTOP_PATH_HEIGHT, UMBRADESKTOP_PATH_LINE } from '../constants.js';
import type { UmbraDesktopPathCrumb, UmbraDesktopPathView } from '../path/types.js';
import { UmbraDesktopThemeStyles } from '../theme/theme-styles.controller.js';
import { panelIcon } from './panel-icon.js';
import { UMBRADESKTOP_STRIP_BUTTON_PADDING, UMBRADESKTOP_STRIP_ICON_BOX } from './strip-button.js';
import { css, customElement, html, nothing, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * The path strip between a window's titlebar and its body: where this window is, and every step
 * back out of it.
 *
 * It exists because the desktop strips the backoffice header, and the header is where you click a
 * section's name to return to its root — so a window that has navigated into a tree had no way back
 * short of being closed and opened again (issue #43). Umbraco does render a breadcrumb of its own,
 * but as a workspace footer app beside Save and publish, which is where you look when you are
 * finishing an edit rather than when you want to leave. This one is in the place people look.
 *
 * **Core's is left alone**, so a section window carries two paths. Hiding it was tried and reverted:
 * the workspace is rebuilt on every navigation, so any rule this package injects lands after that
 * workspace has painted and the breadcrumb blinks on every click. `chrome-injector.ts` keeps the
 * long version of why. A duplicate is untidy; a flash is a defect.
 *
 * In the desktop's own document rather than injected into the frame, exactly as
 * `window-notices.element` is: that is what lets a theme style it, keeps the shell out of the
 * backoffice's DOM, and lets it survive the window navigating internally.
 *
 * **It renders buttons, not anchors, and that is deliberate.** A crumb is not a link out of this
 * document; it is an instruction to route a frame this element cannot reach, and it must be
 * refusable — a window holding unsaved changes asks before it leaves. An anchor would also offer a
 * context menu full of promises the shell cannot keep ("open in new tab" on a route inside an
 * iframe) and would navigate on a middle click with no guard at all.
 *
 * **Every class inside is prefixed `path-`, and that is load-bearing.** This element adopts the
 * active theme's whole `window` sheet, so every selector a theme wrote for the window frame is live
 * in this shadow root too, matching against this markup. `window-notices.element` documents what
 * that cost when it used the frame's own names: macOS pins `.title { position: absolute; inset: 0 }`
 * to centre a window title, which tore a notice's heading out of its column on four of the five
 * themes with nothing failing loudly. `window-path.test.ts` asserts the prefix so the next class
 * cannot forget.
 */
@customElement('umbradesktop-window-path')
export class UmbraDesktopWindowPathElement extends UmbLitElement {
  /** The crumbs to draw, left to right; the last is the item the window is showing. */
  @property({ attribute: false })
  public crumbs: ReadonlyArray<UmbraDesktopPathCrumb> = [];

  /**
   * Whether the window behind the strip is still fetching its content.
   *
   * While it is, the only crumb that exists is the app's own root, so the strip drew a lone house
   * over a covered body — a claim about where you are, made about somewhere that has not arrived.
   *
   * The window tells the strip rather than the strip working it out: the loading flag belongs to the
   * window, which owns the iframe and its load event, and a strip watching that for itself would be
   * the second thing in the package that has to know when a frame is done.
   */
  @property({ attribute: false })
  public busy = false;

  /**
   * Whether the window is showing a document that can be previewed, which puts a Preview action at
   * the strip's right end.
   *
   * On the strip rather than in the titlebar, because the titlebar's controls are summed into every
   * theme's drag-clamp metrics, and a control that only some windows draw would under-count them in
   * the unsafe direction. The strip carries no such sum, already names the document, and is only
   * drawn on the section windows a document is edited in. The window decides: it is the one that
   * knows what its frame is showing.
   */
  @property({ attribute: false })
  public previewable = false;

  /**
   * Whether a preview of this window's document is open, as a pane or floating. The action then shows
   * as pressed, and pressing it closes the preview, which is what a pressed button promises.
   */
  @property({ attribute: false })
  public previewActive = false;

  /**
   * Whether that preview is a pane in this window, which leaves Preview out of the strip. The button
   * slides out with the pane and becomes its Hide, so every pane is put away the same way, whatever
   * opened it; it comes back once the pane has slid back in. A preview in a window of its own keeps
   * the button, pressed, since nothing then sits at the window's edge to put it away from.
   */
  @property({ attribute: false })
  public previewDocked = false;

  /**
   * The workspace view the window shows, named after the crumbs with its own icon, and whether it can
   * open beside the editor, which puts the side-panel button on it (issue #131). Undefined while the
   * window shows its first view, the editor.
   *
   * On the view's own crumb rather than beside Preview, because it acts on the view and Preview acts
   * on the document: a button that comes and goes with the view reads as part of it when it sits on
   * its name, and as a glitch when it blinks at the strip's end next to one that never does. The
   * window decides, as it does for Preview: it is the one that can see the view in its frame.
   */
  @property({ attribute: false })
  public view?: UmbraDesktopPathView;

  /**
   * Adopts the active theme's `window` stylesheet.
   *
   * Its own call rather than something inherited from `window.element`'s: custom properties cross a
   * shadow boundary by ordinary CSS inheritance, but a stylesheet does not, and this element has
   * its own shadow root nested inside the window's. `'window'` rather than a surface of its own,
   * for the reason `window-notices.element` gives — that is the sheet these rules belong in, and a
   * dedicated surface would be one more thing a theme author has to remember to fill in.
   */
  constructor() {
    super();
    new UmbraDesktopThemeStyles(this, 'window');
  }

  /**
   * Ask the window to route its frame to a crumb.
   *
   * An event rather than a call, because this element has no business knowing about iframes, the
   * window manager or the unsaved-changes guard. `window.element` owns all three and decides
   * whether the navigation happens at all.
   * @param href The crumb's href, as core wrote it: usually base-relative.
   */
  #navigate(href: string) {
    this.dispatchEvent(
      new CustomEvent('umbradesktop-path-navigate', {
        detail: { href },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    if (this.crumbs.length === 0) return nothing;
    // An empty bar rather than no bar. `.path-bar` carries an explicit height, so this is exactly
    // the strip's themed height painted in the strip's own background: the crumbs appear in place
    // when the content lands, instead of the body losing the strip's height under a frame that has
    // already painted and reflowing the document inside it at the worst possible moment.
    //
    // A plain `div`, not the `nav`: a labelled navigation landmark holding nothing is worse than no
    // landmark at all, since the label promises a path and hands back an empty region.
    if (this.busy) return html`<div class="path-bar" aria-hidden="true"></div>`;
    return html`
      <nav class="path-bar" aria-label=${this.localize.term('umbraDesktop_pathLabel')}>
        ${this.crumbs.map((crumb, index) => {
          // Localized here rather than in `crumbs.ts`, and it is the first crumb that needs it: its
          // label is the app's name, which for a curated app is a token like
          // `#umbraDesktop_appContentEditor` — the same value the titlebar puts through
          // `localize.string`. An entity's name is a literal and passes through untouched, so one
          // call covers both. Doing it here also makes the strip follow the backoffice's UI
          // language, because the localize controller re-renders this element when that changes.
          const label = this.localize.string(crumb.label);
          const separator =
            index < this.crumbs.length - 1
              ? html`<span class="path-separator" aria-hidden="true">/</span>`
              : nothing;
          // The window's own root draws a house rather than its name: the titlebar is a few pixels
          // above and already says it, so spelling it out made every window open on the same words
          // twice. The name stays as the tooltip and the accessible name, so nothing is lost to
          // someone hovering it or reading the strip with a screen reader.
          const content = crumb.home
            ? html`<umb-icon class="path-home" name="icon-home"></umb-icon>`
            : label;
          const body = crumb.href
            ? html`<button
                class="path-crumb ${crumb.home ? 'path-crumb-home' : ''}"
                type="button"
                title=${label}
                aria-label=${label}
                @click=${() => this.#navigate(crumb.href as string)}>
                ${content}
              </button>`
            : html`<span class="path-current" aria-current="page" title=${label}>${content}</span>`;
          return html`${body}${separator}`;
        })}
        ${this.#renderView()}
        ${this.#renderActions()}
      </nav>
    `;
  }

  /**
   * The view the window shows, as the last step of the path, and the button that keeps it beside the
   * editor when it can be.
   * @returns The view crumb, or nothing while the window shows its first view.
   */
  #renderView() {
    const view = this.view;
    if (!view) return nothing;
    const label = this.localize.string(view.label);
    const title = this.localize.term(view.open ? 'umbraDesktop_besideCloseTitle' : 'umbraDesktop_besideOpenTitle', label);
    return html`<span class="path-separator" aria-hidden="true">/</span>
      <span class="path-view" title=${label}>
        ${view.icon ? html`<umb-icon class="path-view-icon" name=${view.icon}></umb-icon>` : nothing}<span
          class="path-view-label"
          >${label}</span
        >
      </span>
      ${view.beside && !view.docked
        ? html`<button
            class="path-action path-beside ${view.open ? 'path-action-on' : ''}"
            type="button"
            aria-pressed=${view.open ? 'true' : 'false'}
            title=${title}
            aria-label=${title}
            @click=${this.#beside}>
            ${toggleIcon(!!view.open)}
          </button>`
        : nothing}`;
  }

  /**
   * The action at the strip's right end: Preview, which acts on the document and so is there
   * whenever a document is. In a group of its own, which is what stays pinned to the end while a deep
   * path scrolls under it.
   *
   * The eye and the label, and no panel icon. It carried one after its label for a while, the one
   * the view's button draws, and two icons on one button looked untidy. The panel icon is kept for
   * buttons that only move a pane, the view's button and a pane's Hide; Preview names a feature, and
   * its pane's header starts with the same eye.
   * @returns The group, or nothing when there is no document to preview.
   */
  #renderActions() {
    if (!this.previewable || this.previewDocked) return nothing;
    return html`<span class="path-actions">
      <button
        class="path-action path-preview ${this.previewActive ? 'path-preview-on' : ''}"
        type="button"
        aria-pressed=${this.previewActive ? 'true' : 'false'}
        title=${this.localize.term(this.previewActive ? 'umbraDesktop_previewClose' : 'umbraDesktop_previewOpenTitle')}
        aria-label=${this.localize.term('umbraDesktop_previewOpen')}
        @click=${this.#preview}>
        <umb-icon class="path-preview-icon" name="icon-eye"></umb-icon>
        <span class="path-preview-label">${this.localize.term('umbraDesktop_previewOpen')}</span>
      </button>
    </span>`;
  }

  /**
   * Ask the window to open the view it shows beside its editor, as a window of its own on
   * Shift-click, which is what Shift-click on a link does in a browser. An event, for the reason
   * {@link #navigate} is one, and because the window checks the view once more before it does.
   * @param event The click.
   */
  #beside = (event: MouseEvent) => {
    this.dispatchEvent(
      new CustomEvent('umbradesktop-path-beside', { detail: { floating: event.shiftKey }, bubbles: true, composed: true }),
    );
  };

  /**
   * Ask the window to open its preview, as a window of its own on Shift-click. An event, for the
   * same reason {@link #navigate} is one: the window owns the frame, the route and the manager, and
   * this strip owns none of them.
   * @param event The click.
   */
  #preview = (event: MouseEvent) => {
    this.dispatchEvent(
      new CustomEvent('umbradesktop-path-preview', { detail: { floating: event.shiftKey }, bubbles: true, composed: true }),
    );
  };

  static override styles = [
    css`
      :host {
        display: block;
        flex: none;
      }
      /* The height is interpolated from a constant rather than typed, because the same number is
         reported by every theme as 'metrics.pathbarHeight' and spent by the window sizing. A strip
         that measured one height and was paid for at another would leave every section window's app
         that many pixels short. See docs/developer/theming.md §4. */
      .path-bar {
        display: flex;
        align-items: center;
        gap: 2px;
        /* A deep path scrolls rather than growing or truncating: a window that got taller because a
           document was filed one level deeper would be worse than a strip you can drag sideways,
           and an ellipsis in the middle would hide exactly the ancestors this exists to offer.

           'overflow-y: hidden' is not redundant beside it. CSS computes a 'visible' axis to 'auto'
           as soon as the other axis is not visible, so 'overflow-x: auto' alone gives the strip a
           *vertical* scrollbar the moment its content is a pixel taller than its height — which is
           every theme that sets a shorter strip than the default. Windows 98 at 22px and Umbraco 4
           at 24px both shipped a chunky period-correct scrollbar into a 22px bar because of it. */
        overflow-x: auto;
        overflow-y: hidden;
        white-space: nowrap;
        scrollbar-width: thin;
        box-sizing: border-box;
        height: var(--umbradesktop-path-height, ${UMBRADESKTOP_PATH_HEIGHT}px);
        /* The same at both ends, and whatever sits at an end, a crumb or a button, starts there and
           pads its own content as it does anywhere else. */
        padding: 0 var(--umbradesktop-path-padding, 8px);
        /* A size container, so a button's padding can be worked out from the strip's inner height:
           see strip-button.ts. */
        container-type: size;
        background: var(--umbradesktop-path-background, var(--uui-color-surface-alt));
        /* The backoffice's border colour, the line it draws between the tree and the workspace, so the
           strip has an edge against the content below it. The divider colour it used before is
           barely darker than the strip and left no visible line. The pane header and a floating
           window's strip fall back to this too. */
        border-bottom: var(--umbradesktop-path-border-bottom, ${UMBRADESKTOP_PATH_LINE}px solid var(--uui-color-border));
        color: var(--umbradesktop-path-text, var(--uui-color-text));
        font-size: var(--umbradesktop-path-font-size, 13px);
      }
      /* A word is centred on its capitals rather than its line box (text-box trim), so it sits on the same
         centre line as the icons beside it. A line box carries the font's room above the letters as well
         as below, and a word centred by it sat 1.7px above its icons, measured on the drawn pixels in a
         live strip. Trimmed to cap height and baseline, the box is the word, whatever the theme's font. */
      .path-crumb,
      .path-separator,
      .path-current,
      .path-view-label,
      .path-preview-label {
        text-box: trim-both cap alphabetic;
      }
      .path-crumb {
        flex: none;
        border: 0;
        padding: 2px 4px;
        border-radius: 3px;
        background: none;
        font: inherit;
        cursor: pointer;
        color: var(--umbradesktop-path-link, var(--uui-color-interactive));
      }
      /* The hover text is its own token because the hover background can be as strong as the link
         colour itself: Windows 98 draws its era's navy selection behind a navy link, and white text
         on it is what makes that readable. One token for every button on the strip, so a new one
         cannot miss the rescue the way the Preview button first did. */
      .path-crumb:hover {
        background: var(--umbradesktop-path-link-hover-background, var(--uui-color-surface-emphasis));
        color: var(--umbradesktop-path-link-hover-text, var(--umbradesktop-path-link, var(--uui-color-interactive)));
      }
      .path-crumb-home {
        display: inline-flex;
        align-items: center;
      }
      /* Every icon on the strip, this one, Preview's eye and the view's two, is drawn at the one strip
         icon size the pane header's buttons use, so the window's strip and its pane's read as one.
         The first build sized these off the strip's type and drew them at 15.5px beside the pane's
         18. A theme with a short strip sets the token smaller. */
      .path-home {
        font-size: var(--umbradesktop-strip-icon-size, 16px);
        line-height: 1;
      }
      .path-current {
        flex: none;
        padding: 2px 4px;
        color: var(--umbradesktop-path-text, var(--uui-color-text));
      }
      /* The fallback is mixed out of the strip's own text colour rather than named, because it has
         to work in both of the backoffice's colour schemes: the Umbraco theme sets no palette at
         all, so every value it renders is a fallback from this file. The first choice here was
         uui-color-border, which is a dark grey and therefore invisible on a dark bar. Diluting
         currentColor instead follows the text in either scheme, so the separator sits the same
         distance from the words beside it whichever way the backoffice is set. A theme that names a
         colour overrides the whole expression, as macOS and Windows 98 do.
         (No backticks in this comment: it lives inside a css template literal and they end it.) */
      .path-separator {
        flex: none;
        color: var(--umbradesktop-path-separator, color-mix(in srgb, currentColor 55%, transparent));
      }
      /* Pinned to the strip's right end, and kept there while a deep path scrolls sideways under it:
         sticky inside the strip's own horizontal scroller, with the strip's background behind it so
         crumbs passing underneath do not show through. One group for every action, since two
         buttons each pinned to the same edge would sit on top of each other. */
      .path-actions {
        flex: none;
        align-self: stretch;
        position: sticky;
        right: 0;
        margin-left: auto;
        display: inline-flex;
        align-items: stretch;
        gap: 2px;
        background: var(--umbradesktop-path-background, var(--uui-color-surface-alt));
      }
      /* Styled as a crumb, from the crumb's tokens, so every theme that restyles its crumbs restyles
         these with them. */
      /* The strip's full height, as the pane header's buttons are: the 20px they were before was a
         small target in a 28px strip, and the strip pays for its height either way. */
      .path-action {
        flex: none;
        align-self: stretch;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        border: 0;
        /* The space its icon leaves above and below, on the left and right too: strip-button.ts. */
        padding: 0 ${UMBRADESKTOP_STRIP_BUTTON_PADDING};
        border-radius: var(--umbradesktop-strip-button-radius, 3px);
        background: var(--umbradesktop-path-background, var(--uui-color-surface-alt));
        font: inherit;
        cursor: pointer;
        /* The strip's text colour, not the link colour the crumbs use: this is a button beside the
           path, and in a link's navy or accent it read as one more crumb. */
        color: var(--umbradesktop-path-text, var(--uui-color-text));
      }
      /* A toolbar button's hover, shared with the pane header's controls and the Dock button, and
         separate from a crumb's: Windows 98 hovers a crumb in its navy selection, as a link, and a
         toolbar button by raising it. */
      .path-action:hover {
        background: var(
          --umbradesktop-strip-button-hover-background,
          var(--umbradesktop-path-link-hover-background, var(--uui-color-surface-emphasis))
        );
        color: var(--umbradesktop-strip-button-hover-text, var(--umbradesktop-path-text, var(--uui-color-text)));
        box-shadow: var(--umbradesktop-strip-button-hover-shadow, none);
      }
      /* On while the preview is open, drawn the way the theme draws a toggled toolbar button: a
         filled face, and a pushed-in bevel where the theme has bevels. Hovering it keeps it on. The
         fallback is the backoffice's own "you are here" colour, the one its tree marks the open
         document with, so the Umbraco theme needs no palette for it; every other theme sets its own,
         which 'theme/attached-content.test.ts' holds it to. The first version drew an outline ring
         on the hover ground, which is what a focused form field looks like, not a toggle. */
      .path-preview-on,
      .path-preview-on:hover,
      .path-action-on,
      .path-action-on:hover {
        background: var(--umbradesktop-strip-button-on-background, var(--uui-color-current));
        color: var(--umbradesktop-strip-button-on-text, var(--uui-color-current-contrast));
        box-shadow: var(--umbradesktop-strip-button-on-shadow, none);
      }
      .path-preview-icon {
        flex: none;
        font-size: var(--umbradesktop-strip-icon-size, 16px);
        width: ${UMBRADESKTOP_STRIP_ICON_BOX};
        height: ${UMBRADESKTOP_STRIP_ICON_BOX};
        line-height: 1;
      }
      /* The view the window shows, the last step of the path: drawn as the current crumb is, with
         the view's own icon so it reads as the tab it came from. */
      .path-view {
        flex: none;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 4px;
        color: var(--umbradesktop-path-text, var(--uui-color-text));
      }
      .path-view-icon {
        font-size: var(--umbradesktop-strip-icon-size, 16px);
        line-height: 1;
      }
      /* Icon only, right after the view's name, which is what labels it. Its even padding makes it
         square. */
      .path-beside {
        justify-content: center;
      }
      /* The panel icon on the view's button, at the strip icon size, turned to put its panel on the
         right, where the view opens. */
      .path-toggle-icon {
        flex: none;
        font-size: var(--umbradesktop-strip-icon-size, 16px);
        width: ${UMBRADESKTOP_STRIP_ICON_BOX};
        height: ${UMBRADESKTOP_STRIP_ICON_BOX};
        line-height: 1;
      }
    `,
  ];
}

/**
 * The panel icon on a view's beside button, which opens the view on the right. Preview has none: its
 * eye says what it opens. It turns its chevron with the pane, out while the pane is away and back in
 * while it is open, so the button says what a click will do. See `panel-icon.ts` for why two icons rather than one.
 * @param open Whether the pane it toggles is open.
 * @returns The icon.
 */
function toggleIcon(open: boolean) {
  const icon = panelIcon(open, 'right');
  return html`<umb-icon class="path-toggle-icon" name=${icon.name} style="rotate:${icon.rotate}" aria-hidden="true"></umb-icon>`;
}

export default UmbraDesktopWindowPathElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-window-path': UmbraDesktopWindowPathElement;
  }
}
