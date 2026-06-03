# base-command — agent quick-orient

A browser **canvas game** (base-defense / tower-shooter with a gem-merge
itemization loop). Pure ES modules, **no build step, no dependencies, no
backend** — `index.html` loads `index.js` as `type="module"` and everything
runs client-side. You edit the files, reload the page, done.

It's a **dojo app** (sibling of the `dojo` repo). The plain folder
`~/projects/base-command` is the **edit copy** (git branch `main`, the dev
line). `~/projects/base-command.prod` is a git worktree on branch `prod` =
the **served production snapshot** — never edit it. See "Running / deploying"
below.

> **Whisper note (project owner dictates):** Aaron often describes weapon /
> mechanic changes by voice, so requests can be loosely worded. The crafting
> tree and color semantics below are the source of truth — reconcile a fuzzy
> request against them and confirm anything that would change the tree.

## Running / deploying

- **Run locally:** serve the folder over HTTP and open `index.html` (ES
  modules need `http://`, not `file://`). E.g. `python3 -m http.server` then
  visit `http://localhost:8000`. `localhost`/`127.0.0.1` counts as **dev**
  (see env detection).
- **On the dojo:** served at `dojo.whipple.ninja/base/` (prod) and
  `/base.dev/` (dev = this `main` checkout). Registered in the gateway's
  `gateway/static_apps.py` (`mount: /base`, `root: …prod`, `dev_root: …`).
  Owner toggles Dev mode in `/settings` to view `.dev`.
- **Promote dev→prod:** the `/admin/releases` dashboard button, or by hand
  `git -C ~/projects/base-command.prod merge --ff-only main`. (Aaron pushes /
  promotes himself — commit locally and stop; don't push.)
- **`release.sh` + `README.md` are LEGACY** — they describe an old
  `master`→`release` GitHub-Pages deploy (`*.whipple.life`, CNAME file). The
  live deploy is the dojo gateway path above. Don't use `release.sh`.

## Architecture: a tiny custom engine + game objects on top

Two layers. `engine/` is a reusable mini game engine (shared in spirit with
Aaron's other canvas games); `gameObjects/` + `Game.js` are this game.

**`Game.js`** — the game entry/orchestrator. `start()` preloads images &
sounds, generates procedural icons/sprites (circles, triangles, rapid icons,
**lightning/zap/arc icons** via the `Lightning` effect rendered to a canvas),
seeds `engine.globals` (`cash`, `stats`, `levels`, `inventory`, `base`,
`cursor`), wires the title screen, and owns **save/load** (`_snapshot()` /
`_restoreSave()` via `gameObjects/SaveStore.js`, localStorage key
`base-command:save`).

**`engine/GameEngine.js`** — the core. Owns:
- the **game loop**: `startGameLoop()` runs a fixed-timestep `update()` at
  60Hz with a catch-up `while` loop, driven by `requestAnimationFrame`. rAF
  auto-throttles to 0 when the tab/app is hidden, so **gameplay pauses for
  free when backgrounded**; a `visibilitychange` handler additionally pauses
  all audio (HTML5 Audio keeps playing otherwise) and resets `nextTick` on
  return to avoid a catch-up burst.
- a **registry**: `register(obj, name?)` / `unregister` / `getObjects(name)`.
  Every game object goes in `gameObjects.all` (iterated each `update`/`draw`)
  and optionally a named collection (e.g. `"enemy"`, `"projectile"`).
- **input**: mouse/touch unified (`mobile` flag picks `touchstart` etc.),
  `onMouseDown/Up/Move/Wheel`, `onKeyDown/Press`, a `pressedKeys` map.
- a tiny **event bus**: `on(name, cb)` / `trigger(name, ...args)` — used all
  over for cross-object messaging (`saveRequested`, `openInventory`,
  `itemAcquired`, `levelWin`, `displayReward`, `firstInteraction`, …).
- **`engine.dev` / `engine.prod`** — environment flag (see below).
- `globals` — the shared game-state bag every object reads from.

**`engine/gfx/GameWindow.js`** — the render loop (separate rAF from the update
loop). Clears, **z-sorts `gameObjects.all` by `.z`**, calls each visible
object's `draw(ctx)`, then flushes queued particles. Sets up the canvas
(fixed 600×800 logical size from `Game.js`, CSS-scaled to fit). Press **`f`**
to toggle an FPS counter.

**`engine/objects/GameObject.js`** — base class for everything drawable.
Holds a `BoundingRect` (`rect`) + center `pos`; getters/setters keep `x/y`,
`rect`, `radius`, `originX/Y` in sync. `onCollision(cb, targetName)` registers
rectangle-overlap callbacks that the engine fires each tick against the named
collection. `lineIntercept(x,y,dir)` (ray vs rect) powers hit-scan weapons and
laser sights.

Other engine pieces: `gfx/ImageLibrary` (preload/cut spritesheets),
`gfx/Sprite`/`Image`/`Text`, `gfx/shapes/{Circle,Rectangle,Particle}`,
`gfx/effects/{Lightning,Alert}`, `gfx/ui/window/*` (a small canvas UI-component
system used by menus), `GameMath.js` (`Coord`, `BoundingRect`, direction
helpers like `slideDirectionTowards`).

## Game objects (gameObjects/)

- **`Base.js`** — the player's turret at the bottom. Aims at the
  mouse/touch, fires the **primary-slot gem** (the gem IS the weapon) on a timer
  (`fireIn`); fire cadence = `stats.speed.val * weapon.projectile.speed`
  (so `projectile.speed` is **fire-rate**, not velocity). Draws the aim
  sight for `laserSight` weapons. Plays the electric `zap` sound when the
  weapon is a laser (`weapon.projectile.laser`), else the `shot` sound.
- **`Projectile.js`** — one fired shot. Normal shots move (`xv/yv`),
  optionally **`homing`** (curves toward nearest enemy), optionally leave a
  particle **`trail`**; `color` picks the body image (`<color>-part-circle`)
  and trail. **`laser`** shots are instant hit-scan: straight (first enemy
  along `dir`) or, when `homing`, an **arc** toward the nearest enemy clamped
  to `LASER_MAX_ARC` (too-wide aim arcs but misses); they spawn a `Laser`
  beam effect and unregister immediately. A shot with a **`chain`**
  (`{jumps, falloff}`, from the yellow gem) deals lightning-type chaining
  damage via `Enemy.damage`. Hit damage routes through `_dealDamage`.
  Velocity is hardcoded to `300` in `Item.shoot` for all moving shots.
- **`effects/Laser.js`** — the instant beam visual: a straight line or a
  quadratic-bezier **arc** (when given a `control` point), bright core + glow,
  quick fade, with sparkle particles spawned along it. Color from the gem.
- **`Enemy.js`** — walks toward the base, takes `damage(dmg, type?)`. When
  `type.type === "lightning"` it spawns a `Lightning.rect` flash and **chains**
  to the nearest not-yet-hit enemy (`type.chain` hops, `type.weaken`
  multiplier, `innerCol`/`outerCol` carry the look). `red` enemies split on
  death; on death sprays a colored `deathBurst` (no money). `ENEMY_PALETTE`
  defines per-type colors. (`Cash.js` is **deleted** — money is gone.)
- **`Boss.js`** (extends Enemy), **`Spawner.js`** (per-level enemy waves +
  win/`_victory` + the hourglass `rollForReward`), **`Reward.js`** (level-clear
  reward popup), **`Cursor.js`** (drag-item follower; clears `dragItem`/
  `dragSource` on mouse-up).
- **`Levels.js`** — the `list` of levels (enemy count, hp, spawn rate, hourglass
  `reward`, boss). `selected` is the chosen level; all levels are always
  selectable (no unlock gate).
- **`Stats.js`** — `power`/`speed` multipliers (both stay 1; still used in shot
  math). The upgrade UI is gone (no money to spend).
- **`ui/`** — `TitleScreen` (level select + cog→settings; play/boss buttons),
  `InventoryMenu` (the drag-merge/equip/synth grid — `Inventory.attemptMerge` +
  the `Synthesis`/`Equipment`/`Items` components), `ToolTip` (item description +
  **merge targets derived live from `craft` keys**; gems show no tooltip — read
  the weapon badge instead), `GameUI` (in-level HUD), `SettingsScreen` (save
  **Reset** + dev **Cheat**), `Banner`, `Upgrade`.

## The item / gem system — the most-edited area

Defined in **`gameObjects/Item.js`** (`Item.list`). **There are only gems (plus
hourglasses — see Synthesis).** Three gem colors — **red, blue, yellow** — each
10 tiers. A gem is multi-purpose; the SLOT it's in decides its role:

- **Primary or a helper slot → WEAPON.** Color picks the weapon type; tier
  scales damage AND fire rate (`gemWeapon`).
- **Effect slot → AUGMENT** applied to whatever weapon you fire (`gemEffect`),
  tier-scaled.
- **Synthesizer slot → FUEL.** Only the gem's TIER matters (color is irrelevant
  for fueling). See the Synthesis section.

Every gem entry therefore carries both a `projectile` (weapon role) and an
`effect` (augment role).

| color | weapon (primary/helper) | effect (effect slot) |
|---|---|---|
| **red** | **Ball** | **Explosive** — shots blast on impact (AOE) |
| **blue** | **Stinger** (rapid) | **Homing** — projectiles seek / the laser arcs |
| **yellow** | **Laser** (hit-scan) | **Chain** — a bolt jumps between enemies |

Effects are **orthogonal** to weapons: e.g. Explosive (red effect) works on the
Ball, Stinger, OR Laser. `Item.shoot` bakes the equipped effect's
`aoe`/`homing`/`chain` into each shot's options; `Projectile` (and `_fireLaser`
for the beam) act on them. No effect gem → plain shot. Empty primary → the
`none` fallback: a small, short-range **basic shot** (1 dmg) so level 1 is
beatable from nothing.

**Tier model** (`buildGems`): tier 1 = bare name (`redGem`), tiers 2+ append the
number; `craft` chains each tier→next (merge same color+tier → next, cap 10).
`gemWeapon`/`gemEffect(color,tier)` hold the per-tier scaling — **deliberately
rough; the real ratios await a progression-design pass, so don't treat any
number here as final.** Icons = per-tier sheet tiles `<color>-gem-<n>` (cut from
`<color>-gems.png`, preloaded + cut in `Game.js`).

## Synthesis progression system (the core idle loop)

The heart of the game. State lives on `inventory.machines` (saved in `Game.js`),
so synthesizers run **on the inventory screen AND during levels**. The tunable
knobs are at the top of `InventoryMenu.js` (`GEN_SECONDS`, `IDLE_FUEL_PER_TIER`,
`LEVEL_GEMS`) and in `Item.js` (`HOURGLASS_FUEL`, `BURST_SECONDS`) — the values
are a rough first pass. **The progression philosophy + the math behind every
ratio + the open calibration decisions live in `PROGRESSION.md` — read it before
touching any economy number.** Keep the relationships below; the absolute numbers
are anchors to tune there.

**There is no money.** The whole economy is gems + hourglasses + time.

- **Synthesizers** (`InventoryMenu` → `Synthesis`): one per color (red / blue /
  yellow). Each outputs ITS OWN color's gem. A gem "costs" `GEN_SECONDS` of fuel;
  a higher OUTPUT level costs **2× per level** (bigger gem, ~flat rate).
- **Fuel is tracked in EXACT integer "sub-fuel"** (1 fuel = `FUEL_SCALE` sub-fuel)
  so per-frame accumulation never drifts and `fuel ≥ gemCost` is exact — N
  hourglasses convert to a deterministic gem count, with no floating-point fuzz at
  the boundary (players reason about "this hourglass = N gems"). See `FUEL_SCALE`,
  `_gemCost`, and `PROGRESSION.md`. Machine state: `fuel` (sub-fuel toward next
  gem), `level`/`xp`, `burstLeft`/`burstRate` (the burst reservoir), `loaded`.
- **A synth's fuel/sec = IDLE + BURST (two independent inputs, summed).** There
  is **no passive base rate** — an empty, un-boosted synth makes nothing.
  - **IDLE** = a gem dropped in the slot (persistent, never consumed),
    contributing `tier × IDLE_FUEL_PER_TIER` fuel/sec forever. Optional —
    purely the over-time idle path. **Colour-locked:** a synth only accepts its
    OWN colour as fuel (red gems → red synth), so each colour is an independent
    tree — investing timers/gems into red speeds up only red, never blue/yellow.
    Enforced in `_tryLoad` + the synth-swap branch of `ItemRow.onMouseUp`. (The
    BURST hourglass is colourless and works on any synth — it's the one universal
    accelerator, since it's earned by active play, not colour investment.)
  - **BURST** = an hourglass dropped on it: commits an EXACT chunk of fuel
    (`HOURGLASS_FUEL[tier] × BURST_SECONDS`) to the machine's burst **reservoir**
    (`burstLeft`), drained at the tier's flat rate (`burstRate`) so one hourglass
    burns ~`BURST_SECONDS`, with the fire burn + crackle SFX
    (`engine/CrackleBed.js`) + a countdown. Deposits are **additive & exact** —
    stacking two hourglasses delivers exactly the SUM of their fuel (drained at the
    higher rate). Additive flat fuel, **NOT a multiplier**, so idle + burst tune
    separately.
  - The readout under each slot shows BOTH: idle `N/s`, and the burst `+M/s`
    (the honest tier rate) beside it while burning.
  - A loaded slot also shows a faint always-on **idle smoulder**: tiny sparks at
    the fuel bar's lip so you can see it slowly burning upward (scales mildly with
    gem tier; no audio). See `_emitIdleSpark` / `idleSparks`.
- **Machine leveling.** Each synth has its own output **level** (the tier it
  makes) + an XP bar (the small yellow side bar). Producing `LEVEL_GEMS` (=16, a
  power of two so a level's worth of gems merges all the way up cleanly: 16→8→4→2→1
  with no leftover) levels it up → it then outputs the next tier (shown as
  `T1/T2/…` over the machine), capped at the gem cap. So a machine "matures".
- **Hourglasses — the play→idle bridge.** The ONLY level reward (see Level arc).
  They're the BURST input above. **Mergeable**, and merging is worth MORE than the
  sum (a per-tier bonus on `HOURGLASS_FUEL`) so saving + merging beats using them
  raw. Higher tiers = more fuel/sec (same fixed duration).
- **Bootstrap.** You start with NO gems. The basic shot beats level 1 → earns an
  hourglass → burst a synth to mint your first gem. A plain T1 hourglass is only
  ~½ a gem, so the **first hourglass burned on a save delivers DOUBLE fuel**
  (one-time, tracked by `inventory.firstHourglassBonusUsed` in the save) — a
  doubled T1 = exactly one gem (exact integer math, no margin) — and the rate is
  doubled too, so it still burns in the normal ~`BURST_SECONDS` (not 2× as long).
  No later hourglass is boosted. A SINGLE level-1 clear mints your first gem. From
  there gems can be equipped (weapon/effect), fed back as idle fuel, or merged up.

**Drag interactions — every slot behaves like an inventory slot:** drag a gem
onto an **empty** slot to place / equip / fuel; onto a **matching** gem to
**merge in place** (poof + white flash); onto a **different** gem to **swap**.
Drag a gem **out** of an equip or synth slot back to the bag to retrieve it. A
shared `globals.dragSource` (`inv` / `equip` / `synth`) + `Inventory.clearSource`
route the gem correctly wherever it lands.

- **Equip slots:** `Inventory.equipment = {primary, effect, left, right}`, all
  accepting any gem. The UI (`InventoryMenu` → `Equipment`) has four labelled
  slots flanking the base, plus a **weapon badge** on the base (shape = weapon
  type, color = effect) whose always-on readout shows live damage / fire-rate /
  effect; hovering a helper slot shows that turret's stats. No unlock gates —
  every slot is open (a non-sacrifice unlock may come later). All slots
  saved/restored in `Game.js`.
- **Helper turrets (`Helper.js`):** the `left`/`right` slots each drive a small
  side turret (registered in `Game.js` as `"helper"`, scale 0.38). They take
  only a weapon (no effect gem), **smoothly** swing toward the nearest enemy
  (`slideDirectionTowards`, `TURN_RATE`), and fire at half rate for half damage
  (`FIRE_MULT`/`DAMAGE_MULT` = 0.5 → ~25% each, ~50% together) via
  `weapon.shoot(x,y,dir,{noEffect:true, damageScale:0.5})`. Active only while
  `globals.base.on`. Both share one tint image `base-helper`
  (`Game.js#generateTintedImage`, source-atop wash) so they match each other but
  differ from the main base. The inventory `Equipment` panel mirrors the play
  screen: both helper turrets sit off the bottom corners with their weapon slot
  floating above each one's head (the player's primary/effect slots float above
  the main base, center-bottom).
- **How a shot is built:** the primary gem's `projectile` (from `gemWeapon`) is
  the weapon shape + tier-scaled damage/fire-rate; `Item.shoot` then reads the
  *effect-slot* gem's `effect` and bakes `color` (→ body image + trail),
  `homing`/`homingTurn`/`laserArc` (homing), `chain` (chain), and `aoe`/
  `aoeRadius` (explosive) into the per-shot options. Helpers pass
  `{noEffect:true, damageScale:0.5}` (ignore the effect gem, half damage).
- **Explosive** (red effect) sets `aoe` → on hit `Projectile._explode` damages
  all enemies in `aoeRadius` (damage falls off from the center) + spawns the
  `aoeBlast` particles; on a laser, `_fireLaser` explodes at the beam's end.
- **Chain** (yellow effect) reuses `Enemy.damage`'s lightning path
  (`{type:"lightning", chain, weaken}`) — bolts crackle around each zapped enemy
  and link them. `chain.jumps`/`chain.falloff` come from the gem's tier.
- **Merging** (`Inventory.attemptMerge(a, b)`) checks `a.craft[b.name]` (UI tries
  either drop order); `Item.merges` drives the tooltip's "merge with" icons.

**Where a weapon's pieces live:**
- gem weapon + effect config: `gemWeapon`/`gemEffect`/`buildGems` in `Item.js`
- projectile behavior flags live on each gem's `projectile`: `laser`,
  `laserSight`, `small`, `alternate`, `scaleDown`, `speed`=fire-rate, `damage`.
  Per-shot `color`/`homing`/`chain`/`aoe` come from the *effect* gem.
- runtime: `Projectile.js` (movement/homing/laser/chain/explode) +
  `effects/Laser.js` (beam) + `effects/Particle Effects.js` (`aoeBlast`,
  `deathBurst`) + `Enemy.js` (chain) + `Base.js`/`Helper.js` (firing)
- **icons**: gem icons are the per-tier sheet tiles `<color>-gem-<n>` (cut in
  `Game.js`); projectile bodies are `<color>-part-circle` (also `Game.js`).
- **save version:** breaking item-model / synth changes bump `SaveStore.VERSION`
  (currently **10**) so old saves are dropped on load.

## Level arc (`Levels.js` + `Spawner.js`)
`Levels.list` is a ROUGH first-pass ramp (counts/hp/spawnRate) — **not carefully
balanced**, pending the progression pass. **No money** — the ONLY reward for
clearing a level is an **hourglass** (`reward`/`chance:100`), and **level N
drops a tier-N hourglass** so progressing to a higher level beats grinding a low
one (the hourglass feeds the synths — see Synthesis). Level 1 is tuned beatable
with just the basic shot. Press **Esc** to bail out of a level back to the menu.
Boss HP is per-level (`bossHp`); the green boss is beatable, the **purple (last)
level is intentionally unbeatable**. Enemies spray a colored **`deathBurst`** on
death (no more cash pickups).

## Environment detection (dev vs prod) — and the dev cheats

`engine.dev` (in `GameEngine.js` constructor) is **true** when host is
`localhost`/`127.0.0.1` **OR** the path's first segment ends in `.dev` (the
dojo serves the dev build at `/base.dev/`; prod is `/base/`; an installable
subdomain serves prod at `/`). `engine.prod === !engine.dev`.

Everyone (dev + prod) starts the same: **no gems, nothing equipped** (the basic
shot carries level 1). Dev perks keyed off `engine.dev`:
- **Cheat button** in the Settings screen (the cog → settings; dev-only) grants a
  full row (8) of tier-5 hourglasses via `Inventory.cheat()` — burn them into
  whatever gems you want to test; **repeatable**, and it closes settings + opens
  the inventory so you see them.
- `Game.js`: **music auto-plays only in `prod`**; in dev press **`m`** to start it
  (kept quiet by default while developing).
- Tutorial code has been **stripped** (a new onboarding will come later).

⚠️ **Dev and prod share one save.** localStorage is keyed by **origin**, not
path, so `/base/` and `/base.dev/` (both `dojo.whipple.ninja`) read/write the
same `base-command:save`. Cheating in dev can bleed a cheated save into prod.
Not yet namespaced — flag/offer to fix if it bites.

## Docs in this repo — what's real vs aspirational

- **`PROGRESSION.md`** is the CURRENT design philosophy + economy math: the two
  loops (idle synthesis ↔ active combat), every formula and exchange rate, the
  tensions, and the open calibration decisions (with numeric options). This is
  the source of truth for *why* the numbers are what they are — update it when
  you change a curve.
- **`PLAN.md`** is the ORIGINAL grand design (gem tiers/classes Alpha/Beta/
  Omega, synthesizers, multiple equip slots: Focus/Battery/Power Core/Shield/
  Drone, furnace, recipe logbook…). The **shipped game is far simpler**: gems
  merge into weapons, one `primary` equip slot, level select, a shooting base.
  Treat PLAN.md as direction, not a description of current state.
- **`README.md` / `release.sh`** — legacy GitHub-Pages deploy (see above).
- **`TODO.md`** — empty.

## Conventions / gotchas

- **No build, no deps.** Don't add a bundler/npm unless asked; the whole point
  is edit-and-reload. ES module imports use explicit `.js` paths.
- **Everything is a registered `GameObject`** drawn by z-order; to add a thing
  on screen, `engine.register(obj, "optionalCollection")` and give it
  `update()` / `draw(ctx)` / a `z`.
- **Cross-object state lives in `engine.globals`**; cross-object signals go
  through `engine.on/trigger`. Persisted state must be added to BOTH
  `_snapshot()` and `_restoreSave()` in `Game.js`.
- **Verifying changes headless:** there's no test suite. To smoke-test, serve
  the folder and drive `chrome-headless-shell` (in `~/.cache/ms-playwright/…`)
  over the DevTools Protocol — Node 22 has a global `WebSocket`. A page-context
  `import('…/gameObjects/Item.js')` lets you assert the craft tree directly.
- **`node --check <file>.js`** catches syntax errors fast before reloading.
