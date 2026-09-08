/* Reading a key whose name changed. */

/**
 * The value at `key`, falling back once to `was` and carrying it over.
 *
 * The app was Rattil before it was Rattle, and both of its storage keys
 * carried the old name. Somebody who used it before the rename has their
 * position and their review plan sitting under those, and a static page gets
 * no chance to migrate anything before it is asked for, so the first read
 * that finds the new key empty adopts the old value and moves it across. The
 * review plan is the one that matters: it is weeks of somebody's work, and
 * renaming a key without this would have handed them an empty one.
 *
 * Idempotent, because it has to be: React calls a `useState` initialiser
 * twice under StrictMode, and the second call finds the new key already
 * written and returns before touching anything.
 *
 * The fallback can go once nobody is likely to be arriving for the first time
 * since the rename. Until then, deleting it is deleting their progress.
 */
export function readRenamed(key: string, was: string): string | null {
  try {
    const current = localStorage.getItem(key);
    if (current !== null) return current;
    const carried = localStorage.getItem(was);
    if (carried === null) return null;
    localStorage.setItem(key, carried);
    localStorage.removeItem(was);
    return carried;
  } catch {
    // A browser with storage blocked throws on the first read. Same answer as
    // a browser with nothing stored: there is nothing to carry over.
    return null;
  }
}
