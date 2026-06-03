# Implementation status

> Status of this plan vs what's actually shipped, as of 2026-06-02. The design
> notes below are the ORIGINAL vision; the shipped game has since diverged into a
> simpler gem-driven idle loop (see `CLAUDE.md` for how it's actually wired).
> Numbers/ratios are intentionally rough — a **progression-philosophy pass** is
> planned, so the checkboxes track *systems built*, not balance.

**Shipped today:** a shooting Base; levels with enemies + bosses; **3 gem colors
(red/blue/yellow), each both a weapon and an effect, plus fuel**; the synthesis
idle loop (per-color synths with a constant base rate + gem-fuel + machine
leveling); **hourglasses** as the sole level reward + the burn-boost that turns
play into idle progress; drag-to-merge / equip / swap / fuel across inventory,
equip, and synth slots; 4 equip slots (weapon + effect + 2 helper turrets);
save/load; settings (reset + dev cheat); level select; a basic fallback shot.

The economy is now **money-free** (gems + hourglasses + time). The big remaining
work is **(a)** a real progression/balance philosophy, **(b)** the key-unlock /
onboarding arc, and **(c)** combo-color gems & advanced synthesis.

### Synthesis economy
- [x] Per-color synthesizers (red/blue/yellow), each output its color
- [x] Fuel = any gem dropped into a synth (tier = bonus rate) + a constant base
      rate even when empty; fuel gem is persistent (never consumed)
- [x] Machine leveling — synths gain output tiers as they produce (XP bar)
- [x] Hourglasses (from levels) = the boost: burn a synth at a big multiplier for
      a short, particle-laden burst; mergeable with a per-tier bonus
- [x] Money removed — synth fuel is gems/time, not cash
- [ ] Advanced synthesis details / a deliberate rate & cost curve (design pass)

### Gem quality system
- [x] Numbered tiers (10 per color, art tiles from the gem sheets)
- [x] Merge rule: same color + same tier → next tier (cap 10); per-tier scaling
      for both the weapon and the effect role
- [ ] Classes (Alpha / Beta / Omega) — skipped; flat tiers instead for now
- [ ] Combo-color tiers (cross-color merges)

### Color system  *(red/blue/yellow; white gems removed)*
- [x] Red = Ball weapon / Explosive effect
- [x] Blue = Stinger weapon / Homing effect
- [x] Yellow = Laser weapon / Chain effect
- [ ] Combo-color gems (Purple / Green / Orange / Rainbow) from mixing colors

### Equipment slots  *(today: weapon + effect + 2 helper turrets)*
- [x] Primary weapon slot (+ always-on weapon badge readout)
- [x] Effect gem slot (explosive / homing / chain — orthogonal to weapon)
- [x] Two helper-turret slots (weapon only, auto-aim, ~25% each)
- [ ] Power Core slot (attack speed + number of slots, max 3)
- [ ] Shield slot
- [ ] Drone slot

### Progression / unlocks
- [x] Bosses exist (combat); level N rewards a tier-N hourglass
- [x] Slots all open (the sacrifice-to-unlock experiment was removed)
- [ ] Keys granted for beating bosses → spend to unlock features (non-sacrifice)
- [ ] Onboarding arc — tutorial code stripped; a new one comes after the design pass

### Destruction
- [~] Furnace removed for now (no money); a "recycle gem → hourglass" feature may
      take its place later. Gems are discarded by... (no discard yet — TBD)

### Discovery / meta
- [ ] Recipe logbook (track combos found)
- [ ] Gradual reveal of combos

### Reactor-tier arc  *(from the README "ArcPlan")*
- [ ] Difficulty/idle pacing built on reactor tiers
- [ ] Reactor power assigned by clicking a synth, expiring after ~1 min
- [ ] Level clears granting "5× playtime" power (idle + active hybrid economy)

---

#### Start

In this game, you create and merge gems, making them ever more powerful, and equip them in various slots to increase your strength.

To start, the player does not have access to inventory screen. This appears after you play your first level.

You start the first level and kill X enemies. You collect synth fuel from those enemies. When the level is complete (winnable? death?) you go back to the main menu where an interactive tutorial steps you through synthesizing your first gem. See below for details about synthesis.

It then steps you through equipping your first gem in your focus slot. See below for details about the focus slot. The player is then free to continue playing, collecting more synth fuel. After enough is collected for a 2nd gem, another tutorial plays, teaching you how to merge your gems to make a more powerful gem, and highlights the damage increase.

#### Boss

At a certain point (maybe from the start, maybe after X level clears) the player can choose to fight the next boss. Losing to the boss does nothing. Beating the boss grants a key. Keys are used to unlock the next game features. In some cases, you may be given a choice about how to use it.

An interactive tutorial plays again to guide the player to using the key to unlock the next game feature. For the first boss, it will unlock the power core slot. It will then tell you to place a gem in the power core, granting the player synth fuel if you don't already have a gem, or the required synth fuel to make one. Read below for more info about the power core.

#### Gems

Creation of and merging/upgrading gems is the main focus of this game.

Base colors are White, Red, Blue, and Yellow

Possible combo colors are Purple, Green, Orange, and Rainbow.

Gems are then equipped into various gem slots, affecting your base in various ways described below in the Gem Slot sections.

Gem quality is determined by their tier and class. Tiers are numbered in ascending order. Class is demonstrated by a symbol, Alpha, Beta, and Omega. Merging gems increases class by one level, and two Omega gems create a gem of the next tier with Alpha class.

Gems can only be combined with another gem of appropriate color (same or valid combo) and identical tier and class.

White gems are basic and have no special effects.

Red, Blue, and Yellow gems each have some type of effect depending on the slot in question.

Combo gems contain a mixture of the above effects, depending on the gems that went into it.

#### Synthesizing

Gems are created via synthesis. When you start the game you will have a white synthesizer. The white synthesizer creates diamonds (white gems).

To run the synthesizer, you click and hold on it, which pumps your synth fuel into it. Once a critical amount has been pumped in, the synthesizer creates a gem which can be collected by the player.

Other synthesizers match the other basic gem colors, Red, Blue, and Yellow. These are unlocked, perhaps by player choice as the game progresses.

The combo color gems are not created by synthesizers, and are instead created by merging gems of different colors.

### Destruction

There is a furnace, which the player can throw gems into. This will re imburse all the synth fuel that was put into the gem, however the synth fuel will go directly into the synthesizers that made up the gem. In other words, once synth fuel has been pumped into a particular synthesizer, it is essentially locked into that synthesizer.

#### Slots

The slots are where gems are equipped to increase your power. Each slot correlates to a specific effect in the game, and may need to be unlocked before it can be accessed.

Slots may restrict what colors are allowed to be placed inside. This is partially to enable gradual development of the game, but it's possible some slots will only ever allow specific types of gems.

Specific slots are described below.

#### Gem Slot: Focus

The focus determines the damage of your weapon, and the type of shot it emits. The different colors correspond to different shot types, and the damage is equivalent across all gems of identical tier and class.

White - Ball, Blue - Alternating Triangles, ........

#### Gem Slot: Battery

The battery determines the effect of your weapon.

White - N/A, Red: Piercing, Blue: Homing, Yellow: Electric/slow

#### Gem Slot: Power Core

The power core determines your attack speed, and # of focus and battery slots available to use, with a max of 3.

#### Gem Slot: Shield

#### Gem Slot: Drone

#### Advanced Synthesis

Gems (maybe only white) can be equipped into your synthesizers to give you a passive synth rate and to upgrade the tier of gem created by the synthesizer. 

Synths will make better gems out of the gate, but will cost the appropriate amount of synth fuel, so this really just saves player merge time.

#### Forging Unique Gems

There will be unique gems that will go into specific slots and give special effects/weapons/etc. There will be a special interface where multiple gems can be placed into a machine and all combined together.

I intend to slowly reveal to the player the various combos by some mechanic, and have some kind of logbook to keep track of recipes you've found or stumbled across on your own.
