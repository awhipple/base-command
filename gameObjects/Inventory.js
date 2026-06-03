import Item from "./Item.js";

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
    // InventoryMenu FUEL_SCALE); `burstLeft`/`burstRate` = the hourglass burst
    // reservoir (sub-fuel left to drain + drain rate).
    this.machines = {
      redGem:    { loaded: null, fuel: 0, level: 1, xp: 0, burstLeft: 0, burstRate: 0 },
      blueGem:   { loaded: null, fuel: 0, level: 1, xp: 0, burstLeft: 0, burstRate: 0 },
      yellowGem: { loaded: null, fuel: 0, level: 1, xp: 0, burstLeft: 0, burstRate: 0 },
    };

    // One-time starter bonus: the FIRST hourglass burned on this save delivers
    // double fuel (a bare T1 → exactly one gem). Persisted in the save snapshot.
    this.firstHourglassBonusUsed = false;

    // Cold start: NO gems, nothing equipped. Empty synths make NOTHING (no base
    // rate). The basic shot beats level 1 → an hourglass → burned on a synth it
    // mints your first gem. The FIRST hourglass delivers double fuel (one-time;
    // doubled T1 = exactly one gem) so a single level-1 clear is enough (see
    // InventoryMenu._tryBoost + firstHourglassBonusUsed). Dev grabs test gems via
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

  // Dev cheat: grant a full row (8) of tier-5 hourglasses to burn into whatever
  // gems you want to test. Repeatable — each call adds another row.
  cheat() {
    for ( var i = 0; i < 8; i++ ) this.add("hourglass5");
    this.sort();
  }

  // Remove a dragged item from wherever it came — an inventory slot, an equip
  // slot, or a synth slot. `source` is {kind:"inv"} | {kind:"equip"|"synth", slot}.
  clearSource(item, source) {
    if ( source && source.kind === "equip" ) this.equipment[source.slot] = null;
    else if ( source && source.kind === "synth" ) this.machines[source.slot].loaded = null;
    else this.remove(item);
  }

  // Drop a dragged item into an empty inventory slot, clearing its source first.
  // Handles both rearranging (inv->inv) and unequipping (equip->inv). No auto-sort.
  dropToInventory(item, index, source) {
    while ( this.items.length <= index ) this.items.push(null);
    if ( this.items[index] ) return;   // only drop onto empty slots
    this.clearSource(item, source);
    this.items[index] = item;
    this.engine.trigger("openInventory");   // rebuild icon rects at new spots
    this.engine.trigger("saveRequested");
  }

  unequip(slot) {
    if ( this.equipment[slot]) {
      this.add(this.equipment[slot]);
    }
    this.equipment[slot] = null;
    this.engine.trigger("openInventory"); // Clear the inv menu and refreshes it
    this.engine.trigger("saveRequested");
  }

  attemptMerge(first, second) {
    if ( first !== second && first.stats.craft?.[second.name]) {
      var mergeIndex = this.items.indexOf(second);
      if ( mergeIndex >= 0) {
        this.remove(first);
        this.remove(second);
        this.engine.trigger("itemsMerged");
        var result = this.items[mergeIndex] = new Item(this.engine, first.stats.craft[second.name]);
        this.engine.trigger("saveRequested");
        return result;
      }
    }
    return null;
  }
}