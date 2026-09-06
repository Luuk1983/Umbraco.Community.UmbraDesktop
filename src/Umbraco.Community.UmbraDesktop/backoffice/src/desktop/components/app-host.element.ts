import { UMBRADESKTOP_APP_TOKEN_FALLBACKS } from '../theme/types.js';
import { customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * Localization token for the load-failure message. A token rather than a literal because the
 * message is the one thing a user reads when an app is broken, and reading it in English on a
 * Dutch backoffice is a second, smaller failure on top of the first.
 */
const APP_LOAD_FAILED_TOKEN = 'umbraDesktop_appLoadFailed';

/**
 * The English text behind that token, written here as well as in `localization/en.ts`.
 *
 * Deliberate duplication, not drift: this is the message shown when a *bundle* failed to load, and
 * a desktop broken enough to hit it may well be one whose localization dictionaries did not load
 * either. `localize.term` renders the raw token in that case, which reads as a second bug rather
 * than an explanation, so the string is passed to `termOrDefault` as its own fallback. The two
 * copies disagreeing costs nothing: the dictionary always wins when it is there.
 */
const APP_LOAD_FAILED_FALLBACK = 'This app could not be loaded.';

/**
 * Inline style for the failure message, because a light-DOM element has no shadow root for
 * `static styles` to land in.
 *
 * Painted with the app surface/text pair rather than left to inherit, because the message stands
 * where the app would and a theme sets those two together: taking the colour from one group and
 * the ground from another is how you get near-invisible text on a dark theme. Both fallbacks are
 * interpolated from the published contract rather than retyped (see `theme/types.ts`), and the
 * ground is `background`, not `background-color`, for the reason that contract gives: two of the
 * shipped themes make the app surface a gradient, which `background-color` refuses.
 */
const FAILURE_STYLE = [
  'margin: 0',
  'padding: var(--uui-size-space-5, 18px)',
  `background: var(--umbradesktop-app-surface, ${UMBRADESKTOP_APP_TOKEN_FALLBACKS['--umbradesktop-app-surface']})`,
  `color: var(--umbradesktop-app-text, ${UMBRADESKTOP_APP_TOKEN_FALLBACKS['--umbradesktop-app-text']})`,
].join(';');

/**
 * Mounts a self-contained app's element inside a window body.
 *
 * Renders into the **light DOM** (`createRenderRoot` returns `this`) rather than a shadow root, on
 * purpose: an app is someone else's element and must be able to size itself against this box and
 * be inspected by whoever wrote it, and a shadow boundary here would buy isolation the app already
 * has from its own shadow root.
 *
 * That makes one node the target of both Lit's rendering and the mounted app, so the app is held as
 * a value in the template (`_app`) instead of being appended by hand. Appending by hand (a
 * `replaceChildren`, an `innerHTML`) ejects Lit's marker comments from the DOM, and every later
 * update then throws `This ChildPart has no parentNode`: measured, not feared, in
 * `app-host.element.test.ts`, where the two "across an unrelated re-render" cases are what hold
 * this shape in place. Lit's `ChildPart` compares node values by identity, so a re-render that
 * does not change `_app` leaves the app's element untouched, which is what a game with a board in
 * progress needs.
 *
 * A loader that throws is reported in place. It is the one failure mode with no other surface: the
 * manifest resolved, so the app is in the launcher and the window opened, and an empty body would
 * read as a broken desktop rather than a missing bundle.
 */
@customElement('umbradesktop-app-host')
export class UmbraDesktopAppHostElement extends UmbLitElement {
  /** The manifest's element loader. Set by the window from the app's `content`. */
  @property({ attribute: false })
  load?: () => Promise<unknown>;

  /**
   * The app's element once constructed, rendered as a template value.
   *
   * Reactive state rather than a hand-appended child so Lit owns every child of this element: see
   * the class doc for what happens when it does not.
   */
  @state()
  private _app?: HTMLElement;

  /** Whether the last load attempt failed, which swaps the body for the message. */
  @state()
  private _failed = false;

  /**
   * Resolves once the load has been attempted *and* its outcome is in the DOM, whether it
   * succeeded or not. For tests: mounting is two async hops (the loader, then Lit's update), and
   * without this a test would have to guess how many microtasks to wait.
   */
  public mounted: Promise<void> = Promise.resolve();

  /** Light DOM: the app's element is the app author's to style and inspect. */
  override createRenderRoot() {
    return this;
  }

  /**
   * Re-mount whenever the loader changes, and only then.
   *
   * In `willUpdate` rather than `updated` so the clearing half of `#mount` lands in the render that
   * is already scheduled: the outgoing app leaves the DOM as the loader changes, instead of
   * lingering for one frame beside its replacement.
   * @param changed The properties this update is for.
   */
  override willUpdate(changed: Map<string, unknown>) {
    if (changed.has('load')) this.mounted = this.#mount();
  }

  /**
   * Resolve the loader and hand Lit the element it yields.
   *
   * Accepts either shape an Umbraco element loader can resolve to: the module (whose `element` or
   * `default` export is the class) or the constructor itself, both of which
   * `ElementLoaderProperty` permits and `UmbExtensionElementInitializer` accepts. Registering the
   * custom element is the app's own job, done by its module's side effects, so this only has to
   * construct it.
   * @returns A promise settling once the outcome, app or message, is rendered.
   */
  async #mount(): Promise<void> {
    // Synchronous, so a swap clears the old app in the update this is called from.
    this._app = undefined;
    this._failed = false;
    if (this.load) {
      try {
        const resolved = (await this.load()) as
          | { element?: CustomElementConstructor; default?: CustomElementConstructor }
          | CustomElementConstructor;
        // Optional chaining because a loader that resolves to nothing at all is a plausible
        // package bug (`async () => { import(…) }`, with the return forgotten), and reporting it
        // as this message rather than as a bare TypeError is the difference between a console
        // line a package author can act on and one they cannot.
        const ctor = typeof resolved === 'function' ? resolved : (resolved?.element ?? resolved?.default);
        if (typeof ctor !== 'function') throw new Error('loader resolved to no element constructor');
        this._app = new ctor();
      } catch (error) {
        console.error('[UmbraDesktop] app element failed to load', error);
        this._failed = true;
      }
    }
    // `await host.mounted` should mean "the body is settled", not "the loader returned": the
    // element only enters the DOM on the update these assignments schedule.
    await this.updateComplete;
  }

  override render() {
    if (this._failed) {
      return html`<p style=${FAILURE_STYLE}>
        ${this.localize.termOrDefault(APP_LOAD_FAILED_TOKEN, APP_LOAD_FAILED_FALLBACK)}
      </p>`;
    }
    return html`${this._app ?? nothing}`;
  }
}

export default UmbraDesktopAppHostElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-app-host': UmbraDesktopAppHostElement;
  }
}
