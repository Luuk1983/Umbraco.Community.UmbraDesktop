/**
 * A `Storage` backed by a Map, so the tests never touch the real browser storage the other games'
 * tests also use. Not a `.test.ts` file, so the runner does not treat it as a suite.
 */
export class MemoryStorage implements Storage {
  /** The backing store. All items are strings so they mirror a real Storage. */
  #items = new Map<string, string>();

  /**
   * The number of key-value pairs currently in the store.
   */
  get length(): number {
    return this.#items.size;
  }

  /**
   * Remove all key-value pairs from the store.
   */
  clear(): void {
    this.#items.clear();
  }

  /**
   * Retrieve a value by key.
   * @param key The key to look up.
   * @returns The value, or `null` if not found.
   */
  getItem(key: string): string | null {
    return this.#items.get(key) ?? null;
  }

  /**
   * Retrieve the key at a numeric index.
   * @param index The index (0-based).
   * @returns The key, or `null` if the index is out of bounds.
   */
  key(index: number): string | null {
    return [...this.#items.keys()][index] ?? null;
  }

  /**
   * Remove a key-value pair by key.
   * @param key The key to remove.
   */
  removeItem(key: string): void {
    this.#items.delete(key);
  }

  /**
   * Set a key-value pair, creating it if it does not exist.
   * @param key The key.
   * @param value The value.
   */
  setItem(key: string, value: string): void {
    this.#items.set(key, value);
  }
}
