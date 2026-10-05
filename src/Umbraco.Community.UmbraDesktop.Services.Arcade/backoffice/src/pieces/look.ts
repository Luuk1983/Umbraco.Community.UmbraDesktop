import { css, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import type { CSSResult } from '@umbraco-cms/backoffice/external/lit';
import { ARCADE_COMPACT_BELOW_PX } from './constants.js';
import { ARCADE_DISPLAY_FONT } from './font.js';

/**
 * The faint grain on the felt, as Solitaire draws it: white fractal noise, alpha scaled down, as a
 * data URI so the package ships no image.
 */
const NOISE_SVG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>" +
  "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/>" +
  "<feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0'/></filter>" +
  "<rect width='100%' height='100%' filter='url(%23n)'/></svg>";

/**
 * The Arcade's colours, per theme (design P14). Custom properties on `:host`, so every Arcade
 * element includes this first and reads only `--arcade-*` after it.
 *
 * Unbranched values are the Umbraco look and the correct case; each theme block is a refinement on
 * top (`desktop-apps.md` §5), so a sixth theme gets the Umbraco look rather than nothing. A theme may
 * restyle, never remove: no block here hides anything.
 */
export const arcadeTheme = css`
  :host {
    --arcade-felt: radial-gradient(130% 90% at 50% -10%, #34489a 0%, #1d2a5c 45%, #111a40 80%, #0c1232 100%);
    --arcade-grain: 0.28;
    --arcade-text: #eef0ff;
    --arcade-soft: rgb(232 235 255 / 62%);
    --arcade-faint: rgb(232 235 255 / 38%);
    --arcade-glass: rgb(255 255 255 / 6.5%);
    --arcade-glass-strong: rgb(255 255 255 / 10%);
    --arcade-ring: rgb(255 255 255 / 11%);
    --arcade-edge: inset 0 0 0 1px var(--arcade-ring);
    --arcade-blur: blur(10px);
    --arcade-accent: #f5c1bc;
    --arcade-accent-deep: #e9958d;
    --arcade-on-accent: #1b264f;
    --arcade-mine: linear-gradient(100deg, rgb(245 193 188 / 22%), rgb(245 193 188 / 7%) 45%, rgb(255 255 255 / 16%) 52%, rgb(245 193 188 / 7%) 60%, rgb(245 193 188 / 12%));
    --arcade-mine-edge: inset 0 0 0 1px rgb(245 193 188 / 40%), 0 0 24px -6px rgb(245 193 188 / 45%);
    --arcade-gold: #ffe08a;
    --arcade-gold-deep: #e0a91e;
    --arcade-danger: #ff9aa5;
    --arcade-radius: 14px;
    --arcade-control-radius: 999px;
    --arcade-shadow: 0 24px 50px -12px rgb(0 0 0 / 65%), 0 0 0 1px rgb(255 255 255 / 12%);
    --arcade-scrim: rgb(15 20 50 / 38%);
    --arcade-display: '${unsafeCSS(ARCADE_DISPLAY_FONT)}', Georgia, serif;
    --arcade-body: var(--umbradesktop-app-font, inherit);
  }
  /* Tahoma is Verdana's narrow cut, from the same designer, so the theme still reads as Umbraco 4.
     Verdana itself, the theme's app font, wrapped "Play again", "Leaderboard ›" and the standing
     line in Minesweeper's 258px well and made the compact card scroll (measured in a real desktop).
     Where Tahoma is missing, the theme's own font follows and the card scrolls rather than spills. */
  :host([data-umbradesktop-theme='umbraco4']) {
    --arcade-body: Tahoma, var(--umbradesktop-app-font, inherit);
    --arcade-felt: radial-gradient(130% 90% at 50% -10%, #5a9a6e 0%, #356447 45%, #20402c 80%, #16301f 100%);
    --arcade-accent: #f8c38a;
    --arcade-accent-deep: #e39a4c;
    --arcade-on-accent: #2a1a05;
    --arcade-mine: linear-gradient(100deg, rgb(248 195 138 / 24%), rgb(248 195 138 / 8%));
    --arcade-mine-edge: inset 0 0 0 1px rgb(248 195 138 / 45%);
  }
  :host([data-umbradesktop-theme='macos']) {
    --arcade-felt: radial-gradient(130% 90% at 50% -10%, #5b5f68 0%, #3a3d44 45%, #26282d 80%, #1c1d21 100%);
    --arcade-accent: #8cc4ff;
    --arcade-accent-deep: #0a84ff;
    --arcade-on-accent: #04213f;
    --arcade-mine: linear-gradient(100deg, rgb(10 132 255 / 26%), rgb(10 132 255 / 10%));
    --arcade-mine-edge: inset 0 0 0 1px rgb(140 196 255 / 45%);
    --arcade-radius: 12px;
  }
  :host([data-umbradesktop-theme='win11']) {
    --arcade-felt: radial-gradient(130% 90% at 50% -10%, #2b4c7e 0%, #1a2f52 45%, #10203a 80%, #0b172b 100%);
    --arcade-accent: #99ebff;
    --arcade-accent-deep: #60cdff;
    --arcade-on-accent: #00283a;
    --arcade-mine: linear-gradient(100deg, rgb(96 205 255 / 22%), rgb(96 205 255 / 8%));
    --arcade-mine-edge: inset 0 0 0 1px rgb(96 205 255 / 45%);
    --arcade-radius: 8px;
    --arcade-control-radius: 4px;
  }
  :host([data-umbradesktop-theme='win98']) {
    --arcade-felt: #008080;
    --arcade-grain: 0;
    --arcade-text: #fff;
    --arcade-soft: #fff;
    --arcade-faint: #dfdfdf;
    --arcade-glass: #c0c0c0;
    --arcade-glass-strong: #c0c0c0;
    --arcade-edge: inset -1px -1px #000, inset 1px 1px #fff, inset -2px -2px #808080, inset 2px 2px #dfdfdf;
    --arcade-blur: none;
    /* White, not silver: the accent is the links' colour, and silver on the teal was 2.6:1 ("‹ All
       games" in the hub, measured in a real desktop). Panels set their own navy below. */
    --arcade-accent: #fff;
    --arcade-accent-deep: #808080;
    --arcade-on-accent: #000;
    --arcade-mine: #000080;
    --arcade-mine-edge: none;
    --arcade-gold: #ffd700;
    --arcade-gold-deep: #b8860b;
    --arcade-danger: #800000;
    --arcade-radius: 0;
    --arcade-control-radius: 0;
    --arcade-shadow: none;
    --arcade-scrim: transparent;
    --arcade-display: var(--umbradesktop-app-font, inherit);
  }
`;

/**
 * The shared pieces of the look: felt, glass, buttons, medals, rows, the podium, the pill. Class
 * names follow the mock, so the mock stays readable as the reference for each.
 *
 * Sentence case throughout, no letter-spaced capitals (the owner's rule; the mock's `.k`, `.lbl`,
 * `.ribbon` and "YOU" are deliberately not copied). Motion happens once and
 * `prefers-reduced-motion` removes it (P14).
 */
export const arcadeLook = css`
  :host { font-family: var(--arcade-body); }
  .felt { background: var(--arcade-felt); color: var(--arcade-text); position: relative; isolation: isolate; }
  .felt::before {
    content: ''; position: absolute; inset: 0; z-index: -1; pointer-events: none;
    opacity: var(--arcade-grain); mix-blend-mode: overlay; background-image: url("${unsafeCSS(NOISE_SVG)}");
  }
  .glass { background: var(--arcade-glass); box-shadow: var(--arcade-edge); border-radius: var(--arcade-radius); backdrop-filter: var(--arcade-blur); }
  .display { font-family: var(--arcade-display); }
  button { font: inherit; color: inherit; cursor: pointer; }
  button:focus-visible { outline: 2px solid var(--arcade-accent); outline-offset: 2px; }
  .btn {
    font-weight: 600; font-size: 13px; border: 0; border-radius: var(--arcade-control-radius); padding: 9px 18px;
    color: var(--arcade-on-accent); background: linear-gradient(180deg, color-mix(in srgb, var(--arcade-accent) 70%, white), var(--arcade-accent));
    box-shadow: 0 6px 18px -6px var(--arcade-accent), inset 0 1px 0 rgb(255 255 255 / 60%);
  }
  .btn.sm { padding: 6px 14px; font-size: 12px; }
  .btn.ghost { background: transparent; color: var(--arcade-text); box-shadow: inset 0 0 0 1.5px var(--arcade-soft); }
  .btn.danger { background: transparent; color: var(--arcade-danger); box-shadow: inset 0 0 0 1.5px var(--arcade-danger); }
  .btn:disabled { opacity: 0.6; cursor: default; }
  .link { background: none; border: 0; padding: 0; font-weight: 600; font-size: 12px; color: var(--arcade-accent); }
  .medal { width: 28px; height: 28px; border-radius: 50%; display: inline-grid; place-items: center; font-weight: 800; font-size: 12px; flex: none; }
  .medal.g { background: radial-gradient(circle at 35% 30%, #fff6cf, var(--arcade-gold) 35%, var(--arcade-gold-deep) 90%); color: #6b4700; }
  .medal.s { background: radial-gradient(circle at 35% 30%, #fff, #dfe3ee 40%, #98a1b9 95%); color: #3e465f; }
  .medal.b { background: radial-gradient(circle at 35% 30%, #ffe4cc, #e7a774 40%, #a8612b 95%); color: #5b2c07; }
  .medal.p { background: var(--arcade-glass-strong); color: var(--arcade-soft); box-shadow: var(--arcade-edge); }
  .crown { width: 16px; height: 16px; color: var(--arcade-gold); flex: none; }
  .ribbon {
    display: inline-flex; align-items: center; gap: 6px; font-weight: 800; font-size: 11px; white-space: nowrap;
    padding: 4px 10px; border-radius: var(--arcade-control-radius);
    background: linear-gradient(90deg, var(--arcade-gold), color-mix(in srgb, var(--arcade-gold) 80%, var(--arcade-gold-deep)), var(--arcade-gold));
    color: #1b264f;
  }
  .ribbon .crown { width: 12px; height: 12px; color: #1b264f; }
  ol { list-style: none; margin: 0; padding: 0; }
  .lr { display: flex; align-items: center; gap: 12px; padding: 9px 14px; border-radius: calc(var(--arcade-radius) - 2px); font-size: 14px; }
  .lr .name { flex: 1; display: flex; align-items: center; gap: 10px; min-width: 0; white-space: nowrap; }
  .lr .who { overflow: hidden; text-overflow: ellipsis; }
  .lr .sc { font-weight: 700; font-size: 15px; font-variant-numeric: tabular-nums; }
  .lr .dt { width: 64px; text-align: end; color: var(--arcade-faint); font-size: 12px; }
  .lr .only { color: var(--arcade-faint); font-size: 12px; }
  .lr.mine { background: var(--arcade-mine); box-shadow: var(--arcade-mine-edge); }
  .lr.ghost { background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--arcade-accent) 12%, transparent) 0 6px, transparent 6px 12px); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--arcade-accent) 55%, transparent); }
  .you { font-size: 11px; font-weight: 700; color: var(--arcade-accent); margin-inline-start: 4px; }
  .gap { text-align: center; color: var(--arcade-faint); letter-spacing: 0.4em; font-size: 12px; padding: 2px 0; }
  .av { width: 30px; height: 30px; border-radius: 50%; display: inline-grid; place-items: center; font-weight: 700; font-size: 11px; color: #fff; flex: none; background: linear-gradient(135deg, #6b7cff, #3544b1); }
  .av.a1 { background: linear-gradient(135deg, #ff8fa6, #c0516b); }
  .av.a2 { background: linear-gradient(135deg, #6fe0b8, #2e8a6e); }
  .av.a3 { background: linear-gradient(135deg, #ffcf70, #b07a1c); }
  .av.a4 { background: linear-gradient(135deg, #b49bff, #6a4bc4); }
  .av.self { box-shadow: 0 0 0 2px var(--arcade-on-accent), 0 0 0 4px var(--arcade-accent); }
  .seg { display: inline-flex; padding: 4px; border-radius: var(--arcade-control-radius); background: rgb(0 0 0 / 25%); box-shadow: var(--arcade-edge); }
  .seg button { border: 0; background: none; font-weight: 600; font-size: 13px; padding: 6px 18px; border-radius: var(--arcade-control-radius); color: var(--arcade-soft); }
  .seg button[aria-selected='true'] { background: #fff; color: #1b264f; box-shadow: 0 4px 12px -4px rgb(0 0 0 / 50%); }
  .podium { display: grid; grid-template-columns: 1fr 1fr 1fr; align-items: end; gap: 12px; }
  .pod { display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 0; }
  .pod .pn { font-weight: 600; font-size: 13px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pod .ps { font-weight: 700; font-size: 17px; font-variant-numeric: tabular-nums; }
  .pod.mine .pn { color: var(--arcade-accent); }
  /* A hidden viewer on the podium: faded, with the ghost row's edge on their step, and the line saying so. */
  .pod .only { color: var(--arcade-faint); font-size: 11px; white-space: nowrap; }
  .pod.ghost .av { opacity: 0.6; }
  .pod.ghost .step { box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--arcade-accent) 55%, transparent); }
  .step { width: 100%; border-radius: 12px 12px 4px 4px; display: grid; place-items: start center; padding-top: 8px; font-family: var(--arcade-display); font-weight: 700; font-size: 20px; }
  .step.s1 { height: 54px; color: var(--arcade-gold); background: linear-gradient(180deg, color-mix(in srgb, var(--arcade-gold) 45%, transparent), color-mix(in srgb, var(--arcade-gold) 8%, transparent)); }
  .step.s2 { height: 40px; color: #dfe3ee; background: linear-gradient(180deg, rgb(223 227 238 / 32%), rgb(223 227 238 / 5%)); }
  .step.s3 { height: 30px; color: #e7a774; background: linear-gradient(180deg, rgb(231 167 116 / 35%), rgb(231 167 116 / 5%)); }
  /* Windows 98: the panels are silver bevels with black text, as that system's dialogs were. */
  :host([data-umbradesktop-theme='win98']) .glass,
  :host([data-umbradesktop-theme='win98']) .surface {
    background: #c0c0c0; box-shadow: var(--arcade-edge);
    --arcade-text: #000; --arcade-soft: #202020; --arcade-faint: #505050; --arcade-accent: #000080;
    color: #000;
  }
  /* The player's own row is navy, which is also the panels' accent, so the accent turns white there:
     otherwise its "You" and its avatar ring would be navy on navy. */
  :host([data-umbradesktop-theme='win98']) .lr.mine { color: #fff; --arcade-soft: #fff; --arcade-faint: #dfdfdf; --arcade-accent: #fff; }
  /* Buttons are silver bevels with black text, as that system's were. The accent gradient the other
     themes use turns navy inside a panel, and drew black text on navy ("Play again", "Save"), measured
     unreadable in a real desktop. The bevel inverts while pressed. */
  :host([data-umbradesktop-theme='win98']) .btn {
    background: #c0c0c0; color: #000;
    box-shadow: inset -1px -1px #000, inset 1px 1px #fff, inset -2px -2px #808080, inset 2px 2px #dfdfdf;
  }
  :host([data-umbradesktop-theme='win98']) .btn.danger { color: #800000; }
  /* The hub's profile button is silver like a button but sits on the felt, so it inherited the felt's
     white: "UmbraDesktop Admin" white on silver, measured unreadable in a real desktop. */
  :host([data-umbradesktop-theme='win98']) .me { color: #000; }
  :host([data-umbradesktop-theme='win98']) .btn:active:not(:disabled) {
    box-shadow: inset 1px 1px #000, inset -1px -1px #fff, inset 2px 2px #808080, inset -2px -2px #dfdfdf;
  }
  /* The podium's steps are solid bevelled blocks with black numbers: the faint gradients and light
     numbers vanished on a panel's silver (the game's leaderboard panel), measured in a real desktop.
     The number is centred between equal 2px paddings, clear of the 2px bevel: the panel's 18px third
     step put its number across the bottom edge with the usual top padding. */
  :host([data-umbradesktop-theme='win98']) .step {
    border-radius: 0; color: #000; padding: 2px 0; place-items: center; line-height: 1;
    box-shadow: inset -1px -1px #000, inset 1px 1px #fff, inset -2px -2px #808080, inset 2px 2px #dfdfdf;
  }
  :host([data-umbradesktop-theme='win98']) .step.s1 { background: #ffd700; }
  :host([data-umbradesktop-theme='win98']) .step.s2 { background: #dfdfdf; }
  :host([data-umbradesktop-theme='win98']) .step.s3 { background: #e0a060; }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; }
  }
`;

/**
 * A piece's compact rules, applied in both cases design P10 names: a box narrower than
 * {@link ARCADE_COMPACT_BELOW_PX}, and the `compact` attribute. The rules are written once, as a
 * function of a selector prefix, and emitted twice: inside the container query with no prefix, and
 * under `:host([compact])`. The host must be the query container (`container-type: inline-size`).
 * @param rulesFor Writes the compact rules, each selector starting with the prefix it is given.
 * @returns The stylesheet.
 */
export function compactStyles(rulesFor: (scope: string) => string): CSSResult {
  return unsafeCSS(`@container (width < ${ARCADE_COMPACT_BELOW_PX}px) { ${rulesFor('')} }\n${rulesFor(':host([compact])')}`);
}
