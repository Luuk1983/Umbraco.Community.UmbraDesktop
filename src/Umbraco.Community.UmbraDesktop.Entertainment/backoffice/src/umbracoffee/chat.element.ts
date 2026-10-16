import { umbraCoffeeTerm } from './localize.js';
import { css, customElement, html, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * The live chat, in YouTube's own page in a frame, with a line under it about posting (design §5).
 *
 * Reading needs nothing. Posting needs a YouTube sign-in in this browser and third-party cookies
 * allowed, which Chrome and Edge do by default and Safari and Firefox do not, so there the chat is
 * read-only. That is said as **text under the frame**, not detected: a page cannot tell, and a guess
 * would be wrong for someone. The chat is YouTube's page, so its colours are YouTube's, not the theme's,
 * and it is undocumented though long-standing, so it is the part most likely to break.
 *
 * `embed_domain` must be the embedding page's host or YouTube refuses to show the chat, and the
 * referrer policy is set because a policy of `no-referrer` on the backoffice's page would otherwise be
 * inherited by the frame.
 */
@customElement('umbracoffee-chat')
export class UmbraCoffeeChatElement extends UmbLitElement {
  /** The live video whose chat to show. */
  @property({ attribute: 'video-id' })
  videoId = '';

  /**
   * The frame and the note under it.
   * @returns The template.
   */
  override render() {
    const src = `https://www.youtube.com/live_chat?v=${encodeURIComponent(this.videoId)}&embed_domain=${encodeURIComponent(location.hostname)}`;
    return html`<iframe
        src=${src}
        title=${umbraCoffeeTerm(this.localize, 'umbraCoffeeChat', 'Chat')}
        referrerpolicy="strict-origin-when-cross-origin"
      ></iframe>
      <p class="note">
        ${umbraCoffeeTerm(
          this.localize,
          'umbraCoffeeChatNote',
          'Anyone can read. To post, sign in to YouTube in this browser and allow third-party cookies.',
        )}
      </p>`;
  }

  /**
   * The frame fills what the note leaves. The frame sits on the panel's ground, since the page inside
   * it paints its own.
   */
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
      height: 100%;
    }

    iframe {
      flex: 1;
      min-height: 0;
      width: 100%;
      border: 0;
      background: var(--umbradesktop-app-surface, var(--uui-color-surface));
    }

    .note {
      flex: none;
      margin: 0;
      padding: 6px 12px;
      font-size: 12px;
      color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
      box-shadow: 0 -1px 0 0 var(--umbradesktop-app-border, var(--uui-color-text-alt));
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so templates type-check. */
    'umbracoffee-chat': UmbraCoffeeChatElement;
  }
}
