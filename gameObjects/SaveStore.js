const KEY = "base-command:save";
// Bump on breaking item-model changes — a mismatched version is dropped on
// load (load() returns null), so the player simply starts fresh. v2: gem/weapon
// redesign (ball/stinger/laser + effect-slot gems). v3: synthesis economy —
// no combining, weapons granted at start, cash = synth fuel, no stat upgrades.
// v4: temp click-to-unlock for extra slots + colour synths.
// v5: gems drive weapons (primary/helpers hold gems); gem tiers; arc tuning.
// v6: red/blue/yellow + AOE; white = buyable fuel fed to feed-based synth
//     machines; unlock gates removed.
// v7: empty starting weapon slot; machines level up (level/xp) -> higher output
//     tier; slower gen (5 min/gem at tier 1).
// v8: white SOURCE machine (self-runs) + start with 1 white gem; buy button gone;
//     levels reward hourglasses (boost synth), no money; slot-unlock by sacrifice;
//     equal gem costs.
// v9: white machine takes a catalyst too (no more auto-source); seed it to bootstrap.
// v10: white gems GONE; coloured gems are the fuel (any gem fuels any synth, tier =
//      fuel/s on top of a base 1/s); 3 synths; start with no gems.
// v11: colour-locked fuel; exact integer sub-fuel accounting (machines store `fuel`
//      + `burstLeft`/`burstRate`, not `progress`/`boostFrames`); one-time first-
//      hourglass double bonus (`firstHourglassBonusUsed`).
const VERSION = 11;

export function load() {
  try {
    var raw = localStorage.getItem(KEY);
    if ( !raw ) return null;
    var data = JSON.parse(raw);
    if ( data.version !== VERSION ) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: VERSION, ...data }));
  } catch (e) {}
}

export function clear() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) {}
}
