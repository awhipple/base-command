import Item, { HOURGLASS_MAX_TIER, GEM_MAX_TIER } from "./Item.js";

export default class Inventory {
  constructor(engine) {
    this.engine = engine;

    this.items = [];
    // Every slot holds a GEM now. In primary/left/right the gem is a weapon
    // (colour -> type, tier -> damage & fire rate); in effect it augments.
    // All equip slots are open from the start (a non-sacrifice slot-unlock
    // feature may come later).
    this.equipment = {
      primary: null,     // weapon gem (red=ball / blue=stinger / yellow=laser)
      effect: null,      // augment gem (red=explosive / blue=homing / yellow=chain)
      left: null,        // left helper turret weapon gem (~25% output)
      leftEffect: null,  // left helper's own effect gem
      right: null,       // right helper turret weapon gem (~25% output)
      rightEffect: null, // right helper's own effect gem
    };

    // Synthesizer state, keyed by output gem. Each machine holds one fuel gem
    // (`loaded` = {tier, fuel}) and a fill bar (`progress`); it runs passively
    // (inventory + levels) popping its colour. (Unlock gates removed for now —
    // the key-from-boss progression comes later; everything is available.)
    // `level` = the gem tier this machine outputs (starts 1); `xp` = gems made
    // toward the next level (yellow side bar). Leveling up makes a bigger gem but
    // halves the rate, so output stays ~flat — see InventoryMenu update().
    // One synthesizer per colour. Each is fuelled by ANY gem dropped into its slot
    // (the gem stays, providing tier fuel/s) and outputs its own colour's gem.
    // `fuel` = accumulated sub-fuel toward the next gem (integer, exact — see
    // InventoryMenu FUEL_SCALE). `burstQueue` = hourglasses waiting to burn, sorted
    // by rate DESC (highest fuel/s first): each is `{rate, left}` (sub-fuel/frame +
    // sub-fuel remaining); only the head burns, the next takes over when it's spent,
    // and a preempted lower-rate cell resumes later (see Synthesis.burn/update).
    this.machines = {
      redGem:    { loaded: null, fuel: 0, level: 1, xp: 0, burstQueue: [] },
      blueGem:   { loaded: null, fuel: 0, level: 1, xp: 0, burstQueue: [] },
      yellowGem: { loaded: null, fuel: 0, level: 1, xp: 0, burstQueue: [] },
    };

    // One-time starter bonus: the FIRST hourglass burned on this save delivers
    // double fuel (a bare T1 → exactly one gem). Persisted in the save snapshot.
    this.firstHourglassBonusUsed = false;

    // Cold start: NO gems, nothing equipped. Empty synths make NOTHING (no base
    // rate). The basic shot beats level 1 → an hourglass → burned on a synth it
    // mints your first gem. The FIRST hourglass delivers double fuel (one-time;
    // doubled T1 = exactly one gem) so a single level-1 clear is enough (see
    // Synthesis.burn + firstHourglassBonusUsed). Dev grabs test gems via
    // the Cheat button.
    this.sort();
  }

  sort() {
    this.items = this.items.filter(item => item);
    this.items.sort((a, b) => a.type === b.type ? (a.name < b.name ? 1 : -1) : (a.type < b.type ? 1 : -1));
    this.engine.trigger("openInventory"); // Clear the inv menu and refreshes it
    this.engine.trigger("saveRequested");
  }

  add(item) {
    if ( typeof item === "string" ) {
      item = new Item(this.engine, item);
    }
    var index = this.items.findIndex(item => !item);
    if ( index !== -1 ) {
      this.items[index] = item;
    } else {
      this.items.push(item);
    }
    this.engine.trigger("itemAcquired");
    this.engine.trigger("saveRequested");
    return item;
  }

  remove(item) {
    var index = this.items.indexOf(item);
    if ( index !== -1 ) {
      this.items[index] = null;
    }
  }

  count(itemName) {
    return this.items.filter(item => item?.name === itemName).length;
  }

  equip(slot, item) {
    this.remove(item);
    this.unequip(slot);
    this.equipment[slot] = item;
    this.engine.trigger("itemEquipped");
    this.engine.trigger("saveRequested");
  }

  // Dev cheat: grant one energy cell of every tier PLUS an extra of the top tier,
  // so they fill exactly one inventory row (8) and show the whole ramp at a
  // glance. Repeatable — each call adds another set.
  cheat() {
    for ( var t = 1; t <= HOURGLASS_MAX_TIER; t++ ) {
      this.add(t === 1 ? "hourglass" : "hourglass" + t);
    }
    this.add("hourglass" + HOURGLASS_MAX_TIER);   // extra top-tier → 8 total = full row
    this.sort();
  }

  // Wipe to a fresh-start state IN PLACE. The equipment + machine objects are
  // mutated (not replaced) because Base/Helper/components hold references to them;
  // swapping the objects would orphan those refs. Used by the dev Reset button,
  // which stays in the menu so you can then cheat or exit to a clean game.
  reset() {
    this.items = [];
    for ( var slot in this.equipment ) this.equipment[slot] = null;
    for ( var gem in this.machines ) {
      var m = this.machines[gem];
      m.loaded = null; m.fuel = 0; m.level = 1; m.xp = 0; m.burstQueue = [];
    }
    this.firstHourglassBonusUsed = false;
    this.sort();   // filters/sorts, then triggers openInventory + saveRequested
  }

  // Dev cheat: grant one gem of EVERY colour and tier (red/blue/yellow × T1..max)
  // so you can test every weapon/effect combo. Repeatable.
  cheatGems() {
    ["redGem", "blueGem", "yellowGem"].forEach(base => {
      for ( var t = 1; t <= GEM_MAX_TIER; t++ ) {
        this.add(t === 1 ? base : base + t);
      }
    });
    this.sort();
  }

  // ── Uniform slot model ────────────────────────────────────────────────────
  // Every place a draggable item can live is addressed by a `ref`:
  //   { kind: "inv",   index }  — an inventory grid slot (sparse, positional)
  //   { kind: "equip", slot  }  — an equipment slot (primary/effect/left/…)
  //   { kind: "synth", slot  }  — a synth's loaded fuel gem (red/blue/yellowGem)
  // slotItem/slotSet read & write an Item at any ref, hiding the fact that synth
  // slots persist {name,tier} rather than an Item object. resolveDrop() below is
  // the SINGLE authority for every drag, built only on these — so no two code
  // paths can ever race on the same gem (the bug the old 3-handler design had).

  // Do two refs point at the exact same slot?
  static sameRef(a, b) {
    return !!a && !!b && a.kind === b.kind &&
      (a.kind === "inv" ? a.index === b.index : a.slot === b.slot);
  }

  // The Item currently at `ref` (or null). Synth slots store {name,tier}: wrap it.
  slotItem(ref) {
    if ( !ref ) return null;
    if ( ref.kind === "inv" )   return this.items[ref.index] ?? null;
    if ( ref.kind === "equip" ) return this.equipment[ref.slot] ?? null;
    if ( ref.kind === "synth" ) {
      var loaded = this.machines[ref.slot]?.loaded;
      return loaded ? new Item(this.engine, loaded.name) : null;
    }
    return null;
  }

  // Put an Item (or null to clear) at `ref`. Grows the inventory array as needed
  // and packs synth slots back down to {name,tier}.
  slotSet(ref, item) {
    if ( ref.kind === "inv" ) {
      while ( this.items.length <= ref.index ) this.items.push(null);
      this.items[ref.index] = item;
    } else if ( ref.kind === "equip" ) {
      this.equipment[ref.slot] = item;
    } else if ( ref.kind === "synth" ) {
      this.machines[ref.slot].loaded = item ? { name: item.name, tier: item.tier } : null;
    }
  }

  // Can `item` legally occupy `ref`? Equip slots take any GEM; a synth slot takes
  // only a gem of its OWN colour; inventory holds anything. null always fits.
  canHold(ref, item) {
    if ( !item ) return true;
    if ( ref.kind === "equip" ) return item.type === "gem";
    if ( ref.kind === "synth" ) return item.type === "gem" && item.color + "Gem" === ref.slot;
    return true;
  }

  // THE drop resolver — the one place a drag is committed. Moves `drag` (taken
  // from slot `source`) onto slot `target`, choosing move / merge / swap / reject,
  // using only slotItem/slotSet/canHold so every source×target combo is handled
  // identically and atomically. Pure model mutation: the caller fires the events
  // / fx. Returns what happened so the UI can play the matching feedback:
  //   { action: "none" }            — rejected; nothing changed (snap back)
  //   { action: "move" }            — placed into an empty target
  //   { action: "merge", item }     — merged; `item` is the new gem now at target
  //   { action: "swap" }            — swapped drag ⇄ the item that was at target
  resolveDrop(drag, source, target) {
    if ( !drag || !source || !target ) return { action: "none" };
    if ( Inventory.sameRef(source, target) ) return { action: "none" };  // dropped on itself
    if ( !this.canHold(target, drag) ) return { action: "none" };        // wrong colour / type

    var dest = this.slotItem(target);

    if ( !dest ) {                       // empty target → just move the gem there
      this.slotSet(source, null);
      this.slotSet(target, drag);
      return { action: "move" };
    }

    if ( drag.mergesWith(dest) ) {       // same gem (colour+tier) → merge up in place
      var result = new Item(this.engine, drag.stats.craft[dest.name]);
      this.slotSet(source, null);
      this.slotSet(target, result);
      return { action: "merge", item: result };
    }

    // Different items → SWAP, but only if the displaced item may legally live in
    // the source slot (can't shove an hourglass into an equip/synth slot, nor a
    // wrong-colour gem into a synth). Otherwise reject so both gems snap back.
    if ( !this.canHold(source, dest) ) return { action: "none" };
    this.slotSet(target, drag);
    this.slotSet(source, dest);
    return { action: "swap" };
  }

  unequip(slot) {
    if ( this.equipment[slot]) {
      this.add(this.equipment[slot]);
    }
    this.equipment[slot] = null;
    this.engine.trigger("openInventory"); // Clear the inv menu and refreshes it
    this.engine.trigger("saveRequested");
  }
}