import { subKeyOf } from './subscriptions-store.js';

const CACHE_VERSION = 1;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STORAGE_PREFIX = 'beads-ui.snapshot.';

/**
 * Create a local snapshot cache for first-paint hydration.
 *
 * @param {Storage} storage
 */
export function createSnapshotCache(storage) {
  /**
   * @param {string} workspace_path
   * @param {{ type: string, params?: Record<string, string|number|boolean> }} spec
   */
  function storageKey(workspace_path, spec) {
    return `${STORAGE_PREFIX}${workspace_path}::${subKeyOf(spec)}`;
  }

  return {
    /**
     * @param {string | null | undefined} workspace_path
     * @param {{ type: string, params?: Record<string, string|number|boolean> }} spec
     * @returns {any[] | null}
     */
    read(workspace_path, spec) {
      if (!workspace_path) {
        return null;
      }
      try {
        const raw = storage.getItem(storageKey(workspace_path, spec));
        if (!raw) {
          return null;
        }
        const parsed = JSON.parse(raw);
        if (
          !parsed ||
          parsed.version !== CACHE_VERSION ||
          !Array.isArray(parsed.items)
        ) {
          return null;
        }
        const captured_at = Number(parsed.captured_at) || 0;
        if (captured_at > 0 && Date.now() - captured_at > CACHE_TTL_MS) {
          return null;
        }
        return parsed.items;
      } catch {
        return null;
      }
    },
    /**
     * @param {string | null | undefined} workspace_path
     * @param {{ type: string, params?: Record<string, string|number|boolean> }} spec
     * @param {any[]} items
     */
    write(workspace_path, spec, items) {
      if (!workspace_path || !Array.isArray(items) || items.length === 0) {
        return;
      }
      try {
        storage.setItem(
          storageKey(workspace_path, spec),
          JSON.stringify({
            version: CACHE_VERSION,
            captured_at: Date.now(),
            items
          })
        );
      } catch {
        // Ignore quota / serialization errors.
      }
    }
  };
}
