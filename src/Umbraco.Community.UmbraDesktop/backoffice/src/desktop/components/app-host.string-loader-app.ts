/**
 * A real, separately-loadable app module, existing only so `app-host.element.test.ts` can exercise
 * the one form of `element` a static `umbraco-package.json` can express: a module **path string**.
 *
 * A fixture in a file of its own rather than an object inside the test, because the string form is
 * the case our pipeline used to drop silently, and the thing that has to be proven is that a path
 * gets imported and its export constructed. A stub for `loadManifestElement` would only prove our
 * wiring against our own guess at what Umbraco does with a string, and that guess is precisely what
 * was wrong. So the test hands the host a URL that the test runner really serves, and a real
 * dynamic import really fetches this file.
 *
 * Shaped like a package author's entry module: it registers its own custom element as a side effect
 * and names the constructor `element`, which is one of the two exports Umbraco's resolver looks for
 * (`default` is the other, covered on the function path). Nothing imports this statically, so it
 * stays out of the shipped bundle; `tsc` still type-checks it, which is the point of it being real.
 */

/** The app this module publishes. Trivial on purpose: mounting it at all is the assertion. */
class StringLoadedAppElement extends HTMLElement {
  /** Marks itself mounted so the test can see the import actually produced an element. */
  connectedCallback() {
    this.textContent = 'string-loaded app ready';
  }
}

customElements.define('umbradesktop-test-string-app', StringLoadedAppElement);

/** The named export Umbraco's element resolver prefers, as a package's own module would carry it. */
export const element = StringLoadedAppElement;
