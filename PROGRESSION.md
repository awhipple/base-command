# Progression & Economy — design philosophy

> **Status: living design doc.** The *relationships* here are the spine and
> should stay stable; the *absolute anchor numbers* are first-pass and meant to
> be tuned over time. When you change a constant, change it here too (or change
> it here first, then push it into code). Code knobs live at the top of
> `gameObjects/ui/InventoryMenu.js` (`GEN_SECONDS`, `IDLE_FUEL_BY_TIER`,
> `LEVEL_GEMS`), in `gameObjects/Item.js` (`HOURGLASS_FUEL`, `BURST_SECONDS`,
> `gemWeapon`/`gemEffect`), and in `gameObjects/Levels.js` (per-level
> `enemies`/`enemyHp`/`spawnRate`). See `CLAUDE.md` § "Synthesis progression
> system" for the mechanical wiring; this doc is the *why* and the *math*.

This is an **idle game with an active accelerator**. There is no money — the
entire economy is **gems**, **hourglasses**, and **time**. Two loops feed each
other, and the whole job of this doc is to make their relationship deliberate.

---

## 1. The two loops

**IDLE — synthesis (the slow river).**
You load a **fuel gem** into a synth; it slowly mints gems on its own, forever.
This is the source of your gem stockpile and runs both on the inventory screen
*and* during levels.

**ACTIVE — combat (the paddle).**
You equip your best gems and beat a level (a short burst of play). The *only*
reward is an **hourglass**, which you burn on a synth for a big slug of fuel —
i.e. active play accelerates the idle river.

Neither loop is self-sufficient, by design:

- You can't idle from a cold start — an empty synth makes **nothing** (no base
  rate). Your first gem must come from beating level 1 → hourglass → burst.
- You can't fight without gems — all combat power is in the equipped gem.

So the intended player rhythm is: **fight a little to seed and accelerate the
plant, idle to grow the plant, spend the harvest on better gear to fight
higher.** Everything below is about keeping those exchange rates sane.

---

## 2. The idle model (synthesis math)

A synth charges by `fuelPerSec` and pops one gem each time its bar fills.

```
time per gem      = GEN_SECONDS × 2^(L-1) / fuelPerSec          [seconds]
fuelPerSec        = idle + burst
idle              = IDLE_FUEL_BY_TIER[fuelGemTier]             [persistent, per-tier table]
burst             = hourglass flat rate, for BURST_SECONDS only [one-shot]
```

- `L` = the synth's own **output level** (the gem tier it currently mints).
- Every `levelGems(L)` (=16, except 17 at L5 — see §2a) gems minted, the synth
  **levels up**: it then mints a one-tier-bigger gem but each gem costs **2× more
  fuel** (`2^(L-1)`). So at a fixed fuel rate, *fuel-value throughput stays flat* —
  you don't get faster, you graduate to rarer, bigger gems. The core idle curve,
  continuing indefinitely (capped at the tier cap). **16 is a power of two** so a
  *single* level's batch merges all the way up cleanly (16→8→4→2→1) to one gem four
  tiers higher — but see §2a for the cross-level catch and why L5 is the exception.
- **Exact integer accounting:** fuel is tracked in integer "sub-fuel" (1 fuel =
  `FUEL_SCALE`=60 sub-fuel) and a gem costs an integer number of sub-fuel, so
  `fuel ≥ cost` is exact. Each burned hourglass is its own EXACT `rate ×
  BURST_SECONDS` chunk; they queue (highest fuel/s burns first, the rest wait their
  turn) and each drains at its tier rate. ⇒ N hourglasses convert to a
  *deterministic* gem count, with no floating-point fuzz at the boundary (players
  reason about hourglass→gems).

**Current anchors:** `GEN_SECONDS=60`, `LEVEL_GEMS=16` (17 at L5 — §2a), `FUEL_SCALE=60`,
and the idle rate is now a **hand-tuned per-tier table** (replaced the old `tier × 0.5`):
`IDLE_FUEL_BY_TIER = [0.5, 1.1, 1.8, 2.6, 3.5, 4.5, 5.6, 6.8, 8.1, 10.0]` fuel/s for T1…T10
(jumps grow 0.6, 0.7, 0.8 … 1.3; T10 rounded up to a clean 10.0).

> ⚠ The idle curve changed from linear `tier × 0.5` to the accelerating table above.
> The idle-time figures in the rest of this section were derived from the **old** linear
> rate and need a recompute against the table (the formula is still the source of truth).

Derived quantities (the formulas are the source of truth; idle pace is **being
actively tuned**, so compute headline times from the formula rather than trusting
any baked-in table):

```
fuel to mint one tier-L gem    = GEN_SECONDS × 2^(L-1)                        = 60 × 2^(L-1)
fuel to level a synth once     = LEVEL_GEMS × GEN_SECONDS × 2^(L-1)           = 960 × 2^(L-1)
idle seconds per synth level   = LEVEL_GEMS × GEN_SECONDS × 2^(L-1) / IDLE_FUEL_BY_TIER[F]
   (F = loaded fuel-gem tier)  = 960 × 2^(L-1) / IDLE_FUEL_BY_TIER[F]   (rate no longer linear in F)
```

**At the current anchors** (T1 idle = `0.5`/s): first synth tier-up (T1 fuel gem,
idle only) ≈ **32 min** (T1 rate unchanged); growing one synth all the way to T10
≈ **~272 h pure passive** (leave a T1 gem in) — but the **reinvest** path (feed
ever-higher fuel, F≈L) is now **faster than the old ~36 h** because T2…T10 rates
were raised to `IDLE_FUEL_BY_TIER` (recompute against the table). Lowering the whole
table slows these; raising it speeds them.

**The fuel gem is the idle skill knob.** Rate ∝ fuel tier, so keeping your fuel
gem current (reinvesting harvested gems back into the slot) roughly quarters the
total grind versus leaving a tier-1 gem in. That's a real, ongoing choice the
player makes with every gem: *equip it, merge it for gear, or feed it back as
fuel?* (Merging is 2:1, so the gem economy is genuinely split three ways.)

**Three synths, three independent trees (colour-locked fuel).** Red/blue/yellow
each have their own track, and **a synth only accepts its own colour as fuel** —
red gems fuel the red synth, etc. You cannot pour a maxed red gem into the blue
synth to leapfrog it; time/gems invested in red speed up *only* red. One colour's
gems serve as its weapon **and** its effect **and** its helper ammo, so fully
maturing *one* synth ≈ one complete build; branching into a second colour is a
fresh ~36–272 h river you climb from the bottom. (Hourglasses are the deliberate
exception — colourless, earned by active play, usable on any synth.)

### 2a — The no-straggler rule (why L5 mints 17)

`LEVEL_GEMS` is **per-level** (`{ 5: 17 }`, default 16), and that single override is
load-bearing. The problem it solves:

A level's batch of 16 same-tier gems merges cleanly to **one** gem four tiers up
(16 × Tn → 1 × T(n+4)). But across levels those results land at *different* tiers —
L1→T5, L2→T6, L3→T7, … — so they never pair with **each other**. With every level
at 16 you're left with one lone gem at each of T5, T6, T7, T8, T9 that can never
merge away (plus a stack of T10s). Equivalently: the lifetime fuel-value of levels
1–9 is `16 × (2⁰+…+2⁸) = 8176`, which **isn't a power of two** — so it can't collapse
to a single gem; it decomposes into one straggler per set bit (T5…T9). The lowest,
a lone **T5**, is the leak you notice first.

**Fix: L5 mints 17, not 16.** That one extra T5 pairs with L1's leftover T5 and
cascades all the way up (T5→T6→T7→T8→T9→T10), zeroing every straggler at once. It
also lands the running total on an exact power of two — `512` (= one T10) — right at
L5, after which each later level's 16-gem batch *equals the running total*, so it
simply **doubles** it and stays a clean power of two forever. The machine's whole
lifetime output then collapses to **pure T10**, with no low-tier leftovers, at every
level boundary from 5 on. (Merge sim — gems left after merging the lifetime output
maximally:)

| Config | after L4 | L5 | L6 | L7 | L8 | L9 |
|---|---|---|---|---|---|---|
| all 16 (old) | T5–T8 leftover | +T9 | 1×T10 + T5–T9 | 3×T10 + T5–T9 | 7×T10 + T5–T9 | **15×T10 + T5–T9 forever** |
| **L5=17** | T5–T8 (transient) | **1×T10, clean** | 2×T10 | 4×T10 | 8×T10 | **16×T10, clean** |
| L5=17 **and** L7=17 | — | clean | clean | **re-adds a lone T7** | +T7 | +T7 |

**Only L5.** A 17th gem at any *other* level pushes the total back off a power of two
and re-introduces a straggler (e.g. L7=17 leaves a lone T7 — last row, verified by
sim). Retune via the `LEVEL_GEMS` table at the top of `InventoryMenu.js`, not the
default.

Caveat: this is a *level-boundary* guarantee. Mid-level (partway through a batch)
you'll always see a transient straggler or two; they zero out as each level
completes. And it governs the synth's **own output** — gems you equip / load as fuel
/ burn out of the pool are your spend, not a leak.

---

## 3. The active model (combat math)

Combat power is the **product of several independent axes**, each ticking up at
its own cadence. That is the whole trick behind *gradual* progression: no single
upgrade flips a level from impossible to trivial. Your power creeps up as the
factors advance at different rates, so you're perpetually "almost able to clear
the next level" — grind or idle a little, tip over. **Levels gate on your
*cumulative* power, never on one specific gem.** (Base `power`/`speed` stats are
pinned at 1 — money-denominated upgrades are gone; dead track, see Tension C.)

```
total DPS = weaponBase(type) × tierPower(mainTier) × effectMult × helperFactor
```

| Axis | What it is | Range | Ticks up… |
|---|---|---|---|
| **weaponBase** | weapon TYPE — fire rate + behaviour (fixed per colour) | — | never (you pick a colour) |
| **tierPower** | main gem tier → **damage**, on a *decelerating* curve | 1 → ~6.5 | rarely (merges are 2:1) |
| **effectMult** | effect gem (and its tier) | ×0.5 … ×3 | occasionally |
| **helperFactor** | two side turrets, each 50% | ×1 → ×2 | as spare gems accrue |

**Vertical — tierPower drops off on purpose.** Tier raises *damage* on a
diminishing curve; **fire rate is a fixed trait of the weapon type** (stinger
fast, laser slow), so tier drives damage only. The readout should show **DPS**
(`dmg × rate`) so a slow-hard laser and a fast-soft stinger compare honestly —
this also fixes the "6 (−3)" confusion (a stinger's low per-hit number hides its
high rate).

| Tier | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| tierPower | 1.0 | 1.45 | 1.9 | 2.4 | 2.9 | 3.5 | 4.1 | 4.8 | 5.5 | ~6.5 |

(per-tier ratio fades ~1.45 → ~1.15.) The deliberate mismatch with the economy:
a tier-n gem **costs** `2^(n-1)` to build (the river doubles every tier, §2) but
only **hits** ~`tierPower(n)` harder — a T10 is **512× the cost for ~6.5× the
punch**. Going deep is an intentionally poor *raw* deal, which is exactly what
pushes you to **go wide**.

**Horizontal — effects + helpers are the width that pays for the drop-off.**
- **Effect gem** multiplies the shot: homing ×1.5 → ×3 (single-target focus);
  explosive & chain pay off ×N against clusters; its own tiered axis.
- **Helpers** — two side turrets, each **50% effectiveness: FULL damage, HALF
  rate** (same DPS as half/half, but fewer shots cluttering the screen — the shots
  on screen should read as *yours*). Both kitted = **+100%, i.e. double your
  output** — but each needs its *own* weapon + effect gems (4 extra builds), so
  helpers come online mid-game as the stockpile grows. No hard unlock; early gem
  scarcity is the gate.

Maxed, the axes stack to ≈ `tierPower(10) × effect × helpers ≈ 6.5 × 3 × 2 ≈ 40×`
a bare T1 weapon — but reached through **~a dozen small upgrades**, not ten tier
cliffs. Early game = one ~1× weapon; late game = deep main + strong effect + two
kitted helpers, all multiplying.

**Levels — smooth ramp, gated on cumulative power.** The difficulty knob is
**incoming HP/sec = `enemyHp / spawnRate`** — the sustained DPS you must beat
(enemies fall at ~60px/s, a ~12–15 s buffer for stragglers). The ramp is a
**geometric curve** (~×1.8–2 / level) sitting just *above* the power you're
expected to hold, so each level is a near-miss you close with a couple of
incremental upgrades — **no spikes** (the old 999-HP level-7 wall is deleted).
Exact `enemyHp`/`spawnRate` get computed from the finalized `tierPower` constants
at translation time; the shape, with each level leaning on a *different* axis
coming online:

| Level | incoming HP/s | expected build leaning | hourglass |
|---|---|---|---|
| 1 | base | bare weapon | T1 |
| 2 | ×~1.9 | T2–3 weapon | T2 |
| 3 | ×~1.9 | + an effect gem | T3 |
| 4 | ×~1.9 | + first helper | T4 |
| 5 | ×~1.9 | + second helper (≈2× output) | T5 |
| 6 | ×~1.9 | deeper tier / better effect | T6 |
| 7 | ×~1.9 | near-maxed width **and** tier | T7 |

Because consecutive levels lean on *different* advancing axes, the climb reads as
steady tightening rather than "get gem N → unlock level N."

---

## 4. The hourglass bridge (where the loops meet)

An hourglass adds its own EXACT burn — `HOURGLASS_FUEL[tier] × BURST_SECONDS` of
fuel, drained at the tier's flat rate over ~`BURST_SECONDS` — to the synth's burn
**queue**. Burns are **additive, not a multiplier** (so idle and burst tune
independently): stacked hourglasses run one at a time, **highest fuel/s first**
(a big cell you drop preempts a small one still burning, which then resumes), so
the total fuel is exactly the sum and the total time is the sum of the durations.
The key exchange rate:

```
total fuel per hourglass(N)   = HOURGLASS_FUEL[N-1] × BURST_SECONDS
clears of level N per synth-levelup(L) = (960 × 2^(L-1)) / (HOURGLASS_FUEL[N-1] × BURST_SECONDS)
```

**Current `HOURGLASS_FUEL = [6,14,32,70,150,320,680]`, `BURST_SECONDS=5`** works
out to **~30 clears of a matched-tier level per synth-levelup** — and since you
can only beat levels *below* your gear, in practice more. That makes the active
path a weak top-up that fades to irrelevance at high tiers. This is the main
thing the philosophy wants to fix (see Decision 2).

Handy closed form for setting it: to make **C clears = one tier** when the
hourglass tier matches the synth level,
```
HOURGLASS_FUEL[N-1] = (GEN_SECONDS × LEVEL_GEMS) / (C × BURST_SECONDS) × 2^(N-1)
                    = (192 / C) × 2^(N-1)         [with current GEN_SECONDS, LEVEL_GEMS, BURST_SECONDS]
```

---

## 5. Philosophy (the pillars)

1. **Idle is the slow river; active is the paddle.** You always progress while
   idling, but hands-on play is a *meaningful, consistent* multiplier at **every**
   tier — not a low-level crutch that fades.
2. **One unit of progress = one synth tier.** Express every cost in these terms:
   idle-time-per-tier, clears-per-tier, gear-per-tier.
3. **Doubling is the spine of the *economy* — but combat power deliberately is
   not.** Gem value, fuel cost, idle-time, and hourglass fuel all ×2 per tier
   (the *cost* side). A gem's *raw damage*, though, climbs on a **decelerating**
   curve (`tierPower`, §3), so a deep tier is a poor raw deal — the gap is meant
   to be closed by **going wide** (effects + two helpers), not just deep.
4. **Idle should be *long* and reinvestment should be the lever.** Pure passive
   is deliberately slow (tens of hours); paying attention to your fuel gem (and
   spending hourglasses) is how you earn speed. We don't want a synth that mines
   itself effortlessly.
5. **Every gem is a three-way choice** — equip / merge-for-gear / feed-as-fuel —
   drawing from one stockpile. That tension is the core decision loop.
6. **Each colour is its own tree.** Fuel is colour-locked, so progress in one
   colour never subsidizes another. Going wide (three builds) is a real,
   separate investment, not something you buy with a single maxed gem.
7. **Power is multiplicative across many small axes ⇒ gradual, never gated.**
   Main tier, effect, and two helper kits all multiply and advance at *different*
   cadences, so total power creeps up in small steps. No single gem flips a level
   from impossible to trivial — you grind toward "good enough," and each level is
   a near-miss you close from whichever axis is next to tick over.

---

## 6. Tensions to resolve

**A. Gear runs ahead of the level you can clear.** The gap is +1 tier at level 2
and widens to +5 by level 5, so the hourglass you win (tier N) always lags the
gems you needed to win it. Either embrace it (use a strong colour's clears to
bootstrap a weak colour's synth) or flatten enemy HP so gear ≈ level. → Decision 4.

**B. Hourglasses fade vs. idle.** As above — currently ~30 clears per tier and
worse in practice. → Decision 2.

**C. `power`/`speed` upgrades are vestigial.** With money gone they're stuck at 1.
Options: leave combat power gem-only (simplest, current de-facto), or repurpose
the stat track as a **gem/hourglass sink** (a second spend for your harvest).
Recommendation: keep gem-only for now; revisit once the core loop feels right.

**D. Dev/prod share one save** (origin-keyed localStorage). Out of scope for
balance but worth remembering when testing curve changes — cheated dev saves
bleed into prod. (Noted in `CLAUDE.md`.)

---

## 7. Open calibration decisions

The relationships above are settled; these four anchor numbers are taste, and
they cascade through the whole economy. Each is written with options + the
concrete numeric consequence, and a leaning to argue against.

### Decision 1 — Idle pace anchor
**How long should the FIRST synth tier-up take** (basic T1 fuel gem, idle only,
no hourglasses)? Everything doubles from this anchor. Lever: `GEN_SECONDS` and the
**T1 entry** of `IDLE_FUEL_BY_TIER` (still `0.5`/s, so the first-tier-up figure below is
unchanged; but T2…T10 were raised to the accelerating table, so the *reinvest* column —
which climbs through higher fuel tiers — now resolves faster and needs a recompute).

| Option | First tier-up | Max one synth (passive / reinvest) | Feel |
|---|---|---|---|
| **~32 min (current: T1 idle = 0.5/s)** | 32 m | ~272 h / **faster than ~36 h** (table) | long idle commitment |
| ~64 min (T1 idle = 0.25) | 64 m | ~545 h / ~72 h | very long |
| ~16 min (T1 idle = 1) | 16 m | ~136 h / ~18 h | moderate / idle-forward |

*Leaning: TBD — idle pace is being actively tuned.* The idle rate is now the per-tier
`IDLE_FUEL_BY_TIER` table (T1 history: walked 2 → 1 → 0.25 → 0.5); the higher tiers were
bumped to an accelerating ramp, which speeds the reinvest path. Long river per pillar 4;
revisit alongside Decision 2.

### Decision 2 — Active accelerator strength
**How many clears of a level should equal one synth tier-up of fuel?** Lever:
`HOURGLASS_FUEL` (use the closed form in §4).

| Option | `HOURGLASS_FUEL` | Meaning |
|---|---|---|
| **~4 clears** | `[48,96,192,384,768,1536,3072]` | active strongly accelerates; a short combat session clearly beats waiting |
| ~8 clears | `[24,48,96,192,384,768,1536]` | balanced; idle still the backbone |
| ~16 clears | `[12,24,48,96,192,384,768]` | idle-dominant; hourglasses a minor top-up |

*Leaning: ~4–8.* Current `[6,14,32,70,150,320,680]` ≈ ~30 clears — the paddle is
nearly useless; pillar 1 wants it to matter at every tier. Lean 4 if combat
should feel central, 8 if idle should clearly lead.

### Decision 3 — Active session length
**Target time to beat a typical mid-game level.** Lever: per-level `enemies` ×
`enemyHp` vs. achievable DPS, and `spawnRate`.

| Option | Feel |
|---|---|
| **~20–30 s** | satisfying short burst; long enough to use the weapon, short enough to re-run for hourglasses |
| ~10 s | snappy; quick taps between idling |
| ~45–60 s | meatier; leans tower-defense over idle |

*Leaning: ~20–30 s.* Re-runnable without becoming a chore.

### Decision 4 — Gear gating (resolves Tension A)
**How hard should levels gate on gem tier?** Lever: `enemyHp` curve in
`Levels.js`.

**Resolved in principle by the §3 model** — levels gate on *cumulative* power
(tier × effect × helpers), not a single gem, and ramp smoothly so gear ≈ level.

| Option | Consequence |
|---|---|
| **Retune so cumulative power ≈ level N** *(chosen)* | level N beatable with the build you'd hold by then → the tier-N hourglass it drops *matches* your progress; clears-per-tier math (Decision 2) stays clean. Set `enemyHp ≈ 1.5 × expectedDPS(level N) × spawnRate`, where `expectedDPS = weaponBase × tierPower(t) × effectMult × helperFactor` for the §3 "expected build" at that level. Requires deleting the 999-HP L7 spike. |
| Keep gear ahead of level | old behaviour; levels demanded gear 2–5 tiers above, so hourglasses lagged gear and read best as **cross-colour bootstrap fuel**. |

*Chosen: cumulative power ≈ level.* Makes the system legible — "I can clear level
N, so I farm tier-N hourglasses to push my tier-N synth" — exchange rates in §4
become exact, and the climb stays gradual (pillar 7).

---

## 8. Worked example — the cold-start bootstrap (current anchors)

1. **Empty everything.** Synths make nothing; you have the basic 1-dmg shot.
2. **Beat level 1** (3 × 2 HP, ~5 s) → a **T1 hourglass**.
3. **Burst a synth (your choice of colour):** a plain T1 hourglass is only ~½ a
   gem, so the **first hourglass burned on the save delivers DOUBLE fuel at DOUBLE
   rate** (a one-time flag, `firstHourglassBonusUsed`). Doubled T1 = exactly 60
   fuel = one gem (exact integer math, no margin — see `Synthesis.burn`, which
   doubles the rate; fuel = rate × seconds, so that doubles the fuel too), and the
   doubled rate means it lands in the normal ~5 s (not ~10 s). So a **single**
   level-1 clear yields your first gem.
4. **Load it as fuel** (T1 idle = 0.5/s — see `IDLE_FUEL_BY_TIER`) — that colour's
   river starts: a gem every ~2 min. The one-time bonus is now spent; every later
   hourglass is normal.
5. From here every gem is a choice: **equip** it (weapon/effect to clear level 2),
   **merge** two for a tier-2, or **feed** a higher gem back as fuel to speed the
   river. Beating level 2 now yields **T2 hourglasses** — bigger bursts — and the
   loop compounds.

> The double bonus is a *one-time* bootstrap tied to the save (a fresh save re-
> arms it). It's independent of Decision 2, which sets the strength of every
> *normal* hourglass.
