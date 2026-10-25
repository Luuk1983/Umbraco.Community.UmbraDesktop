import { css, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { OPTIMIZE_PADDING, ROW_THUMBNAIL, SETTING_INDENT, SETTING_LABEL_WIDTH, STRIP_THUMBNAIL, SWITCH_GAP, SWITCH_TRACK } from './constants.js';

/** The padding, as CSS. */
const PAD = unsafeCSS(`${OPTIMIZE_PADDING}px`);

/** How far a switch's settings and explanation are indented, as CSS. */
const INDENT = unsafeCSS(`${SETTING_INDENT}px`);

/**
 * The Optimize images window's own look, on top of the file menu's shared base (`file-menu/styles.ts`):
 * painted with the desktop's app tokens, each with the backoffice's colour as its fallback, surfaces as
 * `background:` and never `background-color:`. No theme branch changes a size here, since the window's
 * size is one number for every theme (`desktop-apps.md` §8).
 */
export const optimizeWindowStyles = css`
  :host {
    display: block;
    height: 100%;
    overflow: hidden;
  }

  .preparing {
    padding: ${PAD};
  }

  .page {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .head {
    padding: 20px ${PAD} 14px;
    border-bottom: 1px solid var(--umbradesktop-app-border, var(--uui-color-divider, var(--uui-color-border)));
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .heading {
    font-size: 18px;
  }

  /* The introduction: where from, how many, the pictures, what is left out (mock R5). */
  .intro {
    padding: 16px ${PAD} 14px;
    display: grid;
    gap: 8px;
    background: var(--umbradesktop-app-surface-sunken, var(--uui-color-background));
    border-bottom: 1px solid var(--umbradesktop-app-border, var(--uui-color-divider, var(--uui-color-border)));
  }

  .from {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-size: 13px;
    color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
  }

  .from span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .strip {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .strip .thumb {
    flex: none;
    width: ${STRIP_THUMBNAIL.w}px;
    height: ${STRIP_THUMBNAIL.h}px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: 3px;
    background: var(--umbradesktop-app-surface, var(--uui-color-surface));
    box-shadow: 0 0 0 1px var(--umbradesktop-app-border, var(--uui-color-border));
    color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
  }

  .strip img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .strip .more {
    font-size: 13px;
    color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
  }

  .skips {
    font-size: 13px;
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  /* What to do, and Where the result goes: two parts with a line between (owner, 2026-10-25). */
  .part {
    padding: 8px 0 12px;
  }

  .part + .part {
    border-top: 1px solid var(--umbradesktop-app-border, var(--uui-color-divider, var(--uui-color-border)));
  }

  .part h3 {
    margin: 0;
    padding: 10px ${PAD} 6px;
    font-size: 13px;
    font-weight: 700;
    color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
  }

  .group {
    padding: 2px 0;
  }

  .group-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 16px 6px ${PAD};
  }

  /* A switch: a track and a knob, in the accent when on, drawn and greyed when locked. */
  .switch {
    flex: 1;
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: ${SWITCH_GAP}px;
    padding: 2px 0;
    font: inherit;
    font-size: 14.5px;
    font-weight: 700;
    color: inherit;
    text-align: left;
    background: none;
    border: none;
    cursor: pointer;
  }

  .group:not([on]) .switch-label {
    color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
  }

  .switch:disabled {
    cursor: default;
  }

  .switch:focus-visible,
  .info:focus-visible,
  .radio:focus-visible,
  .link:focus-visible {
    outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
    outline-offset: 2px;
  }

  .track {
    position: relative;
    flex: none;
    width: ${SWITCH_TRACK.w}px;
    height: ${SWITCH_TRACK.h}px;
    border-radius: ${SWITCH_TRACK.h / 2}px;
    background: var(--umbradesktop-app-surface-sunken, var(--uui-color-border));
    box-shadow: inset 0 0 0 1px var(--umbradesktop-app-border, var(--uui-color-border-emphasis));
  }

  .knob {
    position: absolute;
    left: 3px;
    top: 3px;
    width: ${SWITCH_TRACK.h - 6}px;
    height: ${SWITCH_TRACK.h - 6}px;
    border-radius: 50%;
    background: var(--umbradesktop-app-surface, var(--uui-color-surface));
    box-shadow: 0 0 0 1px var(--umbradesktop-app-border, var(--uui-color-border-emphasis));
  }

  .switch[aria-checked='true'] .track {
    background: var(--umbradesktop-app-accent, var(--uui-color-selected));
  }

  .switch[aria-checked='true'] .knob {
    left: ${SWITCH_TRACK.w - SWITCH_TRACK.h + 3}px;
  }

  .switch:disabled .track {
    opacity: 0.5;
  }

  /* The info button: Umbraco's icon-info, which opens the explanation under its row (owner, 2026-10-25). */
  .info {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    font-size: 18px;
    color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
    background: none;
    border: none;
    border-radius: 50%;
    cursor: pointer;
  }

  .info[aria-expanded='true'] {
    color: var(--umbradesktop-app-accent, var(--uui-color-selected));
    background: var(--umbradesktop-app-surface-sunken, var(--uui-color-background));
  }

  .explain {
    margin: 0 16px 6px calc(${PAD} + ${INDENT});
    padding: 8px 10px;
    font-size: 13px;
    color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
    background: var(--umbradesktop-app-surface-sunken, var(--uui-color-background));
    border-radius: var(--umbradesktop-app-radius, 3px);
  }

  /* A switch's settings, one per line, labels in one column across every group. */
  .fields {
    display: grid;
    gap: 8px;
    padding: 2px 16px 8px calc(${PAD} + ${INDENT});
  }

  .field {
    display: grid;
    grid-template-columns: ${SETTING_LABEL_WIDTH}px 1fr;
    align-items: center;
    gap: 12px;
  }

  .key {
    font-size: 13.5px;
  }

  .value {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  input[type='number'] {
    width: 96px;
    min-height: 32px;
    padding: 0 8px;
    font: inherit;
    color: var(--umbradesktop-app-text, var(--uui-color-text));
    background: var(--umbradesktop-app-surface-sunken, var(--uui-color-background));
    border: none;
    box-shadow: 0 0 0 1px var(--umbradesktop-app-border, var(--uui-color-text-alt));
    border-radius: var(--umbradesktop-app-radius, 3px);
  }

  input[name='qualityNumber'] {
    width: 64px;
  }

  input[type='range'] {
    flex: 1;
    min-width: 120px;
    max-width: 260px;
    accent-color: var(--umbradesktop-app-accent, var(--uui-color-selected));
  }

  input:disabled {
    opacity: 0.45;
  }

  .formats {
    gap: 6px;
  }

  .choice {
    min-height: 32px;
    padding: 4px 12px;
    font: inherit;
    font-size: 13px;
    color: var(--umbradesktop-app-text, var(--uui-color-text));
    background: var(--umbradesktop-app-surface-raised, var(--uui-color-surface-emphasis));
    border: var(--umbradesktop-app-edge-width, 1px) solid var(--umbradesktop-app-edge-dark, var(--uui-color-border));
    border-radius: var(--umbradesktop-app-radius, 3px);
    cursor: pointer;
  }

  .choice[aria-pressed='true'] {
    background: var(--umbradesktop-app-accent, var(--uui-color-selected));
    color: var(--umbradesktop-app-accent-text, var(--uui-color-surface));
  }

  .choice:focus-visible {
    outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
    outline-offset: 1px;
  }

  /* The notes: Umbraco's info icon for a note, its alert icon and the warning colour for a warning. */
  .grow,
  .usage {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 6px 16px 2px ${PAD};
    padding: 8px 10px;
    font-size: 13px;
    border-radius: var(--umbradesktop-app-radius, 3px);
  }

  .grow umb-icon,
  .usage umb-icon {
    flex: none;
    margin-top: 1px;
  }

  /* UUI pairs its colours so: the plain one fills, the standalone one is text and icons on a surface.
     A tint of the fill on the window's surface reads in light and dark alike (found in the real run). */
  .grow {
    background: color-mix(in srgb, var(--uui-color-warning, #fbd142) 22%, var(--umbradesktop-app-surface, var(--uui-color-surface, #fff)));
    color: var(--umbradesktop-app-text, var(--uui-color-text));
  }

  .grow umb-icon {
    color: var(--uui-color-warning-standalone, #a17700);
  }

  .usage {
    margin: 6px 0 0;
    background: var(--umbradesktop-app-surface-sunken, var(--uui-color-background));
  }

  .usage umb-icon {
    color: var(--umbradesktop-app-accent, var(--uui-color-selected));
  }

  .link {
    padding: 0;
    font: inherit;
    font-weight: 700;
    color: var(--umbradesktop-app-accent, var(--uui-color-selected));
    text-decoration: underline;
    background: none;
    border: none;
    cursor: pointer;
  }

  /* Where the result goes: a radio list (owner, 2026-10-25). */
  .choice-row {
    padding: 4px 16px 4px ${PAD};
  }

  .radio {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 4px 0;
    font: inherit;
    color: inherit;
    text-align: left;
    background: none;
    border: none;
    cursor: pointer;
  }

  .radio .dot {
    flex: none;
    width: 18px;
    height: 18px;
    margin-top: 1px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 2px var(--umbradesktop-app-border, var(--uui-color-border-emphasis));
  }

  .radio[aria-checked='true'] .dot {
    box-shadow: inset 0 0 0 5px var(--umbradesktop-app-accent, var(--uui-color-selected));
  }

  .radio-text {
    display: flex;
    flex-direction: column;
  }

  .radio-text small {
    font-size: 13px;
  }

  .foot {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 14px ${PAD};
    border-top: 1px solid var(--umbradesktop-app-border, var(--uui-color-divider, var(--uui-color-border)));
  }

  /* How an ended run went: a mark and a line in its tone, in place of the bar (owner, 2026-10-25). */
  .result {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    font-size: 18px;
  }

  .result[data-tone='saved'] {
    color: var(--uui-color-positive, #26793e);
    background: color-mix(in srgb, var(--uui-color-positive, #26793e) 14%, var(--umbradesktop-app-surface, var(--uui-color-surface, #fff)));
  }

  .result[data-tone='grew'] {
    color: var(--uui-color-warning-standalone, #a17700);
    background: color-mix(in srgb, var(--uui-color-warning, #fbd142) 30%, var(--umbradesktop-app-surface, var(--uui-color-surface, #fff)));
  }

  .result[data-tone='failed'] {
    color: var(--uui-color-danger, #8a2944);
    background: color-mix(in srgb, var(--uui-color-danger, #8a2944) 14%, var(--umbradesktop-app-surface, var(--uui-color-surface, #fff)));
  }

  .result[data-tone='cancelled'] {
    color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
    background: var(--umbradesktop-app-surface-sunken, var(--uui-color-background));
  }

  .meta[data-tone] {
    margin-top: 10px;
  }

  .meta[data-tone='saved'] b {
    color: var(--uui-color-positive);
  }

  .meta[data-tone='grew'] b {
    color: var(--uui-color-warning-standalone, #a17700);
  }

  .meta[data-tone='failed'] b {
    color: var(--uui-color-danger);
  }

  /* The run. */
  .run {
    padding: 18px 20px 0;
  }

  .run-head {
    padding: 0;
    border: none;
    flex-direction: row;
    align-items: center;
    gap: 10px;
  }

  .run-head .heading {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
  }

  .actions .button {
    min-height: 34px;
  }

  .bar {
    height: 6px;
    margin: 12px 0 8px;
    border-radius: 3px;
    background: var(--umbradesktop-app-surface-sunken, var(--uui-color-border));
    overflow: hidden;
  }

  .bar > span {
    display: block;
    height: 100%;
    background: var(--umbradesktop-app-accent, var(--uui-color-selected));
  }


  .meta {
    font-size: 14px;
  }

  .sets {
    margin: 2px 0 10px;
    font-size: 12.5px;
  }

  .rows {
    flex: 1;
    min-height: 0;
    overflow: auto;
    border-top: 1px solid var(--umbradesktop-app-border, var(--uui-color-divider, var(--uui-color-border)));
  }

  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid var(--umbradesktop-app-border, var(--uui-color-divider, var(--uui-color-border)));
    font-size: 14px;
  }

  .row[data-status='waiting'],
  .row[data-status='not-started'],
  .row[data-status='skipped'] {
    opacity: 0.6;
  }

  .thumb {
    flex: none;
    width: ${ROW_THUMBNAIL.w}px;
    height: ${ROW_THUMBNAIL.h}px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: 2px;
    background: var(--umbradesktop-app-surface-sunken, var(--uui-color-background));
    color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
  }

  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .name {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .name b {
    font-weight: 400;
  }

  .name b,
  .name small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name small {
    font-size: 12.5px;
  }

  .name em {
    font-style: normal;
    font-size: 12.5px;
    color: var(--uui-color-danger);
  }

  .arrow {
    color: var(--umbradesktop-app-accent, var(--uui-color-selected));
    font-weight: 700;
  }

  .status {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    min-width: 80px;
    font-size: 13px;
  }

  .saved {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-weight: 700;
    color: var(--uui-color-positive);
  }

  .grew {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-weight: 700;
    color: var(--uui-color-warning-standalone, #a17700);
  }

  .bad {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-weight: 700;
    color: var(--uui-color-danger);
  }

  .mini {
    display: inline-block;
    width: 40px;
    height: 4px;
    border-radius: 2px;
    background: var(--umbradesktop-app-surface-sunken, var(--uui-color-border));
    overflow: hidden;
  }

  .mini > span {
    display: block;
    width: 40%;
    height: 100%;
    background: var(--umbradesktop-app-accent, var(--uui-color-selected));
    animation: slide 1.2s ease-in-out infinite alternate;
  }

  @keyframes slide {
    from {
      transform: translateX(0);
    }
    to {
      transform: translateX(150%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mini > span {
      animation: none;
    }
  }
`;
