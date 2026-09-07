/**
 * Minesweeper's rules, as pure functions over a board value.
 *
 * No DOM, no Lit and no `Math.random` on any path a test takes: mine placement arrives as an
 * injected {@link MinesweeperPlacer}, so every case in `rules.test.ts` names the layout it reasons
 * about. That is not ceremony. The interesting behaviour of this game is *which* cells open when
 * one is clicked, and a test that placed mines at random could only ever assert how many.
 *
 * Every transition returns a new board and mutates nothing, which is what lets the element hold the
 * board in one `@state()` field and re-render on assignment.
 */

/** Board dimensions and difficulty. Row-major throughout: index `y * width + x`. */
export interface MinesweeperConfig {
  /** Columns. */
  width: number;
  /** Rows. */
  height: number;
  /** How many cells hold a mine. */
  mineCount: number;
}

/**
 * Chooses where the mines go.
 *
 * Yields candidate cell indices in order of preference; {@link createBoard} takes the first
 * `mineCount` distinct, in-range ones and, if the placer runs short, completes the set by scanning
 * upwards from cell 0. That completion is why a test can write `() => [2, 7]` and get exactly those
 * two mines without also having to be a correct placer.
 * @param config The board being built, so a placer can size its own output.
 * @returns Candidate indices, most-preferred first.
 */
export type MinesweeperPlacer = (config: MinesweeperConfig) => Iterable<number>;

/** One cell. `revealed` and `flagged` are never both true: a flag is what stops a reveal. */
export interface MinesweeperCell {
  /** Whether this cell holds a mine. */
  readonly mine: boolean;
  /** How many of the (up to eight) neighbours hold a mine. */
  readonly adjacent: number;
  /** Whether the player has opened it. */
  readonly revealed: boolean;
  /** Whether the player has marked it. */
  readonly flagged: boolean;
}

/**
 * How far along the game is.
 *
 * `ready` is a distinct state from `playing` rather than a flag on the side, because it is what the
 * first-click guarantee hangs off: the mines are still allowed to move while the board is `ready`
 * and never afterwards. The element also reads it to decide whether the clock is running.
 */
export type MinesweeperStatus = 'ready' | 'playing' | 'won' | 'lost';

/** A whole game, as one immutable value. */
export interface MinesweeperBoard extends MinesweeperConfig {
  /** Every cell, row-major. */
  readonly cells: ReadonlyArray<MinesweeperCell>;
  /** How far along the game is. */
  readonly status: MinesweeperStatus;
}

/** A cell as it starts: no mine, no count, untouched. */
const EMPTY_CELL: MinesweeperCell = { mine: false, adjacent: 0, revealed: false, flagged: false };

/**
 * The default placer: a Fisher-Yates shuffle of every cell index.
 *
 * Shuffling the whole grid rather than drawing `mineCount` random indices, because drawing has to
 * cope with collisions and the naive retry loop degrades badly as a board fills up, which is
 * exactly the case a future expert board would hit.
 * @param config The board being built.
 * @returns Every index, in a random order.
 */
export const randomPlacer: MinesweeperPlacer = ({ width, height }) => {
  const indices = Array.from({ length: width * height }, (_unused, index) => index);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
};

/**
 * The indices of a cell's up-to-eight neighbours.
 *
 * Exported because the element needs the same adjacency when it derives nothing at all, and two
 * definitions of "next to" is how a flood and a mine count end up disagreeing on the board edges.
 * @param config The board's dimensions.
 * @param index The cell to look around.
 * @returns Neighbour indices, clipped to the grid.
 */
export function neighbourIndices({ width, height }: MinesweeperConfig, index: number): number[] {
  const x = index % width;
  const y = Math.floor(index / width);
  const found: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if ((dx || dy) && nx >= 0 && nx < width && ny >= 0 && ny < height) found.push(ny * width + nx);
    }
  }
  return found;
}

/**
 * Build the cell array for a known set of mines, counting every cell's neighbours.
 * @param config The board's dimensions.
 * @param mines Which indices hold a mine.
 * @param flagged Flags to carry over, since a player may flag before the first click and the mines
 *   are allowed to move underneath those flags.
 * @returns A fresh, unrevealed cell array.
 */
function layOut(
  config: MinesweeperConfig,
  mines: ReadonlySet<number>,
  flagged: ReadonlySet<number> = new Set(),
): MinesweeperCell[] {
  const total = config.width * config.height;
  return Array.from({ length: total }, (_unused, index) => ({
    ...EMPTY_CELL,
    mine: mines.has(index),
    adjacent: neighbourIndices(config, index).filter((n) => mines.has(n)).length,
    flagged: flagged.has(index),
  }));
}

/**
 * Complete a mine set by scanning upwards from cell 0, skipping what is taken or forbidden.
 *
 * Deterministic on purpose: it is the safety net under a placer that yielded too few usable
 * indices, and a random net would make a test that hit it unreproducible. Reaching it at all means
 * the placer was short, which for {@link randomPlacer} never happens.
 * @param chosen The mines so far; mutated until it holds `mineCount` of them.
 * @param total How many cells there are.
 * @param mineCount How many mines the board wants.
 * @param excluded Cells that must stay clear.
 */
function completeMines(
  chosen: Set<number>,
  total: number,
  mineCount: number,
  excluded: ReadonlySet<number>,
): void {
  for (let index = 0; chosen.size < mineCount && index < total; index++) {
    if (!chosen.has(index) && !excluded.has(index)) chosen.add(index);
  }
}

/**
 * A new game: mines placed, counts computed, nothing revealed.
 * @param config Dimensions and mine count. A `mineCount` above the cell count fills the board.
 * @param placer Where the mines go. Injected so tests are deterministic; defaults to random.
 * @returns A board in `ready` state.
 */
export function createBoard(
  config: MinesweeperConfig,
  placer: MinesweeperPlacer = randomPlacer,
): MinesweeperBoard {
  const total = config.width * config.height;
  const mineCount = Math.max(0, Math.min(config.mineCount, total));
  const chosen = new Set<number>();
  for (const index of placer(config)) {
    if (chosen.size >= mineCount) break;
    if (Number.isInteger(index) && index >= 0 && index < total) chosen.add(index);
  }
  completeMines(chosen, total, mineCount, new Set());
  return { ...config, mineCount, cells: layOut(config, chosen), status: 'ready' };
}

/**
 * Move every mine out of a set of cells, to the lowest-numbered cells outside it that are free.
 * @param mines The current mines.
 * @param zone Cells that must end up mine-free.
 * @param total How many cells there are.
 * @returns The relocated mine set, or `undefined` if there was nowhere to put them.
 */
function relocateOutOf(
  mines: ReadonlySet<number>,
  zone: ReadonlySet<number>,
  total: number,
): Set<number> | undefined {
  const trapped = [...mines].filter((mine) => zone.has(mine));
  if (!trapped.length) return new Set(mines);
  const free: number[] = [];
  for (let index = 0; index < total && free.length < trapped.length; index++) {
    if (!zone.has(index) && !mines.has(index)) free.push(index);
  }
  if (free.length < trapped.length) return undefined;
  const next = new Set(mines);
  trapped.forEach((mine, slot) => {
    next.delete(mine);
    next.add(free[slot]);
  });
  return next;
}

/**
 * Re-lay the board so the player's first click opens a clear region.
 *
 * **The chosen rule is the modern one: the clicked cell *and all eight of its neighbours* are
 * cleared of mines**, which makes the clicked cell's count zero by construction and so guarantees
 * a flood rather than merely a survival. Guaranteeing only safety is cheaper and still correct
 * Minesweeper, but it leaves the opening move a coin flip between "the game has started" and "here
 * is a 3, now guess", and a player who has met any Minesweeper since about 2000 reads the latter as
 * the game being unfair rather than as a rule.
 *
 * The fallback exists because the guarantee is not always available: a board with fewer free cells
 * than the nine-cell safe zone needs (a 3 by 3 with eight mines, say) cannot have one. Rather than
 * refuse such a board, the zone shrinks to the clicked cell alone, which is always achievable
 * whenever a single non-mine cell exists, and the first click is then safe but possibly numbered.
 * @param board A board still in `ready` state.
 * @param index The cell the player clicked.
 * @returns The same board with its mines rearranged, and its flags kept.
 */
function withFirstClickSafe(board: MinesweeperBoard, index: number): MinesweeperBoard {
  const total = board.cells.length;
  const mines = new Set(board.cells.flatMap((cell, at) => (cell.mine ? [at] : [])));
  const flags = new Set(board.cells.flatMap((cell, at) => (cell.flagged ? [at] : [])));
  const region = new Set([index, ...neighbourIndices(board, index)]);
  const next = relocateOutOf(mines, region, total) ?? relocateOutOf(mines, new Set([index]), total);
  if (!next) return board;
  return { ...board, cells: layOut(board, next, flags) };
}

/**
 * Open a cell and, if it has no adjacent mine, everything its region touches.
 *
 * Iterative rather than recursive: a flood on an expert board can chain through hundreds of cells,
 * and a stack overflow in a game of Minesweeper would be an absurd way to lose. A flagged cell
 * stops the flood, which is the classic behaviour and the reason a misplaced flag can leave a
 * one-cell hole in an opened region.
 * @param cells The cell array to open into, mutated in place; the caller owns the copy.
 * @param config The board's dimensions.
 * @param start The cell the player clicked.
 */
function floodFrom(cells: MinesweeperCell[], config: MinesweeperConfig, start: number): void {
  const pending = [start];
  while (pending.length) {
    const index = pending.pop() as number;
    const cell = cells[index];
    if (cell.revealed || cell.flagged) continue;
    cells[index] = { ...cell, revealed: true };
    if (cell.adjacent === 0) pending.push(...neighbourIndices(config, index));
  }
}

/**
 * Reveal a cell, applying every rule that hangs off doing so.
 *
 * Order matters here and is the subject of one of the tests: the no-op checks run against the board
 * as it stands, *before* any first-click rearrangement, so clicking a flagged cell on a brand new
 * board leaves the mines exactly where they were rather than quietly reshuffling them.
 * @param board The board to act on.
 * @param index The cell the player clicked.
 * @returns A new board, or the same one when the gesture was a no-op (out of range, already open,
 *   flagged, or the game is over).
 */
export function reveal(board: MinesweeperBoard, index: number): MinesweeperBoard {
  const cell = board.cells[index];
  if (!cell || cell.revealed || cell.flagged) return board;
  if (board.status === 'won' || board.status === 'lost') return board;
  const base = board.status === 'ready' ? withFirstClickSafe(board, index) : board;
  // A loss shows the whole board rather than only the mines, and clears the flags with it: the
  // player has stopped playing and started looking, and a flag left standing over a revealed mine
  // is the one thing on the board that still hides information.
  if (base.cells[index].mine) {
    return {
      ...base,
      cells: base.cells.map((each) => ({ ...each, revealed: true, flagged: false })),
      status: 'lost',
    };
  }
  const cells = base.cells.slice();
  floodFrom(cells, base, index);
  // Winning is "every cell without a mine is open", never "every mine is flagged": flags are the
  // player's notes, and a player who clears the board without writing any has still cleared it.
  const won = cells.every((each) => each.mine || each.revealed);
  return { ...base, cells, status: won ? 'won' : 'playing' };
}

/**
 * Add or remove a flag.
 * @param board The board to act on.
 * @param index The cell the player marked.
 * @returns A new board, or the same one when the cell is out of range or already open, or the game
 *   is over.
 */
export function toggleFlag(board: MinesweeperBoard, index: number): MinesweeperBoard {
  const cell = board.cells[index];
  if (!cell || cell.revealed) return board;
  if (board.status === 'won' || board.status === 'lost') return board;
  const cells = board.cells.slice();
  cells[index] = { ...cell, flagged: !cell.flagged };
  return { ...board, cells };
}

/**
 * What the mine counter shows: the mine count less the flags placed.
 *
 * Flags, not mines, and the difference is the whole point of the display. It is a subtraction the
 * player controls rather than a hint the game gives, so it happily goes negative when more flags
 * are planted than there are mines, exactly as the original does.
 * @param board The board to count.
 * @returns Mines minus flags, which may be negative.
 */
export function remainingMines(board: MinesweeperBoard): number {
  return board.mineCount - board.cells.filter((cell) => cell.flagged).length;
}
