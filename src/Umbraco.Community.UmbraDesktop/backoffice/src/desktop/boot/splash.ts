import { UMBRADESKTOP_SPLASH_TIMEOUT_MS } from './constants';
import {
  UMBRADESKTOP_MARK_PATH,
  UMBRADESKTOP_MARK_VIEWBOX,
  UMBRADESKTOP_RING_DASHARRAY,
  UMBRADESKTOP_RING_RADIUS,
  UMBRADESKTOP_RING_SPIN_MS,
  UMBRADESKTOP_RING_VIEWBOX,
  UMBRADESKTOP_SPLASH_RING_SIZE,
  ringMarkSize,
  ringStrokeWidth,
} from '../loader-ring';

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
 * API. The path comes from `../loader-ring`, which the window loader draws from too; `fill` is
 * `currentColor` so the colour comes from the splash's own text colour and nowhere else.
 */
const UMBRACO_MARK = `<svg class="mark" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="${UMBRADESKTOP_MARK_VIEWBOX}" aria-hidden="true"><path d="${UMBRADESKTOP_MARK_PATH}"/></svg>`;

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
     under it: one object doing both jobs, which is the shape a booting machine has. Every number
     below comes from '../loader-ring', which the in-window loader draws from as well — see that
     module for why a second, smaller copy of these literals was not the answer. */
  #${UMBRADESKTOP_SPLASH_ELEMENT_ID} .ringwrap {
    position: relative;
    width: ${UMBRADESKTOP_SPLASH_RING_SIZE}px;
    height: ${UMBRADESKTOP_SPLASH_RING_SIZE}px;
    display: grid;
    place-items: center;
  }
  #${UMBRADESKTOP_SPLASH_ELEMENT_ID} .ring {
    position: absolute;
    inset: 0;
    width: ${UMBRADESKTOP_SPLASH_RING_SIZE}px;
    height: ${UMBRADESKTOP_SPLASH_RING_SIZE}px;
  }
  #${UMBRADESKTOP_SPLASH_ELEMENT_ID} .track {
    fill: none;
    stroke: rgba(255, 255, 255, 0.14);
    stroke-width: ${ringStrokeWidth(UMBRADESKTOP_SPLASH_RING_SIZE)};
  }
  #${UMBRADESKTOP_SPLASH_ELEMENT_ID} .arc {
    fill: none;
    stroke: rgba(255, 255, 255, 0.92);
    stroke-width: ${ringStrokeWidth(UMBRADESKTOP_SPLASH_RING_SIZE)};
    stroke-linecap: round;
    stroke-dasharray: ${UMBRADESKTOP_RING_DASHARRAY};
    transform-origin: ${UMBRADESKTOP_RING_VIEWBOX / 2}px ${UMBRADESKTOP_RING_VIEWBOX / 2}px;
    animation: umbradesktop-splash-spin ${UMBRADESKTOP_RING_SPIN_MS}ms linear infinite;
  }
  #${UMBRADESKTOP_SPLASH_ELEMENT_ID} .mark {
    width: ${ringMarkSize(UMBRADESKTOP_SPLASH_RING_SIZE)}px;
    height: ${ringMarkSize(UMBRADESKTOP_SPLASH_RING_SIZE)}px;
    /* Lifts the mark off a dark ground the way an OS boot logo sits above its background. The
       in-window loader has no equivalent: it sits on the window's own body colour, which is not
       reliably dark, and a drop shadow under a 30px mark on a white ground reads as a smudge. */
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
    `<svg class="ring" viewBox="0 0 ${UMBRADESKTOP_RING_VIEWBOX} ${UMBRADESKTOP_RING_VIEWBOX}" aria-hidden="true">` +
    `<circle class="track" cx="${UMBRADESKTOP_RING_VIEWBOX / 2}" cy="${UMBRADESKTOP_RING_VIEWBOX / 2}" r="${UMBRADESKTOP_RING_RADIUS}" />` +
    `<circle class="arc" cx="${UMBRADESKTOP_RING_VIEWBOX / 2}" cy="${UMBRADESKTOP_RING_VIEWBOX / 2}" r="${UMBRADESKTOP_RING_RADIUS}" />` +
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
