import { css, html, nothing } from '@umbraco-cms/backoffice/external/lit';
import type { TemplateResult } from '@umbraco-cms/backoffice/external/lit';
import { Gesture } from '../history.js';
import { NEUTRAL_ADJUST } from '../state.js';
import type { Adjust, EditorState } from '../state.js';
import type { UmbraDesktopImageEditorElement } from '../image-editor.element.js';
import type { ModeModule } from './mode.js';

/** What Adjust keeps while it is the mode. */
interface AdjustSettings {
  /** Whether Split view is on. */
  split: boolean;
  /** Where Split view's line is, as a share of the width. */
  at: number;
  /** Whether Hold to compare is held. */
  holding: boolean;
  /** The slider drag in progress, which previews without a step and commits one when let go. */
  gesture?: Gesture<EditorState>;
}

/** How far one arrow key moves Split view's line, as a share of the width. */
const SPLIT_STEP = 0.05;

/** The settings Adjust keeps between visits, on the editor. */
function settings(editor: UmbraDesktopImageEditorElement): AdjustSettings {
  return (editor.modeState.adjust ??= { split: false, at: 0.5, holding: false }) as AdjustSettings;
}

/**
 * What a slider says it is set to: exposure in camera stops, as photo editors write it (+0.8), the
 * others as their value; a true minus sign, since a hyphen reads as a dash.
 * @param name The adjustment.
 * @param value Its value.
 * @returns The text.
 */
export function sliderText(name: keyof Adjust, value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  const amount = Math.abs(value);
  return `${sign}${name === 'exposure' ? (amount / 100).toFixed(1) : amount}`;
}

/** Show the view as the settings say: the original while held, the split while on, else the picture. */
function showCompare(editor: UmbraDesktopImageEditorElement): void {
  const { split, at, holding } = settings(editor);
  editor.stage?.setCompare(holding ? 'original' : split ? 'split' : 'none', at);
}

/**
 * A slider moved: preview the new value in place of the current state, starting a gesture on the
 * first move of a drag, so the whole drag is one step.
 * @param editor The editor.
 * @param name The adjustment.
 * @param value Its new value.
 */
function preview(editor: UmbraDesktopImageEditorElement, name: keyof Adjust, value: number): void {
  const state = editor.state;
  const history = editor.history;
  if (!state || !history) return;
  const own = settings(editor);
  own.gesture ??= new Gesture(history);
  own.gesture.preview({ ...state, adjust: { ...state.adjust, [name]: value } });
  editor.refresh();
}

/** A slider was let go: the drag becomes one step. */
function commit(editor: UmbraDesktopImageEditorElement): void {
  const own = settings(editor);
  if (!own.gesture) return;
  own.gesture.commit();
  own.gesture = undefined;
  editor.refresh();
}

/**
 * A slider was double-clicked: back to 0, as one step.
 * @param editor The editor.
 * @param name The adjustment.
 */
function resetSlider(editor: UmbraDesktopImageEditorElement, name: keyof Adjust): void {
  const state = editor.state;
  if (!state) return;
  commit(editor);
  if (state.adjust[name] === 0) return;
  editor.apply({ ...editor.state!, adjust: { ...editor.state!.adjust, [name]: NEUTRAL_ADJUST[name] } });
}

/**
 * Hold to compare is pressed or let go.
 * @param editor The editor.
 * @param holding Whether it is held.
 */
function hold(editor: UmbraDesktopImageEditorElement, holding: boolean): void {
  settings(editor).holding = holding;
  showCompare(editor);
}

/**
 * Move Split view's line.
 * @param editor The editor.
 * @param at Where, as a share of the width.
 */
function moveSplit(editor: UmbraDesktopImageEditorElement, at: number): void {
  settings(editor).at = Math.min(1, Math.max(0, at));
  showCompare(editor);
  editor.requestUpdate();
}

/**
 * One slider with its label and what it is set to.
 * @param editor The editor.
 * @param name The adjustment.
 * @returns Its template.
 */
function renderSlider(editor: UmbraDesktopImageEditorElement, name: keyof Adjust): TemplateResult {
  const value = editor.state?.adjust[name] ?? 0;
  const id = `adjust-${name}`;
  return html`<div class="slider">
    <label for=${id}>${editor.words(name)}</label>
    <b>${sliderText(name, value)}</b>
    <input
      id=${id}
      type="range"
      name=${name}
      min="-100"
      max="100"
      step="1"
      .value=${String(value)}
      @input=${(event: Event) => preview(editor, name, Number((event.target as HTMLInputElement).value))}
      @change=${() => commit(editor)}
      @dblclick=${() => resetSlider(editor, name)} />
  </div>`;
}

/**
 * Adjust mode (design §4.1). The picture updates while a slider is dragged, through the stage's GPU
 * filter; the drag is one step. Hold to compare and Split view change only what the view shows.
 */
export const adjustMode: ModeModule = {
  enter(editor) {
    showCompare(editor);
  },

  leave(editor) {
    commit(editor);
    const own = settings(editor);
    own.holding = false;
    editor.stage?.setCompare('none');
  },

  overlay(editor) {
    const own = settings(editor);
    const stage = editor.stage;
    if (!own.split || !stage) return html``;
    const top = stage.toScreen({ x: stage.world.w * own.at, y: 0 });
    const bottom = stage.toScreen({ x: stage.world.w * own.at, y: stage.world.h });
    const percent = Math.round(own.at * 100);
    return html`<span
      class="split-line"
      role="slider"
      tabindex="0"
      aria-label=${editor.words('splitLine')}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow=${percent}
      style="left: ${top.x}px; top: ${top.y}px; height: ${bottom.y - top.y}px"
      @keydown=${(event: KeyboardEvent) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        event.stopPropagation();
        moveSplit(editor, own.at + (event.key === 'ArrowRight' ? SPLIT_STEP : -SPLIT_STEP));
      }}
      @pointerdown=${(event: PointerEvent) => {
        const line = event.currentTarget as HTMLElement;
        line.setPointerCapture?.(event.pointerId);
        const start = { x: event.clientX, at: own.at };
        const width = Math.max(1, stage.toScreen({ x: stage.world.w, y: 0 }).x - stage.toScreen({ x: 0, y: 0 }).x);
        const move = (moved: PointerEvent) => moveSplit(editor, start.at + (moved.clientX - start.x) / width);
        const up = () => {
          line.removeEventListener('pointermove', move);
          line.removeEventListener('pointerup', up);
          line.removeEventListener('pointercancel', up);
        };
        line.addEventListener('pointermove', move);
        line.addEventListener('pointerup', up);
        line.addEventListener('pointercancel', up);
      }}></span>`;
  },

  panel(editor) {
    const own = settings(editor);
    return html`
      <section class="box">
        <h4>${editor.words('light')}</h4>
        ${renderSlider(editor, 'exposure')} ${renderSlider(editor, 'brightness')} ${renderSlider(editor, 'contrast')}
      </section>
      <section class="box">
        <h4>${editor.words('colour')}</h4>
        ${renderSlider(editor, 'saturation')}
      </section>
      <p class="muted">${editor.words('sliderHint')}</p>
      <section class="box">
        <h4>${editor.words('compare')}</h4>
        <p>${editor.words('compareHint')}</p>
        <div class="row">
          <button
            type="button"
            data-command="hold-compare"
            aria-pressed=${own.holding ? 'true' : 'false'}
            @pointerdown=${() => hold(editor, true)}
            @pointerup=${() => hold(editor, false)}
            @pointerleave=${() => own.holding && hold(editor, false)}
            @pointercancel=${() => hold(editor, false)}
            @keydown=${(event: KeyboardEvent) => {
              if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
                event.preventDefault();
                event.stopPropagation();
                hold(editor, true);
              }
            }}
            @keyup=${(event: KeyboardEvent) => {
              if (event.key === ' ' || event.key === 'Enter') {
                event.stopPropagation();
                hold(editor, false);
              }
            }}>
            <umb-icon name="icon-split"></umb-icon><span>${editor.words('holdCompare')}</span>
          </button>
          <button
            type="button"
            data-command="split-view"
            aria-pressed=${own.split ? 'true' : 'false'}
            @click=${() => {
              own.split = !own.split;
              showCompare(editor);
              editor.requestUpdate();
            }}>
            <umb-icon name="icon-split-alt"></umb-icon><span>${editor.words('splitView')}</span>
          </button>
        </div>
      </section>
      ${nothing}
    `;
  },
};

/** Adjust's overlay styles: Split view's line, which is dragged and focused. */
export const adjustOverlayStyles = css`
  .split-line {
    position: absolute;
    width: 16px;
    margin-left: -8px;
    pointer-events: auto;
    cursor: ew-resize;
    touch-action: none;
  }

  .split-line::before {
    content: '';
    position: absolute;
    left: 7px;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #fff;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5);
  }

  .split-line:focus-visible {
    outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
  }
`;
