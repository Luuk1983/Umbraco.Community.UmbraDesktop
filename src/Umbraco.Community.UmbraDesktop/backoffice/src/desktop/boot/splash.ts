import { UMBRADESKTOP_SPLASH_TIMEOUT_MS } from './constants';

/**
 * The boot splash: one opaque cover, up before anything else can paint and down when the desktop
 * is ready.
 *
 * Not a Lit element, and not in the desktop's shadow DOM. It has to go up during the bundle
 * module's own evaluation, which is the earliest moment this package owns — the bundle is imported
 * by `UmbBundleExtensionInitializer` during the backoffice route guard, before
 * `backoffice.element.js` is imported at all. At that point nothing about the custom element
 * registry, the icon registry or any Umbraco context can be relied on, so this is
 * `document.createElement` and inline style and nothing more.
 *
 * Theme-neutral on purpose. The user's theme is one of the things the splash is waiting for the
 * settings context to read, so a themed splash could not paint until the moment it is no longer
 * needed.
 */

/** Id of the splash element, so raising is idempotent and lowering can always find it. */
export const UMBRADESKTOP_SPLASH_ELEMENT_ID = 'umbradesktop-boot-splash';

/**
 * Handle of the armed lift timeout.
 *
 * Module-level rather than kept on the element, so that lowering always disarms it: without this a
 * splash raised again shortly after one was lowered would be lifted by the older splash's timer.
 */
let liftTimeout: number | undefined;

/**
 * The Umbraco mark, inlined.
 *
 * The desktop's own watermark uses `<umb-icon name="icon-umbraco">` and this deliberately does not:
 * `umb-icon` resolves through the icon registry, which fetches its dictionary, and a splash that
 * waits on a network request is not a splash. `umb-app-logo` is worse for the same reason — it
 * renders nothing until `UMB_SERVER_CONTEXT` arrives and then loads the logo from the management
 * API. Copied from core's `icon-umbraco` with `fill="currentColor"` intact, so the colour comes
 * from the splash's own text colour and nowhere else.
 */
const UMBRACO_MARK = `<svg class="mark" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 315.89 315.89" aria-hidden="true"><path d="M0 157.74a157.95 157.95 0 1 1 158 158.15A157.95 157.95 0 0 1 0 157.74m154.74 54.09a155.4 155.4 0 0 1-36.5-3.29 27.92 27.92 0 0 1-19.94-16q-5.35-12.34-5.21-38.1a243 243 0 0 1 1.69-26.84q1.55-13 3.09-21.46l1.07-5.59a2 2 0 0 0 0-.49 3.2 3.2 0 0 0-2.65-3.17l-20.37-3.22h-.44a3.19 3.19 0 0 0-3.11 2.48c-.35 1.31-.56 2.27-1.17 5.38-1.16 6-2.24 11.85-3.43 20.38a264 264 0 0 0-2.3 27.94 145 145 0 0 0 0 19.57q.72 25.94 8.9 41.42t27.72 22.3q19.53 6.81 54.43 6.66h2.91q34.94.15 54.41-6.66t27.71-22.3q8.17-15.53 8.91-41.42a145 145 0 0 0 0-19.57 267 267 0 0 0-2.3-27.94c-1.2-8.44-2.27-14.26-3.44-20.38-.61-3.11-.81-4.07-1.16-5.38a3.21 3.21 0 0 0-3.12-2.48h-.52l-20.38 3.18a3.2 3.2 0 0 0-2.68 3.17 4 4 0 0 0 0 .49l1.08 5.59q1.55 8.48 3.12 21.46a246 246 0 0 1 1.65 26.84q.27 25.69-5.21 38.07a27.9 27.9 0 0 1-19.76 16.07 155.2 155.2 0 0 1-36.48 3.29Z"/></svg>`;

/**
 * The splash's own layout, as a `style` attribute so it depends on no stylesheet, no design token
 * and no custom element being defined yet. The colour is Umbraco's header blue, which is what the
 * backoffice paints its own chrome with.
 */
const SPLASH_STYLE = [
  'position:fixed',
  'inset:0',
  // Above everything in the document. It still cannot cover an open core modal, which lives in the
  // top layer via dialog.showModal() and beats any z-index — nothing is open during boot, so this
  // only matters if the splash is ever reused elsewhere.
  'z-index:2147483647',
  'display:flex',
  'align-items:center',
  'justify-content:center',
  'background:#1b264f',
  'color:#fff',
].join(';');

/**
 * The animation and mark sizing, scoped to the splash's id.
 *
 * A `<style>` inside the element rather than more inline style, because a keyframe animation and a
 * reduced-motion query cannot be expressed in a `style` attribute. It leaves with the element.
 */
const SPLASH_CSS = `
  #${UMBRADESKTOP_SPLASH_ELEMENT_ID} .stack {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  #${UMBRADESKTOP_SPLASH_ELEMENT_ID} .mark {
    width: 96px;
    height: 96px;
  }
  #${UMBRADESKTOP_SPLASH_ELEMENT_ID} .pulse {
    margin-top: 24px;
    width: 120px;
    height: 3px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.2);
    overflow: hidden;
  }
  #${UMBRADESKTOP_SPLASH_ELEMENT_ID} .pulse::after {
    content: '';
    display: block;
    width: 40%;
    height: 100%;
    border-radius: 2px;
    background: #fff;
    animation: umbradesktop-splash-slide 1.1s ease-in-out infinite;
  }
  @keyframes umbradesktop-splash-slide {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(350%); }
  }
  @media (prefers-reduced-motion: reduce) {
    #${UMBRADESKTOP_SPLASH_ELEMENT_ID} .pulse { display: none; }
  }
`;

/**
 * Put the splash up over everything, unless it is already up.
 *
 * `aria-hidden` on the splash rather than anything on the app: the boot is a visual concern, and
 * hiding the application from assistive technology while it loads would be a worse trade than a
 * cover a screen reader simply ignores.
 * @param doc The document to attach to. Defaults to the current document.
 * @param timeoutMs How long before it lifts regardless. Defaults to {@link UMBRADESKTOP_SPLASH_TIMEOUT_MS}.
 */
export function raiseBootSplash(doc: Document = document, timeoutMs = UMBRADESKTOP_SPLASH_TIMEOUT_MS): void {
  if (doc.getElementById(UMBRADESKTOP_SPLASH_ELEMENT_ID)) return;

  const splash = doc.createElement('div');
  splash.id = UMBRADESKTOP_SPLASH_ELEMENT_ID;
  splash.setAttribute('aria-hidden', 'true');
  splash.setAttribute('style', SPLASH_STYLE);
  splash.innerHTML = `<style>${SPLASH_CSS}</style><div class="stack">${UMBRACO_MARK}<div class="pulse"></div></div>`;
  doc.body.appendChild(splash);

  liftTimeout = window.setTimeout(() => lowerBootSplash(doc), timeoutMs);
}

/**
 * Take the splash down, and disarm its lift timeout.
 * @param doc The document to remove from. Defaults to the current document.
 */
export function lowerBootSplash(doc: Document = document): void {
  if (liftTimeout !== undefined) {
    window.clearTimeout(liftTimeout);
    liftTimeout = undefined;
  }
  doc.getElementById(UMBRADESKTOP_SPLASH_ELEMENT_ID)?.remove();
}

/**
 * Whether a splash is currently up.
 * @param doc The document to check. Defaults to the current document.
 * @returns True when the splash is in the document.
 */
export function isBootSplashRaised(doc: Document = document): boolean {
  return !!doc.getElementById(UMBRADESKTOP_SPLASH_ELEMENT_ID);
}
