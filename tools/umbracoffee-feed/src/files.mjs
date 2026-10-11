/**
 * Reading and writing the data files, the one way every command does it, so the same data is always
 * the same bytes and an unchanged run is never a commit.
 * @module files
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * Serialises a data file the one way this tool ever does.
 * @param {unknown} value The JSON value.
 * @returns {string} Two-space JSON with a trailing newline.
 */
export function serialise(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

/**
 * Reads a JSON file, treating a missing one as "not there yet".
 * @param {string} path The file.
 * @returns {any} The parsed value, or null when the file does not exist.
 */
export function readJson(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

/**
 * Writes a file only when its bytes differ, so an unchanged run leaves file times alone too.
 * @param {string} path The file.
 * @param {string} text The new content.
 * @returns {boolean} True when the file was written.
 */
export function writeIfChanged(path, text) {
  if (existsSync(path) && readFileSync(path, 'utf8') === text) return false;
  writeFileSync(path, text);
  return true;
}

/**
 * Formats a moment as UTC ISO without milliseconds, the shape of every timestamp in the data files.
 * @param {Date} date The moment.
 * @returns {string} For example `2026-09-30T09:00:00Z`.
 */
export function iso(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
