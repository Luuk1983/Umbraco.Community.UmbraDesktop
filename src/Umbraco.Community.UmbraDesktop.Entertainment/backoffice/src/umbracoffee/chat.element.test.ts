import { expect } from '@open-wc/testing';
import './chat.element.js';
import en from '../localization/en.js';
import { removeBoxes, sizedBox } from './test-support.js';

/** The strings the chat falls back to, which are the English dictionary's. */
const STRINGS = en.umbraDesktopEntertainment;

afterEach(removeBoxes);

/**
 * Mount the chat for a video.
 * @param videoId The live video.
 * @returns The element after its first render.
 */
async function mount(videoId: string) {
  const element = document.createElement('umbracoffee-chat');
  element.videoId = videoId;
  sizedBox({ w: 320, h: 400 }).appendChild(element);
  await element.updateComplete;
  return element;
}

/**
 * The frame's address and policy are the whole contract: the runner's page blocks frames, so nothing
 * loads and only what the frame was given can be asserted.
 */
describe('the chat element', () => {
  it("draws YouTube's live chat page for the video, on this page's host, with the referrer policy the player has", async () => {
    const element = await mount('v1');
    const frame = element.shadowRoot?.querySelector('iframe');
    expect(frame?.getAttribute('src')).to.equal(
      `https://www.youtube.com/live_chat?v=v1&embed_domain=${encodeURIComponent(location.hostname)}`,
    );
    expect(frame?.getAttribute('referrerpolicy')).to.equal('strict-origin-when-cross-origin');
    expect(frame?.getAttribute('title')).to.equal(STRINGS.umbraCoffeeChat);
  });

  it('escapes the id', async () => {
    const element = await mount('a&b');
    expect(element.shadowRoot?.querySelector('iframe')?.getAttribute('src')).to.contain('v=a%26b');
  });

  it('says under the frame that posting needs a sign-in, as text and not as a detection', async () => {
    const element = await mount('v1');
    expect(element.shadowRoot?.querySelector('.note')?.textContent?.trim()).to.equal(STRINGS.umbraCoffeeChatNote);
  });
});
