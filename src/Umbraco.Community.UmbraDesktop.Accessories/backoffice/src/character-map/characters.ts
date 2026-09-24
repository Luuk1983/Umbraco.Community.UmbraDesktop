import { CHARACTER_MAP_ALT_CODES, CHARACTER_MAP_BLOCKS } from './unicode-data.js';

/**
 * Character Map's rules, apart from the window: the characters in each block, how one is named and
 * labelled in the status bar, and what a search finds. Pure, so the tests need no DOM.
 */

/** One character in the grid. */
export interface CharacterEntry {
  /** Its code point. */
  code: number;
  /** The character itself: what Select adds and Copy copies. */
  char: string;
  /** Its Unicode name, in capitals as Unicode writes it. English in every language, as it is in Unicode. */
  name: string;
  /** Whether it is a combining mark, which draws on the character before it. */
  combining: boolean;
}

/** One block of the grid: the "Group" list's entries. */
export interface CharacterBlock {
  /** Its id, which is also the key of its name in this package's dictionary. */
  id: string;
  /** Its characters, in code point order. */
  characters: CharacterEntry[];
}

/** The blocks, built once from the generated data on first use. */
let blocks: CharacterBlock[] | undefined;

/**
 * Every block, with its characters.
 * @returns The blocks, in Unicode's order.
 */
export function characterBlocks(): CharacterBlock[] {
  blocks ??= CHARACTER_MAP_BLOCKS.map(({ id, characters }) => ({
    id,
    characters: characters.map(([code, name, combining]) => ({
      code,
      char: String.fromCodePoint(code),
      name,
      combining: combining === 1,
    })),
  }));
  return blocks;
}

/**
 * A Unicode name as Windows' Character Map wrote it in its status bar: each word capitalised.
 * @param name The name in Unicode's capitals.
 * @returns "Latin Small Letter E With Acute".
 */
export function displayName(name: string): string {
  return name.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());
}

/**
 * A code point as the status bar shows it.
 * @param code The code point.
 * @returns "U+00E9".
 */
export function codeLabel(code: number): string {
  return `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * The keystroke that types a character on Windows, which the status bar showed beside its name.
 * Only the ANSI code page's upper half had one, so ASCII and most of Unicode have none.
 * @param code The code point.
 * @returns "Alt+0233", or undefined.
 */
export function altKeystroke(code: number): string | undefined {
  const byte = CHARACTER_MAP_ALT_CODES[code];
  return byte === undefined ? undefined : `Alt+${byte.toString().padStart(4, '0')}`;
}

/**
 * What a cell shows. A combining mark alone has nothing to sit on, so it sits on a dotted circle,
 * which is Unicode's own convention for showing one.
 * @param character The character.
 * @returns The text to draw.
 */
export function glyphOf(character: CharacterEntry): string {
  return character.combining ? `◌${character.char}` : character.char;
}

/** A query that is a code point: U+ and two or more hex digits, or four or more bare ones. */
const CODE_POINT = /^(?:u\+([0-9a-f]{2,6})|([0-9a-f]{4,6}))$/i;

/**
 * Characters matching a search, across every block.
 *
 * A code point (`U+20AC`, `20AC`) finds that character first. A single character pasted in finds
 * itself. Anything else is words, and a character matches when every word is somewhere in its name,
 * so "acute e small" finds é and not É.
 * @param query What was typed.
 * @returns The matches, the code point's own character first.
 */
export function findCharacters(query: string): CharacterEntry[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const all = characterBlocks().flatMap((block) => block.characters);
  if ([...trimmed].length === 1) return all.filter((character) => character.char === trimmed);
  const found: CharacterEntry[] = [];
  const code = CODE_POINT.exec(trimmed);
  if (code) {
    const value = parseInt(code[1] ?? code[2], 16);
    const exact = all.find((character) => character.code === value);
    if (exact) found.push(exact);
  }
  const words = trimmed.toUpperCase().split(/\s+/);
  for (const character of all) {
    if (found[0] === character) continue;
    if (words.every((word) => character.name.includes(word))) found.push(character);
  }
  return found;
}
