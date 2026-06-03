# Progression & Economy — design philosophy

> **Status: living design doc.** The *relationships* here are the spine and
> should stay stable; the *absolute anchor numbers* are first-pass and meant to
> be tuned over time. When you change a constant, change it here too (or change
> it here first, then push it into code). Code knobs live at the top of
> `gameObjects/ui/InventoryMenu.js` (`GEN_SECONDS`, `IDLE_FUEL_PER_TIER`,
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
idle              = fuelGemTier × IDLE_FUEL_PER_TIER            [persistent]
burst             = hourglass flat rate, for BURST_SECONDS only [one-shot]
```

- `L` = the synth's own **output level** (the gem tier it currently mints).
- Every `LEVEL_GEMS` (=16) gems minted, the synth **levels up**: it then mints a
  one-tier-bigger gem but each gem costs **2× more fuel** (`2^(L-1)`). So at a
  fixed fuel rate, *fuel-value throughput stays flat* — you don't get faster,
  you graduate to rarer, bigger gems. (16 is a power of two so a level's worth of
  gems merges all the way up cleanly — 16→8→4→2→1 — with no leftover tier.) The
  core idle curve, continuing indefinitely (capped at the tier cap).
- **Exact integer accounting:** fuel is tracked in integer "sub-fuel" (1 fuel =
  `FUEL_SCALE`=60 sub-fuel) and a gem costs an integer number of sub-fuel, so
  `fuel ≥ cost` is exact. A burst commits an EXACT chunk to a reservoir, drained
  at its tier rate. ⇒ N hourglasses convert to a *deterministic* gem count, with
  no floating-point fuzz at the boundary (players reason about hourglass→gems).

**Current anchors:** `GEN_SECONDS=60`, `IDLE_FUEL_PER_TIER=2`, `LEVEL_GEMS=16`, `FUEL_SCALE=60`.

Two derived quantities everything else references:

```
fuel to mint one tier-L gem   = GEN_SECONDS × 2^(L-1)        = 60 × 2^(L-1)
fuel to level a synth once    = LEVEL_GEMS × GEN_SECONDS × 2^(L-1) = 960 × 2^(L-1)
```

**Idle-only time to grow ONE synth T1 → T10** (`= 480/F × 2^(L-1)` per level,
with current anchors):

| Fuel-gem strategy | T1→2 | T2→3 | T3→4 | T4→5 | T5→6 | T6→7 | T7→8 | T8→9 | T9→10 | **Total** |
|---|---|---|---|---|---|---|---|---|---|---|
| Leave a T1 gem in (pure passive, F=1) | 8 m | 16 m | 32 m | 64 m | 2.1 h | 4.3 h | 8.5 h | 17 h | 34 h | **~68 h** |
| Reinvest harvest as fuel (F≈L) | 8 m | 8 m | 11 m | 16 m | 26 m | 43 m | 73 m | 128 m | 228 m | **~9 h** |

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
fresh ~9–68 h river you climb from the bottom. (Hourglasses are the deliberate
exception — colourless, earned by active play, usable on any synth.)

---

## 3. The active model (combat math)

All combat power currently comes from the equipped gem. (Base `power`/`speed`
stats are pinned at 1 — their upgrade costs were denominated in money, which is
gone, so **that stat track is presently dead code**; see Tension C.)

```
shots/sec   = speed.val(1) × projectile.speed
dmg/shot    = power.val(1) × projectile.damage × effectMult × helperScale
gemWeapon   : damage = base × tier,  fireRate = base × (1 + 0.5(tier-1))
              red(ball) base dmg 1.0 / rate 1.0
              blue(stinger) 0.6 / 2.0   (fast, small)
              yellow(laser) 1.5 / 0.9   (hitscan)
```

**Single-target DPS by tier** (≈ `0.5·tier² + 0.5·tier` for red; blue/yellow are
within ~±20%, trading rate vs. hitscan):

| Tier | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Red DPS | 1 | 3 | 6 | 10 | 15 | 21 | 28 | 36 | 45 | 55 |

Modifiers: **two helpers ≈ +50%** of main DPS (each ¼, same-tier ammo); **effects
multiply situationally** — explosive (AOE) and chain pay off vs. clusters (×3–5
on packs), homing adds +5%/tier plus reliability. So DPS scales **~quadratically
with tier**, and effects can multiply it again against groups.

**The level difficulty knob is incoming HP/sec = `enemyHp / spawnRate`** — the
sustained DPS you must beat (enemies also fall at 60px/s, giving a ~12–15 s
travel buffer for stragglers). Current ramp:

| Level | enemies × HP | spawnRate | **HP/s incoming** | Gear (red + helpers) to clear | Hourglass dropped |
|---|---|---|---|---|---|
| 1 | 3 × 2 | 1.6 s | 1.25 | basic shot | T1 |
| 2 | 8 × 8 | 1.2 s | 6.7 | ~tier 3 | T2 |
| 3 | 10 × 18 | 1.0 s | 18 | ~tier 5 | T3 |
| 4 | 12 × 32 | 0.9 s | 36 | ~tier 7 | T4 |
| 5 | 14 × 55 (red, splits) | 0.8 s | 69 | ~tier 10 + AOE | T5 |
| 6 | 16 × 80 + boss 1000 | 0.9 s | 89 + boss | ~tier 10 + effects | T6 |
| 7 | 25 × 999 + boss | 0.75 s | 1332 | intentionally unbeatable | T7 |

---

## 4. The hourglass bridge (where the loops meet)

An hourglass commits an EXACT chunk of fuel — `HOURGLASS_FUEL[tier] ×
BURST_SECONDS` — to the synth's burst reservoir, drained at the tier's flat rate.
Deposits are **additive, not a multiplier** (so idle and burst tune
independently), and stacking is exactly the sum. The key exchange rate:

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
3. **Doubling is the spine.** Gem value, fuel cost, and idle-time all ×2 per
   tier; hourglass fuel should ×2 per tier too, so the paddle keeps pace with the
   river instead of falling behind.
4. **Idle should be *long* and reinvestment should be the lever.** Pure passive
   is deliberately slow (tens of hours); paying attention to your fuel gem (and
   spending hourglasses) is how you earn speed. We don't want a synth that mines
   itself effortlessly.
5. **Every gem is a three-way choice** — equip / merge-for-gear / feed-as-fuel —
   drawing from one stockpile. That tension is the core decision loop.
6. **Each colour is its own tree.** Fuel is colour-locked, so progress in one
   colour never subsidizes another. Going wide (three builds) is a real,
   separate investment, not something you buy with a single maxed gem.

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
no hourglasses)? Everything doubles from this anchor. Lever: `GEN_SECONDS` /
`IDLE_FUEL_PER_TIER`.

| Option | First tier-up | Max one synth (passive / reinvest) | Feel |
|---|---|---|---|
| **~8 min (current, at LEVEL_GEMS=16)** | 8 m | ~68 h / ~9 h | multi-session commitment |
| ~5 min | 5 m | ~43 h / ~5.5 h | generous, idle-forward |
| ~12 min | 12 m | ~100 h / ~13 h | grindy; idle time feels precious |

*Leaning: keep ~8 min for now.* Long river per pillar 4; revisit alongside
Decision 2 (note the first tier-up grew from 5→8 min when LEVEL_GEMS went 10→16).

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

| Option | Consequence |
|---|---|
| **Retune so gear ≈ level N** | level N beatable with ~tier-N gems → the tier-N hourglass it drops *matches* your gear; clears-per-tier math (Decision 2) stays clean. Requires lowering high-level HP. Set `enemyHp ≈ 1.5 × DPS(tier N) × spawnRate`. |
| Keep gear ahead of level | current; levels demand gear 2–5 tiers above, so hourglasses lag gear and read best as **cross-colour bootstrap fuel** (pump a mature colour's hourglasses into a fresh colour's synth). |

*Leaning: retune to gear ≈ level.* It makes the whole system legible — "I can
clear level N, so I farm tier-N hourglasses to push my tier-N synth" — and the
exchange rates in §4 become exact instead of effective-worse.

---

## 8. Worked example — the cold-start bootstrap (current anchors)

1. **Empty everything.** Synths make nothing; you have the basic 1-dmg shot.
2. **Beat level 1** (3 × 2 HP, ~5 s) → a **T1 hourglass**.
3. **Burst a synth (your choice of colour):** a plain T1 hourglass is only ~½ a
   gem, so the **first hourglass burned on the save delivers DOUBLE fuel at DOUBLE
   rate** (a one-time flag, `firstHourglassBonusUsed`). Doubled T1 = exactly 60
   fuel = one gem (exact integer math, no margin — see `_tryBoost`), and the
   doubled rate means it lands in the normal ~5 s (not ~10 s). So a **single**
   level-1 clear yields your first gem.
4. **Load it as fuel** (idle = 2/s) — that colour's river starts: a gem every
   30 s. The one-time bonus is now spent; every later hourglass is normal.
5. From here every gem is a choice: **equip** it (weapon/effect to clear level 2),
   **merge** two for a tier-2, or **feed** a higher gem back as fuel to speed the
   river. Beating level 2 now yields **T2 hourglasses** — bigger bursts — and the
   loop compounds.

> The double bonus is a *one-time* bootstrap tied to the save (a fresh save re-
> arms it). It's independent of Decision 2, which sets the strength of every
> *normal* hourglass.
