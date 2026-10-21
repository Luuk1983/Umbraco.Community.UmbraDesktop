import { css, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { OPTIMIZE_PADDING, ROW_THUMBNAIL } from './constants.js';

/** The padding, as CSS. */
const PAD = unsafeCSS(`${OPTIMIZE_PADDING}px`);

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

  .skips {
    font-size: 13px;
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  .group {
    padding: 12px ${PAD};
    border-bottom: 1px solid var(--umbradesktop-app-border, var(--uui-color-divider, var(--uui-color-border)));
  }

  .group-title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
  }

  .group-body {
    margin: 8px 0 0 50px;
    display: grid;
    gap: 8px;
  }

  .group-body.flush {
    margin-left: 0;
  }

  .group-body[inert] {
    opacity: 0.55;
  }

  .hint {
    font-size: 13px;
  }

  /* A switch: a track and a knob, in the accent when on, drawn and greyed when locked. */
  .switch {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    padding: 2px 0;
    font: inherit;
    font-size: 15px;
    font-weight: 700;
    color: inherit;
    background: none;
    border: none;
    cursor: pointer;
  }

  .switch:disabled {
    cursor: default;
  }

  .switch:focus-visible {
    outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
    outline-offset: 2px;
  }

  .track {
    position: relative;
    flex: none;
    width: 38px;
    height: 22px;
    border-radius: 11px;
    background: var(--umbradesktop-app-surface-sunken, var(--uui-color-border));
    box-shadow: inset 0 0 0 1px var(--umbradesktop-app-border, var(--uui-color-border-emphasis));
  }

  .knob {
    position: absolute;
    left: 3px;
    top: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--umbradesktop-app-surface, var(--uui-color-surface));
    box-shadow: 0 0 0 1px var(--umbradesktop-app-border, var(--uui-color-border-emphasis));
  }

  .switch[aria-checked='true'] .track {
    background: var(--umbradesktop-app-accent, var(--uui-color-selected));
  }

  .switch[aria-checked='true'] .knob {
    left: 19px;
  }

  .switch:disabled .track {
    opacity: 0.5;
  }

  .row-fields {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .label {
    min-width: 72px;
  }

  .limit {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  input[type='number'] {
    width: 96px;
    min-height: 34px;
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
    accent-color: var(--umbradesktop-app-accent, var(--uui-color-selected));
  }

  input:disabled {
    opacity: 0.45;
  }

  .formats {
    display: inline-flex;
    gap: 6px;
  }

  .choice {
    min-height: 34px;
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

  .choice:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .choice:focus-visible,
  .radio:focus-visible {
    outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
    outline-offset: 1px;
  }

  /* A choice of two, drawn as radio buttons. */
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

  .radio[aria-pressed='true'] .dot {
    box-shadow: inset 0 0 0 5px var(--umbradesktop-app-accent, var(--uui-color-selected));
  }

  .radio-text {
    display: flex;
    flex-direction: column;
  }

  .radio-text small {
    font-size: 13px;
  }

  .usage {
    margin-left: 28px;
    padding: 8px 10px;
    font-size: 13px;
    background: var(--uui-color-warning-standalone, #fff3e0);
    color: var(--uui-color-warning-contrast, #6b4a00);
    border-radius: var(--umbradesktop-app-radius, 3px);
  }

  .foot {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 14px ${PAD};
    border-top: 1px solid var(--umbradesktop-app-border, var(--uui-color-divider, var(--uui-color-border)));
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

  .bar[failed] > span {
    background: var(--uui-color-danger);
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
    color: var(--uui-color-warning, #c27c00);
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
