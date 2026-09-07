import { UMBRADESKTOP_APP_TOKEN_FALLBACKS } from '../theme/types.js';
import { UMBRADESKTOP_BODY_LOAD_TIMEOUT_MS, UMBRADESKTOP_THEME_ATTRIBUTE } from '../constants.js';
import { customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { loadManifestElement } from '@umbraco-cms/backoffice/extension-api';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type {
  ClassConstructor,
  ElementLoaderExports,
  ElementLoaderProperty,
} from '@umbraco-cms/backoffice/extension-api';

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
 * ground is `background`, not `background-color`, for the reason that contract gives: a surface
 * token is allowed to carry a gradient, which `background-color` refuses outright.
 */
const FAILURE_STYLE = [
  'margin: 0',
  'padding: var(--uui-size-space-5, 18px)',
  `background: var(--umbradesktop-app-surface, ${UMBRADESKTOP_APP_TOKEN_FALLBACKS['--umbradesktop-app-surface']})`,
  `color: var(--umbradesktop-app-text, ${UMBRADESKTOP_APP_TOKEN_FALLBACKS['--umbradesktop-app-text']})`,
].join(';');

/**
 * Inline style for the in-flight loader, for the same no-shadow-root reason as
 * {@link FAILURE_STYLE}.
 *
 * Fills the body and paints the app surface so the gap before the app arrives looks like the app's
 * own ground rather than a hole, and centres the spinner in it. `min-height` rather than `height`
 * because the host is a plain light-DOM element with no size of its own until something inside it
 * has one.
 */
const PENDING_STYLE = [
  'display: flex',
  'align-items: center',
  'justify-content: center',
  'min-height: 100%',
  'padding: var(--uui-size-space-5, 18px)',
  `background: var(--umbradesktop-app-surface, ${UMBRADESKTOP_APP_TOKEN_FALLBACKS['--umbradesktop-app-surface']})`,
  `color: var(--umbradesktop-app-text, ${UMBRADESKTOP_APP_TOKEN_FALLBACKS['--umbradesktop-app-text']})`,
].join(';');

/**
 * Whether an `element` value is a loader function rather than a class constructor.
 *
 * The two are indistinguishable to `typeof`, which is the trap this exists to avoid: treating a
 * constructor as a loader calls it, and `TypeError: Class constructor cannot be invoked without
 * 'new'` is what the user then reads as "this app could not be loaded". The `prototype` test is
 * Umbraco's own, copied deliberately from `loadManifestElement` so the two agree on every input:
 * class declarations and `function` expressions carry a `prototype`, arrow functions and `async`
 * functions do not.
 *
 * Agreeing with Umbraco means inheriting its one wrong answer: a loader written as a plain
 * `function` expression carries a `prototype` and so is taken for a constructor by both. Disagreeing
 * would be worse (this decides only whether to wrap the value, while Umbraco decides what to do with
 * it, so a private opinion here would just split the two paths), which is why that case is contained
 * where the misclassification finally shows up instead: `#mount` checks that the constructor really
 * built an element.
 *
 * Narrow rather than general: the only caller needs to know whether it may safely wrap the value in
 * an observing closure, and that is exactly the loader case.
 * @param value The manifest's `element` value, in any of its forms.
 * @returns True when calling it is the way to get at the element.
 */
function isElementLoaderFunction(
  value: ElementLoaderProperty,
): value is () => Promise<ElementLoaderExports> {
  // Cast because neither arm of the union that `typeof` leaves declares `prototype`: TypeScript
  // models call and construct signatures without it, so the property that tells them apart at
  // runtime is invisible at compile time.
  return typeof value === 'function' && !(value as { prototype?: unknown }).prototype;
}

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
 * A loader that throws, resolves to no constructor, yields a "constructor" that builds something
 * other than an element, or never settles at all (see {@link UMBRADESKTOP_BODY_LOAD_TIMEOUT_MS}) is
 * reported in place, and named by its alias in the console. It is the one failure mode with no
 * other surface: the manifest resolved, so the app is in the launcher and the window opened, and an
 * empty body would read as a broken desktop rather than a missing bundle. While the loader is in
 * flight the body shows a spinner instead, as the iframe path does, because a dynamic import is a
 * network hop.
 *
 * ## What an app author can rely on
 *
 * **Teardown is the browser's own.** The app's element is a child of this host, so closing the
 * window (which removes the host) or reassigning `load` fires the app's `disconnectedCallback` —
 * exactly once, and on a swap before the replacement's `connectedCallback`. That is the whole
 * teardown contract: an app cancels its `requestAnimationFrame`, clears its intervals and drops
 * its listeners there, and needs no signal from the desktop. Pinned in
 * `app-host.element.test.ts`, since it is inferable from this shape rather than guaranteed by it,
 * and a later move to shadow DOM could break it silently.
 *
 * **Minimizing does not unmount.** The window hides its frame with `?hidden` rather than tearing
 * the body down, so a minimized game keeps running and keeps its board. An app that should idle
 * while out of sight has to watch its own visibility; one that must keep ticking gets that for
 * free.
 *
 * **The active theme's id is on the app's own element**, as `data-umbradesktop-theme`, from before
 * its first render and updated in place for the life of the instance. So
 * `:host([data-umbradesktop-theme='win98'])` is a selector an app can write, which is the contract
 * design D9 promises and the reason this host forwards the attribute rather than merely carrying
 * it: `:host` matches the app's own element, and the ancestor form that would have seen it on this
 * host, `:host-context`, has never shipped in Firefox. See {@link chromeThemeId}.
 */
@customElement('umbradesktop-app-host')
export class UmbraDesktopAppHostElement extends UmbLitElement {
  /**
   * The manifest's `element` value, set by the window from the app's `content`.
   *
   * Umbraco's own `ElementLoaderProperty`, not the loader-function arm of it: a module path string,
   * a loader, an imported module object and a bare constructor are all legal in a manifest, and
   * typing this as the one arm the first implementation handled did not make the others go away, it
   * only meant they arrived as a runtime error. Resolution is `loadManifestElement`'s (see
   * `#mount` below), so this property's job is to carry the value untouched.
   */
  @property({ attribute: false })
  load?: ElementLoaderProperty;

  /**
   * The app's manifest alias, set by the window alongside `load`, and read only when a load fails.
   *
   * A plain field rather than a `@property`, which is the whole point of it being here at all: this
   * host remounts whenever `load` changes, and a *second* reactive input would be a second way to
   * throw away a running app. Nothing renders the alias, so a reactive one would buy an update pass
   * per assignment and put `'alias'` in `willUpdate`'s changed map, one line away from a remount
   * condition that restarts a game mid-board for a re-render that changed nothing. Non-reactive
   * makes that unreachable rather than merely unwritten (pinned in `app-host.element.test.ts`), and
   * costs nothing: the window sets it in the same binding commit as `load`, so it is already in
   * place by the time the mount it might have to name is attempted.
   *
   * Optional because it is diagnostic-only: an alias nobody set must degrade the message, never the
   * app. See the `#describeApp` method.
   */
  public alias?: string;

  /**
   * The chrome theme in force, forwarded onto the app's own element as
   * {@link UMBRADESKTOP_THEME_ATTRIBUTE} so the app can branch on it.
   *
   * Declared with `attribute`, so the window's `data-umbradesktop-theme` binding on *this* element
   * is what sets it. One binding then does both halves of the contract and they cannot disagree:
   * the attribute stays on this host, which is where an app rendering into light DOM reads it since
   * it has no shadow root and so no `:host`, and the property carries the same value down to the
   * app element for the app that does.
   *
   * Reactive, where `alias` above is deliberately not. The two are opposites for the same reason: a
   * remount is what throws a running game's board away, and `alias` never changes at runtime so
   * making it unreactive removes a way to cause one, while the theme id *does* change at runtime
   * and a value that could not react would leave a switched theme unpainted until the next reload.
   * What keeps the reaction safe is that only `load` remounts — `willUpdate` writes this onto the
   * element already mounted and touches nothing else, so a theme switch mid-game recolours the
   * board rather than clearing it. Pinned in `window-body.test.ts`, by node identity, because
   * "the attribute changed" passes under a remount too.
   *
   * `reflect` is for a hypothetical external caller that sets the property instead of the
   * attribute, which is anything mounting this host by hand rather than through
   * `window.element.ts`. Kept for that reason, and stated no more strongly than that, because it is
   * also the only thing that could bite such a caller: setting `chromeThemeId = null` while a
   * window's own binding holds `'win98'` reflects the removal, and that binding's `AttributePart`
   * still has `'win98'` cached, so a later re-render with the same value writes nothing and the
   * attribute does not come back. Doubly unreachable today (nothing sets the property, and the one
   * thing that sets the attribute is the binding itself), and removing `reflect` would trade a
   * corner case no caller can currently reach for a plain gap every hand-mounting caller would.
   * Nothing loops either way: Lit suppresses the reflection when the value arrived from the
   * attribute in the first place.
   *
   * `string | null` and not `string`: an absent attribute converts to `null`, and that is a state
   * with a meaning here rather than an accident. No theme has resolved yet, so no attribute is
   * written at all — an empty one would match an app's `[data-umbradesktop-theme]` existence check
   * and answer it with nothing usable.
   */
  @property({ attribute: UMBRADESKTOP_THEME_ATTRIBUTE, reflect: true })
  public chromeThemeId?: string | null;

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

  /** Whether a loader is in flight, which puts the spinner in the body until it settles. */
  @state()
  private _pending = false;

  /**
   * The current attempt, as {@link mountComplete} hands it out. A field rather than the getter's
   * own promise because `willUpdate` replaces it on every loader change.
   */
  #mounting: Promise<void> = Promise.resolve();

  /**
   * Settles once the current load has been attempted *and* its outcome is in the DOM: the app
   * mounted, or the failure message rendered. Both outcomes resolve, since a rendered message is
   * an outcome and not an error; the only rejection is a Lit update throwing, which is a bug in
   * this element's own `render` rather than anything the app or its loader did.
   *
   * A getter that awaits `updateComplete` first, so that the obvious call reads correctly:
   * `host.load = loader; await host.mountComplete;`. The attempt itself is started from
   * `willUpdate`, so at the moment a caller assigns `load` the promise for it does not exist yet,
   * and returning the field directly would hand back the *previous* attempt's promise and resolve
   * against an empty body. Awaiting Lit's update first is exactly the hop that closes that gap,
   * and doing it here rather than in every caller is why this is not documented as a caveat.
   *
   * Named after `updateComplete` on purpose: it is the same kind of thing, and `mounted` read as a
   * boolean.
   * @returns A promise settling when the body has settled.
   */
  public get mountComplete(): Promise<void> {
    return this.updateComplete.then(() => this.#mounting);
  }

  /** Light DOM: the app's element is the app author's to style and inspect. */
  override createRenderRoot() {
    return this;
  }

  /**
   * Re-mount whenever the loader changes, and only then. Re-stamp the theme whenever it changes,
   * and never re-mount for it.
   *
   * In `willUpdate` rather than `updated` so the clearing half of `#mount` lands in the render that
   * is already scheduled: the outgoing app leaves the DOM as the loader changes, instead of
   * lingering for one frame beside its replacement.
   *
   * The two branches are independent, which is the point of writing them as two. A theme change
   * reaches an app that is already mounted through the second one only, so it never touches `load`,
   * never re-enters `#mount`, and leaves Lit's `_app` value identical — a `ChildPart` compares node
   * values by identity, so the render this update schedules leaves the app's element exactly where
   * it was, board and all. Both branches run when both changed, and the theme one is then a no-op:
   * `#mount` has already cleared `_app` synchronously by the time it is reached, and stamps the
   * replacement itself once its loader settles.
   * @param changed The properties this update is for.
   */
  override willUpdate(changed: Map<string, unknown>) {
    // Chained up even though neither `UmbLitElement` nor the element-api mixin defines it today:
    // a base class gaining a `willUpdate` in an Umbraco minor would otherwise break silently.
    super.willUpdate(changed);
    if (changed.has('load')) this.#mounting = this.#mount();
    if (changed.has('chromeThemeId')) this.#stampTheme(this._app);
  }

  /**
   * Write the theme id onto an app element, or take it off again when no theme has resolved.
   *
   * A direct DOM write rather than a template binding, because the app's element is a value Lit
   * renders and not a tag Lit authored: there is no attribute part to bind. Idempotent and safe to
   * call with nothing mounted, so both callers can be unconditional.
   *
   * The remove arm is not symmetry for its own sake. An app that has been shown a theme and then
   * loses it — a context torn down, a window re-parented — must not keep selecting on a theme that
   * is no longer in force, and leaving a stale id there is worse than none: an app can see that the
   * attribute is missing, and cannot see that it is out of date.
   * @param app The app element to stamp, if there is one.
   */
  #stampTheme(app?: HTMLElement): void {
    if (!app) return;
    if (this.chromeThemeId) app.setAttribute(UMBRADESKTOP_THEME_ATTRIBUTE, this.chromeThemeId);
    else app.removeAttribute(UMBRADESKTOP_THEME_ATTRIBUTE);
  }

  /**
   * Resolve the manifest's `element` value and hand Lit the element it yields.
   *
   * The resolving is `loadManifestElement`'s, not this method's: it is the function Umbraco's own
   * extension initializers use, and it is the only code that handles all four forms an `element`
   * may take. This used to unwrap the shapes by hand, which worked for a loader resolving to a
   * module and silently failed for the other two thirds of the union. Registering the custom
   * element is the app's own job, done by its module's side effects, so this only has to construct
   * what comes back.
   * @returns A promise settling once the outcome, app or message, is rendered.
   */
  async #mount(): Promise<void> {
    // Captured, so a loader that is no longer the current one can be recognised on the way back
    // and commit nothing. Lit only calls this when `load` actually changed identity, so `this.load
    // !== load` means precisely "superseded while in flight".
    const load = this.load;
    // Synchronous, so a swap clears the old app in the update this is called from.
    this._app = undefined;
    this._failed = false;
    this._pending = !!load;
    if (load) {
      try {
        const ctor = await this.#raceTheClock(this.#resolveConstructor(load));
        if (this.load !== load) return;
        // `loadManifestElement` reports every failure as `undefined` rather than throwing, so this
        // is where a package bug becomes the message: a loader that resolved to nothing at all
        // (`async () => { import(…) }`, with the return forgotten), a module exporting neither
        // `element` nor `default`, a path that imported something with no element in it. Throwing
        // here rather than rendering an empty body is the difference between a console line a
        // package author can act on and one they cannot.
        if (!ctor) throw new Error('element could not be resolved to a constructor');
        const app = new ctor();
        // Umbraco returns any constructor it is handed without checking what it constructs, and
        // `prototype` is all it has to recognise one by, so two legal-looking manifests arrive here
        // as "constructors" that build something else entirely. A loader written as a plain
        // `function () { return import('./game.js'); }` has a `prototype`, so it is taken for the
        // constructor and `new` returns the promise it returns; an `element` pointing at a class
        // that is not an element class constructs a plain object. Both then reached Lit as a child
        // value and were stringified into the window: `[object Promise]`, no console line, nothing
        // for an author to work from. Neither is fixable upstream from here, so this is where the
        // shape is finally checked, and both land on the message every other load failure lands on.
        if (!(app instanceof HTMLElement)) {
          throw new Error(
            'element constructed something that is not an HTMLElement (a loader must be an arrow or async function, not a plain function)',
          );
        }
        // Before `_app`, and that order is the requirement rather than tidiness: the element is
        // still detached here, so its first render has not happened, and an app that branches on
        // the theme paints correctly the first time instead of painting unstyled and correcting
        // itself a frame later. Assigning `_app` first is what would put it in the DOM.
        this.#stampTheme(app);
        this._pending = false;
        this._app = app;
      } catch (error) {
        // Same guard on this path: a superseded attempt must not paint a failure over the app that
        // replaced it, and a timeout arriving after a swap is exactly that case.
        if (this.load !== load) return;
        // One log site for every failure above: a thrown loader, a resolution with no constructor
        // in it, a "constructor" that built something else, and the clock winning. They differ in
        // the `error`, never in what has to be said about them, and a diagnostic naming the app on
        // one path and not the others would teach the reader that an unattributed line means "some
        // other kind of failure". Kept in the register of the catalogue context's messages
        // (`<noun> "<alias>" <problem>. <remedy>.`), because this is the same audience reading the
        // same console: the package author whose app is the one that is broken.
        console.error(
          `[UmbraDesktop] ${this.#describeApp()} could not be loaded. Check the manifest's "element".`,
          error,
        );
        this._pending = false;
        this._failed = true;
      }
    }
    // `await host.mountComplete` should mean "the body is settled", not "the loader returned": the
    // element only enters the DOM on the update these assignments schedule. Outside the `try` by
    // design, and the one thing that can reject this promise: a throwing update is a bug in the
    // render above rather than a load failure, and calling it one would put a "this app could not
    // be loaded" message on screen for a bug in the host.
    await this.updateComplete;
  }

  /**
   * How this app is named in the load-failure diagnostic.
   *
   * "Registered app" is the noun the catalogue context already uses for a package's own app, so a
   * reader following one of its lines and one of these is reading about the same kind of thing.
   *
   * The no-alias arm is not defensive padding: `alias` is a public property on a shipped element,
   * so anything mounting this host by hand can leave it unset, and a message reading
   * `Registered app "undefined"` would send its reader looking for a manifest with that alias.
   * @returns The subject of the sentence, with the alias when there is one.
   */
  #describeApp(): string {
    return this.alias ? `Registered app "${this.alias}"` : 'A registered app';
  }

  /**
   * Hand the `element` value to `loadManifestElement`, keeping one leniency it does not have.
   *
   * Umbraco declines a loader that resolves to a bare constructor: for the function form it
   * requires the resolution to be an *object* carrying `element` or `default`, so
   * `async () => MyGame` yields `undefined`. That is a package author's forgotten
   * `export default`, and a whole app failing over it is out of proportion to the mistake, so it
   * is accepted here. Deliberate divergence, pinned by its own case in `app-host.element.test.ts`.
   *
   * Keeping it costs an observing wrapper rather than a second resolution pass. The loader is
   * wrapped so its resolved value can be read on the way past, and Umbraco still does the
   * resolving; if it returns nothing and what the loader actually produced was a constructor, that
   * is used. Wrapping rather than calling the loader a second time because a second call is a
   * second `import()` for the author to reason about, and because a loader with a side effect
   * would run it twice.
   *
   * Only the loader arm is wrapped. The other three (a path string, a module object, a
   * constructor) are passed through untouched, since there is nothing to observe: they are not
   * called, and Umbraco already accepts every shape they can be in.
   * @param load The manifest's `element` value.
   * @returns The element's constructor, or undefined when nothing in it was one.
   * @throws Whatever the loader or the dynamic import threw.
   */
  async #resolveConstructor(load: ElementLoaderProperty): Promise<ClassConstructor<HTMLElement> | undefined> {
    let resolved: unknown;
    const observed: ElementLoaderProperty = isElementLoaderFunction(load)
      ? () => load().then((value) => ((resolved = value), value))
      : load;
    const ctor = await loadManifestElement<HTMLElement>(observed);
    if (ctor) return ctor;
    // The leniency, and the only place `resolved` is read: a function here can only have come from
    // the loader resolving to one, since Umbraco would have returned a constructor for any shape
    // it recognised.
    return typeof resolved === 'function' ? (resolved as ClassConstructor<HTMLElement>) : undefined;
  }

  /**
   * Race a resolution against {@link UMBRADESKTOP_BODY_LOAD_TIMEOUT_MS}.
   *
   * A `Promise.race` rather than a `setTimeout` that flips the state directly, because the race
   * discards the loser: once the clock has won, the loader's own resolution has nothing left
   * awaiting it and so cannot overwrite the failure message it lost to. The timer is cleared when
   * the loader wins so a mounted app leaves nothing pending behind it.
   *
   * Wraps the whole resolution, not just the loader's own promise, because a module path string is
   * a network hop too and a package pointing at a file the server never returns must reach the same
   * message as a loader that hangs.
   * @param loading The resolution in flight.
   * @returns Whatever the resolution produced.
   * @typeParam T What the resolution produces.
   * @throws If the resolution itself rejects, or if it has not settled within the timeout.
   */
  async #raceTheClock<T>(loading: Promise<T>): Promise<T> {
    let timer = 0;
    try {
      return await Promise.race([
        loading,
        new Promise<never>((_resolve, reject) => {
          timer = window.setTimeout(
            () => reject(new Error(`loader did not settle within ${UMBRADESKTOP_BODY_LOAD_TIMEOUT_MS}ms`)),
            UMBRADESKTOP_BODY_LOAD_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      window.clearTimeout(timer);
    }
  }

  /**
   * One of three bodies: the failure message, the in-flight spinner, or the app itself.
   *
   * `uui-loader` is used unimported, as the iframe path in `window.element.ts` does: the element is
   * defined by the backoffice the desktop is running inside, and importing it here would pull a
   * second copy into this bundle.
   * @returns The body for the current state.
   */
  override render() {
    if (this._failed) {
      return html`<p style=${FAILURE_STYLE}>
        ${this.localize.termOrDefault(APP_LOAD_FAILED_TOKEN, APP_LOAD_FAILED_FALLBACK)}
      </p>`;
    }
    if (this._pending) return html`<div style=${PENDING_STYLE}><uui-loader></uui-loader></div>`;
    return html`${this._app ?? nothing}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-app-host': UmbraDesktopAppHostElement;
  }
}
