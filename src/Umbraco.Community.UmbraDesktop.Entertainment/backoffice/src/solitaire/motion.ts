/**
 * FLIP for cards (design D4): record where every card is, let the state change move them, then
 * animate each from its old place to its new one. One code path for dealing, snapping back,
 * flying home and auto-finish.
 */

/** Where each card was, by `data-id`. */
export type Snapshot = Map<string, { readonly x: number; readonly y: number }>;

/**
 * Record where each card is on screen right now, including any flight still in progress.
 * @param cards Card elements carrying `data-id`; one without is skipped, since it cannot be matched later.
 * @returns Their positions.
 */
export function snapshot(cards: Iterable<HTMLElement>): Snapshot {
  const out: Snapshot = new Map();
  for (const card of cards) {
    const id = card.dataset.id;
    if (!id) continue;
    // Deliberately the *visible* position, animations included: a card still flying from the
    // previous move (auto-finish starts the next move before the last one lands) must continue
    // from where the player sees it. Cancelling here made it jump to its destination instead.
    // `playFlip` is the side that cancels, because it needs the layout position.
    const rect = card.getBoundingClientRect();
    out.set(id, { x: rect.left, y: rect.top });
  }
  return out;
}

/** How to animate. */
export interface FlipOptions {
  /** Length of one card's move, in ms. */
  readonly duration: number;
  /** Extra delay per moving card, in the order they are given. */
  readonly stagger: number;
  /** Reduced motion: move instantly. */
  readonly reduced: boolean;
}

/**
 * Animate every card that moved since the snapshot.
 * @param cards Card elements, already in their new places.
 * @param before The snapshot taken before the change.
 * @param options Timing.
 * @returns The animations started, for tests and for awaiting.
 */
export function playFlip(
  cards: Iterable<HTMLElement>,
  before: Snapshot,
  options: FlipOptions,
): Animation[] {
  if (options.reduced) return [];
  const started: Animation[] = [];
  for (const card of cards) {
    const id = card.dataset.id;
    if (!id) continue;
    const from = before.get(id);
    if (!from) continue;
    // Measure the layout position, not wherever an animation still in flight has put the card.
    card.getAnimations().forEach((a) => a.cancel());
    const rect = card.getBoundingClientRect();
    const dx = from.x - rect.left;
    const dy = from.y - rect.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    started.push(
      card.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }], {
        duration: options.duration,
        delay: started.length * options.stagger,
        easing: 'cubic-bezier(.2,.8,.2,1)',
        fill: 'backwards',
      }),
    );
  }
  return started;
}
