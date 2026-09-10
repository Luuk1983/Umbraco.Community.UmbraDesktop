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
 * The name on the boot screen: the package's own.
 *
 * It said UmbracOS for a while, which is a better joke and was built, looked at and then dropped.
 * The boot screen is the first thing a user meets, and introducing the product there by a name that
 * appears nowhere else — not the package, not the marketplace listing, not the docs — buys a smile
 * at the cost of a moment's "wait, what did I install?". The desktop earns the operating-system
 * feeling by behaving like one; the splash does not need to claim it in words.
 *
 * Not localized: it is a product name, like Umbraco itself.
 */
export const UMBRADESKTOP_SPLASH_WORDMARK = 'UmbraDesktop';

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
 * and no custom element being defined yet.
 *
 * Two centred layers rather than one corner gradient, chosen by eye against six alternatives. The
 * first lifts the middle very slightly, so the screen points at the mark you are waiting for; the
 * second settles the corners. Splitting it in two is what keeps it subtle — a single centred
 * gradient strong enough to notice read as a spotlight, and the same colours divided between a lift
 * and a vignette do the same job without any part of the screen looking lit.
 *
 * The colours are the ones the desktop already uses (`#0b1024` ground, `#26386f` highlight), written
 * as literals rather than read from the theme tokens that hold them. That is the splash's defining
 * property: it depends on nothing, so there is nothing for it to wait on and nothing that can make
 * it fail. `background-color` first, so a browser that cannot parse the gradients still paints
 * something opaque rather than letting the page show through.
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
  'background-color:#0b1024',
  'background-image:' +
    'radial-gradient(60% 72% at 50% 46%, rgba(38, 56, 111, 0.3) 0%, transparent 70%),' +
    'radial-gradient(80% 90% at 50% 48%, transparent 38%, rgba(3, 5, 14, 0.7) 100%)',
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
    /* Only the contents fade in, never the backdrop: the backdrop's whole job is to be opaque from
       the first frame, and fading that would show the page it is there to hide. */
    animation: umbradesktop-splash-in 220ms ease-out both;
  }
  /* The mark and the ring occupy the same box, so progress happens around the logo rather than
     under it: one object doing both jobs, which is the shape a booting machine has. */
  #${UMBRADESKTOP_SPLASH_ELEMENT_ID} .ringwrap {
    position: relative;
    width: 150px;
    height: 150px;
    display: grid;
    place-items: center;
  }
  #${UMBRADESKTOP_SPLASH_ELEMENT_ID} .ring {
    position: absolute;
    inset: 0;
    width: 150px;
    height: 150px;
  }
  #${UMBRADESKTOP_SPLASH_ELEMENT_ID} .track {
    fill: none;
    stroke: rgba(255, 255, 255, 0.14);
    stroke-width: 2;
  }
  #${UMBRADESKTOP_SPLASH_ELEMENT_ID} .arc {
    fill: none;
    stroke: rgba(255, 255, 255, 0.92);
    stroke-width: 2;
    stroke-linecap: round;
    /* A quarter of the circumference, near enough: 2πr with r=58 is about 364, and 90 of that reads
       as an arc rather than as a dot or a nearly-closed ring. The gap value only has to exceed the
       remainder, so it is not a number anything else depends on. */
    stroke-dasharray: 90 360;
    transform-origin: 75px 75px;
    animation: umbradesktop-splash-spin 1.15s linear infinite;
  }
  #${UMBRADESKTOP_SPLASH_ELEMENT_ID} .mark {
    width: 72px;
    height: 72px;
    /* Lifts the mark off a dark ground the way an OS boot logo sits above its background. */
    filter: drop-shadow(0 8px 24px rgba(0, 0, 0, 0.45));
  }
  #${UMBRADESKTOP_SPLASH_ELEMENT_ID} .wordmark {
    margin-top: 26px;
    /* System stack, and no webfont: this paints before anything can promise a font is loaded, and
       one arriving late would reflow the wordmark mid-boot. */
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 30px;
    font-weight: 600;
    letter-spacing: 0.06em;
    line-height: 1;
    color: rgba(255, 255, 255, 0.96);
  }
  @keyframes umbradesktop-splash-spin {
    to { transform: rotate(360deg); }
  }
  @keyframes umbradesktop-splash-in {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    /* The arc goes and the track stays. A stopped arc would sit there as a fragment of a circle,
       reading as progress that has stalled; the full ring reads as an ornament around the mark,
       which says nothing rather than something wrong. */
    #${UMBRADESKTOP_SPLASH_ELEMENT_ID} .arc { display: none; }
    #${UMBRADESKTOP_SPLASH_ELEMENT_ID} .stack { animation: none; }
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
  splash.innerHTML =
    `<style>${SPLASH_CSS}</style>` +
    '<div class="stack">' +
    '<div class="ringwrap">' +
    '<svg class="ring" viewBox="0 0 150 150" aria-hidden="true">' +
    '<circle class="track" cx="75" cy="75" r="58" />' +
    '<circle class="arc" cx="75" cy="75" r="58" />' +
    '</svg>' +
    UMBRACO_MARK +
    '</div>' +
    `<div class="wordmark">${UMBRADESKTOP_SPLASH_WORDMARK}</div>` +
    '</div>';
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
