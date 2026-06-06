// One-time rename of this game's localStorage keys from the old "base-command:"
// namespace to "kalros:" (the game was renamed Base Command -> Kalros). Runs on
// boot, before any save / audio pref is read.
//
// Idempotent and safe to keep forever: for each pair it only acts when the OLD
// key exists, never clobbers a value already sitting under the new key, and
// removes the old key once carried over. Storage being unavailable (private
// mode / disabled) is swallowed — there's simply nothing to migrate.
const RENAMES = [
  ["base-command:save",  "kalros:save"],
  ["base-command:audio", "kalros:audio"],
];

export function migrateStorage() {
  try {
    for (const [oldKey, newKey] of RENAMES) {
      const val = localStorage.getItem(oldKey);
      if (val === null) continue;
      if (localStorage.getItem(newKey) === null) localStorage.setItem(newKey, val);
      localStorage.removeItem(oldKey);
    }
  } catch (e) { /* storage disabled — nothing to migrate */ }
}
