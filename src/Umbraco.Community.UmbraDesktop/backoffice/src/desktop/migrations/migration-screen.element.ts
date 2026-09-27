import { migrationScreenCopy } from './migration-copy';
import { UMBRADESKTOP_Z_SYSTEM_SCREEN } from '../constants';
import type { UmbraDesktopMigrationPhase } from './types';
import '../components/loader.element.js';
import { css, customElement, html, nothing, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/** Fired when the person closes the screen. Carries nothing: the desktop is behind it either way. */
export const UMBRADESKTOP_MIGRATION_DISMISS_EVENT = 'umbradesktop-migration-dismiss';

/**
 * The screen a one-time migration runs behind.
 *
 * Why it exists at all: an operating system that goes quiet, does something to your data and comes
 * back without saying what it did is unnerving, and this migration moves a person's desktop off
 * their browser and onto their account. The alternative considered and rejected was a line on the
 * boot splash, which nobody sees on a fast connection and which nobody reaches at all when they
 * enter the desktop by clicking the section rather than booting into it. Putting the screen inside
 * the desktop is what makes the way somebody arrived stop mattering.
 *
 * It covers the desktop rather than floating over it, because the desktop underneath is mid-change:
 * on the way in it is painting this browser's settings, and on the way out the account's. Letting
 * either show through would be exactly the flash the whole feature exists to avoid.
 *
 * Theme-neutral, like the boot splash and for the same reason: this is the machine talking about
 * itself, not a piece of desktop chrome, and a screen that looked different under each of five
 * themes would read as part of the desktop rather than as a system event happening to it.
 */
@customElement('umbradesktop-migration-screen')
export class UmbraDesktopMigrationScreenElement extends UmbLitElement {
  /** Which state the screen is in. */
  @property({ type: String })
  public phase: UmbraDesktopMigrationPhase = 'running';

  /**
   * Localization key of the migration currently running, when one is.
   *
   * Separate from the state's own copy on purpose. The state says what is happening to the person's
   * settings; this says which step is happening. With one migration the two read as a single
   * message, and with three they will not, and the screen should not need rewriting then.
   */
  @property({ type: String })
  public descriptionKey?: string;

  /** Tells the desktop the person is finished with the screen. */
  #dismiss(): void {
    this.dispatchEvent(new CustomEvent(UMBRADESKTOP_MIGRATION_DISMISS_EVENT, { bubbles: true, composed: true }));
  }

  /**
   * Put focus on the button the moment one appears.
   *
   * Without this the screen blocks only visually: a keyboard or screen reader user stays wherever
   * they were, behind a cover they cannot see, with no route to the one control on screen. `inert`
   * on the desktop behind is what stops them walking back into it, and is applied by the desktop
   * element rather than here, because an element cannot make its own siblings inert.
   * @param changed The properties that changed.
   */
  override updated(changed: Map<string, unknown>): void {
    super.updated(changed);

    if (!changed.has('phase') || this.phase === 'running') return;

    // `uui-button.focus()` is async — it awaits its own render before focusing the native button
    // inside its shadow root — so this returns a promise, and one that rejects if it is called
    // before that button exists. Swallowed rather than awaited: focus is a courtesy, and an
    // unhandled rejection from one is not worth a broken page.
    const button = this.renderRoot.querySelector<HTMLElement & { focus(): void | Promise<void> }>('uui-button');
    void Promise.resolve(button?.focus()).catch(() => undefined);
  }

  override render() {
    const copy = migrationScreenCopy(this.phase);

    // `alertdialog` rather than `status`: this is the only thing on screen and it owns the one
    // control, and a live region is the wrong container for a button — it re-announces the label on
    // every phase change. The live region is narrowed to the text that actually changes.
    return html`
      <div
        class="stack"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="migration-title"
        aria-describedby="migration-body">
        ${this.phase === 'running' ? html`<umbradesktop-loader></umbradesktop-loader>` : nothing}
        <div role="status">
          <!-- Not an h1: the backoffice already has one, and a screen that borrows the document's
               top level would reorder the page outline for anything reading headings. -->
          <p id="migration-title" class="title">${this.localize.term(copy.titleKey)}</p>
          <p id="migration-body" class="body">${this.localize.term(copy.bodyKey)}</p>
          ${this.phase === 'running' && this.descriptionKey
            ? html`<p class="step">${this.localize.term(this.descriptionKey)}</p>`
            : nothing}
        </div>
        ${copy.dismissKey
          ? html`<uui-button
              class="dismiss"
              look="primary"
              color="default"
              label=${this.localize.term(copy.dismissKey)}
              @click=${this.#dismiss}></uui-button>`
          : nothing}
      </div>
    `;
  }

  static override styles = css`
    /* Absolute rather than fixed: it covers the desktop it belongs to, not the browser window, so
       it stays correct if the desktop is ever not the whole viewport. The desktop element is the
       positioned ancestor. */
    :host {
      position: absolute;
      inset: 0;
      z-index: ${UMBRADESKTOP_Z_SYSTEM_SCREEN};
      display: flex;
      align-items: center;
      justify-content: center;
      /* The splash's own ground and lift, written as the same literals for the same reason: this
         screen must look like the boot screen's sibling, and reading them from theme tokens would
         make it look like whichever theme the user happens to be on. */
      background-color: #0b1024;
      background-image:
        radial-gradient(60% 72% at 50% 46%, rgba(38, 56, 111, 0.3) 0%, transparent 70%),
        radial-gradient(80% 90% at 50% 48%, transparent 38%, rgba(3, 5, 14, 0.7) 100%);
      color: #fff;
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    }

    /* The loader sets its own colour from --uui-color-text, which follows the backoffice's light or
       dark setting and is near-black on a light one — so on this screen's fixed dark ground it
       rendered as a black mark on navy. Its own comment states the rule this broke: anything that
       pins the ground the loader paints on must pin this token too.

       0.92 rather than a flat white because the loader draws its track at 0.16 of this colour, which
       lands the track at ~0.147 — within a hair of the 0.14 the boot splash draws its own track at,
       so the two read as the same object. */
    umbradesktop-loader {
      --umbradesktop-window-loader-color: rgba(255, 255, 255, 0.92);
    }

    .stack {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      /* Wide enough for the explanation to read as prose rather than as a column of fragments, and
         narrow enough that a line is still scannable on a large monitor. */
      max-width: 44ch;
      padding: 0 24px;
      animation: umbradesktop-migration-in 220ms ease-out both;
    }

    .title {
      margin: 22px 0 0;
      font-size: 24px;
      font-weight: 600;
      line-height: 1.2;
    }

    .body {
      margin: 12px 0 0;
      font-size: 14px;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.78);
    }

    .step {
      margin: 18px 0 0;
      font-size: 13px;
      line-height: 1.4;
      color: rgba(255, 255, 255, 0.62);
    }

    .dismiss {
      margin-top: 26px;
    }

    @keyframes umbradesktop-migration-in {
      from {
        opacity: 0;
        transform: translateY(6px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .stack {
        animation: none;
      }
    }
  `;
}

export default UmbraDesktopMigrationScreenElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-migration-screen': UmbraDesktopMigrationScreenElement;
  }
}
