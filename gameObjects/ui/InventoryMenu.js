import UIWindow from "../../engine/gfx/ui/window/index.js";
import Text from "../../engine/gfx/Text.js";
import { BoundingRect } from "../../engine/GameMath.js";
import { UIComponent } from "../../engine/gfx/ui/window/UIComponent.js";
import Item, { GEM_MAX_TIER, BURST_SECONDS } from "../Item.js";
import CrackleBed from "../../engine/CrackleBed.js";
import Sprite from "../../engine/gfx/Sprite.js";
import EffectRect from "../effects/EffectRect.js";
import FlyingGem from "../effects/FlyingGem.js";
import Banner from "./Banner.js";

// Synthesis economy (pure idle game). One synth per colour. There are TWO
// independent ways to fuel a synth, and its fuel/sec is their SUM:
//   • IDLE — a gem dropped in the slot (persistent), contributing its tier as
//     fuel/sec, forever. Optional; an empty synth idles at 0/sec.
//   • BURST — an hourglass dropped on it: a FLAT +fuel/sec (by hourglass tier)
//     for a fixed few seconds (with the fire effect). Not a multiplier, so it
//     doesn't scale with the loaded gem.
// GEN_SECONDS = fuel per output gem. Higher OUTPUT level costs proportionally
// more (bigger gem, ~flat rate). All tunable, pending the design pass.
const GEN_SECONDS = 60;         // fuel per gem
const IDLE_FUEL_PER_TIER = 2;   // a loaded gem idles at tier × this fuel/sec

// EXACT accounting. Fuel is tracked in integer "sub-fuel" units (1 fuel =
// FUEL_SCALE sub-fuel) so per-frame accumulation never drifts: at 60fps the
// per-frame idle drip is `idleFuel/sec` sub-fuel and a burst drains `burstRate`
// sub-fuel/frame — both whole numbers given integer GEN_SECONDS /
// IDLE_FUEL_PER_TIER / HOURGLASS_FUEL / BURST_SECONDS. A gem costs an integer
// number of sub-fuel, so `fuel >= cost` is exact: N hourglasses convert to a
// deterministic number of gems with no floating-point fuzz at the boundary.
const FUEL_SCALE = 60;          // sub-fuel per fuel (== fps, so per-frame drips are whole)

// Machine leveling: each machine produces gems at its own `level` (output tier).
// Producing LEVEL_GEMS gems at the current level fills the yellow XP bar and
// bumps the machine to the next tier — it then makes a bigger gem but takes
// twice as long per level (so output rate stays ~flat; you just start higher).
// 16 = a power of two so a level's worth of gems merges all the way up cleanly
// (16 → 8 → 4 → 2 → 1) with NO awkward leftover tier.
const LEVEL_GEMS = 16;

// Helper turrets fire at half damage AND half rate (mirrors Helper.FIRE_MULT /
// DAMAGE_MULT) and ignore the effect gem — used for the helper hover readout.
const HELPER_MULT = 0.5;

// White merge-flash duration (frames) for synth + equip slots, matched to the
// inventory grid's pulse so all merges feel the same. flashAlpha() = hold bright,
// then fade over the last ~40%.
const SLOT_FLASH_FRAMES = 25;
function flashAlpha(f) { return Math.min(1, (f / SLOT_FLASH_FRAMES) * 2.5) * 0.85; }

// tier 1 keeps the bare colour name; tiers 2+ append the number (matches Item.js).
function gemName(base, tier) { return tier === 1 ? base : base + tier; }

export default class InventoryMenu extends UIWindow {
  constructor(engine, inventory, synths) {
    super(engine, {
      x: engine.window.width, y: 0,
      w: engine.window.width, h: engine.window.height,
    }, [
      {
        type: "spacer",
        height: 28,
      },
      {
        type: Banner,
        text: "Items",
        fontSize: 40,
        fontColor: "#7dd3fc",
        center: true
      },
      {
        type: Items,
        inventory: inventory,
        text: {}
      },
      {
        type: "spacer",
        height: 1,
      },
      {
        type: Banner,
        text: "Synthesis",
        fontSize: 40,
        fontColor: "#c4b5fd",
        center: true
      },
      {
        type: Synthesis,
        synths: synths,
      },
      {
        type: "spacer",
        height: 1,
      },
      {
        type: Equipment,
      },
    ], {
      bgColor: "#000",
      borderColor: "#2a3a5a",
      outerPadding: 3,
      z: 101,
    });

    this.invText = new Text("Inventory ↑", 0, 0, { fontColor: "white", fontSize: 22 }).asImage(150, 30).rotate("up");
    this.closeText = new Text("↑ Close", 0, 0, { fontColor: "white", fontSize: 22 }).asImage(150, 30).rotate("down");
    this.invOpenRect = new BoundingRect(this.originX-48, 310, 96, 170);
    this.invOpenClick = new BoundingRect(this.engine.window.width-48, 310, 96, 170);

    this.engine.onMouseMove(event => {
      if ( 
        !this.hide && 
        // this.originX === this.engine.window.width && 
        this.invOpenClick.contains(event.pos) 
      ) {
        this.hoverInv = true;
      } else {
        this.hoverInv = false;
      }
    });

    this.engine.onMouseDown(event => {
      if ( event.button === "left" && this.hoverInv ) {
        this.engine.trigger("toggleInventory");
      }
    });

    // A synth minting a gem → fly the icon from the machine into its inventory
    // slot (only while the panel is actually visible; during levels it's hidden,
    // so gems just appear). See _spawnGemFlyer.
    this.engine.on("gemSynthed", (item, machineGem) => this._spawnGemFlyer(item, machineGem));
  }

  update() {
    super.update();

    this.invOpenClick.x = this.originX-48;
    if ( this.hoverInv ) {
      this.engine.cursor = "pointer";
    }
  }

  draw(ctx) {
    super.draw(ctx);
    this.invOpenRect.x = this.originX-48;
    this.invOpenRect.draw(ctx, "white", "black");
    this.invText.draw(ctx, this.originX-40, 320);
    this.closeText.draw(ctx, this.originX+7, 344);
  }

  // Map a point that is LOCAL to one of `win`'s stacked components into `win`'s
  // own (parent/screen) space. Every level of this UI blits 1:1 (canvas width ==
  // innerRect width, y blits 1:1), so it's a pure translation: component origin +
  // innerRect − scroll. Composing it per nesting level walks any depth.
  _mapFromComponent(win, comp, lx, ly) {
    var y = win.innerPadding;
    for ( var i = 0; i < win.components.length; i++ ) {
      if ( win.components[i] === comp ) break;
      y += win.components[i].canvas.height + win.innerPadding;
    }
    return {
      x: win.innerRect.x + win.innerPadding + (comp.left || 0) + lx,
      y: win.innerRect.y + y + ly - win.scroll,
    };
  }

  // Fly a just-synthesized gem from its machine's output icon into the inventory
  // slot it landed in. No-op (gem just appears) when the panel isn't visible.
  _spawnGemFlyer(item, machineGem) {
    if ( !item || this.hide || this.originX >= this.engine.window.width - 1 ) return;

    var synth = this.components.find(c => c instanceof Synthesis);
    var items = this.components.find(c => c instanceof Items);
    if ( !synth || !items ) return;
    var machine = synth.machines.find(x => x.gem === machineGem);
    if ( !machine ) return;

    // Destination slot: the inventory grid is a nested window (items.menu) of
    // ItemRow components (8 cols each). index → (row, col).
    var index = this.engine.globals.inventory.items.indexOf(item);
    var row = Math.floor(index / 8), col = index % 8;
    var rowComp = items.menu.components[row];
    if ( index < 0 || !rowComp ) return;   // off the visible grid → just appear

    // START: machine output-icon centre (Synthesis-local) → screen.
    var r = machine.body;
    var start = this._mapFromComponent(this, synth, r.x + r.w / 2, r.y + r.h / 2);

    // END: slot centre (ItemRow-local) → items.menu space → Items-local → screen.
    var step = items.iconSize + items.iconPadding, sz = items.iconSize;
    var inMenu = this._mapFromComponent(items.menu, rowComp, col * step + sz / 2, sz / 2);
    var end = this._mapFromComponent(this, items, inMenu.x, inMenu.y);

    // Hide the gem in its slot until the flyer lands (save-safe: it's already in
    // inventory, this flag is transient + never serialized).
    item._inFlight = true;
    this.engine.register(new FlyingGem(this.engine, item.icon, start, end, {
      color: item.color,
      onLand: () => { item._inFlight = false; },
    }));
  }
}

class Items extends UIComponent {
  iconSize = Item.ICON_SIZE;
  iconPadding = 5;
  iconRows = 3;         // rows VISIBLE at once; no scroll until items exceed this
  iconColumns = 8;
  maxRows = 16;         // rows BUILT (≤128 slots); scroll range clamps to actual items

  menuWidth = this.iconColumns * (this.iconSize + this.iconPadding) + this.iconPadding + 6;
  height = this.iconRows * (this.iconSize + this.iconPadding) + this.iconPadding + 6;

  initialize() {
    super.initialize();

    var itemIndexes = [];
    for ( var i = 0; i < this.maxRows; i++ ) {
      itemIndexes.push(i*this.iconColumns);
    }

    this.menu = new UIWindow(
      this.engine, 
      {x: this.width/2 - this.menuWidth/2, y: 0, w: this.menuWidth, h: this.height},
      itemIndexes.map(val => { return {
        type: ItemRow,
        inventory: this.options.inventory,
        iconSize: this.iconSize,
        iconPadding: this.iconPadding,
        itemCount: this.iconColumns,
        index: val,
      }}),
      {
        bgColor: "#000",
        borderColor: "#fff",
        outerPadding: 3,
        innerPadding: this.iconPadding,
      },
    );

    // (No discard/sell button — money is out of the game. A "recycle into an
    // hourglass" feature may live here later.) White catalysts come from the
    // white source machine, not a buy button.
    this.sortRect = new BoundingRect(480, 130, 50, 28);
    this.sortText = new Text('Sort', 487, 134, {
      fontSize: 15,
      fontColor: "#9aa7c2",
    });
  }

  update() {
    // Clamp the grid's scroll range to the ACTUAL number of item rows (not the
    // fixed component count), so you can scroll to every item but not down into
    // empty rows below them. Grows as the inventory fills, up to maxRows.
    var count = this.options.inventory.items.length;
    var rows = Math.min(this.maxRows, Math.max(1, Math.ceil(count / this.iconColumns)));
    var contentH = rows * (this.iconSize + this.iconPadding) + this.iconPadding;
    this.menu.maxScroll = Math.max(0, contentH - this.menu.rect.h + this.menu.outerPadding * 2);
    this.menu.scroll = Math.min(this.menu.scroll, this.menu.maxScroll);
    this.menu.update();
  }

  onMouseMove(event) {
    this.engine.globals.toolTipItem = null;
    this.hoverSort = this.sortRect.contains(event.pos);

    event.relPos = event.pos;
    event.relPos.x -= this.menu.originX;
    this.menu.onMouseMove(event);
  }

  onMouseWheel(event) {
    if ( 
      event.pos.x > this.menu.rect.x && event.pos.x < this.menu.rect.x + this.menu.rect.w &&
      event.pos.y > 0 && event.pos.y < this.height
    ) {
      event.relPos = event.pos;
      event.relPos.x -= this.menu.originX;
      this.menu.onMouseWheel(event);
    }
  }

  onMouseClick(event) {
    if ( this.hoverSort ) {
      this.engine.globals.inventory.sort();
    }

    event.relPos = event.pos;
    event.relPos.x -= this.menu.originX;
    this.menu.onMouseClick(event);
  }

  onMouseUp(event) {
    event.relPos = event.pos;
    event.relPos.x -= this.menu.originX;
    this.menu.onMouseUp(event);
  }

  drawComponent() {
    this.menu.draw(this.ctx);
    this.sortRect.draw(this.ctx, this.hoverSort ? "yellow" : "white");
    this.sortText.draw(this.ctx);
  }
}

class ItemRow extends UIComponent {
  constructor(engine) {
    super(engine);
  }

  initialize() {
    this.height = this.options.iconSize;
    super.initialize();

    this.iconRects = [];
    // Fixed hit-rect per column (filled OR empty) so we can detect drops onto
    // empty slots for rearranging — not just onto items for merging.
    var step = this.options.iconSize + this.options.iconPadding, sz = this.options.iconSize;
    this.slotRects = [];
    for ( var c = 0; c < this.options.itemCount; c++ ) {
      this.slotRects.push(new BoundingRect(c * step, 0, sz, sz));
    }

    var clearIconRects = () => this.iconRects = [];
    this.engine.on("openInventory", clearIconRects);
    this.engine.on("toggleInventory", clearIconRects);
  }

  _colAt(pos) {
    for ( var c = 0; c < this.slotRects.length; c++ ) {
      if ( this.slotRects[c].contains(pos) ) return c;
    }
    return -1;
  }

  onMouseClick(event) {
    var c = this._colAt(event.pos);
    if ( c === -1 ) return;
    var item = this.options.inventory.items[c + this.options.index];
    if ( item ) {
      this.engine.globals.dragItem = item;
      this.engine.globals.dragSource = { kind: "inv" };
    }
  }

  onMouseMove(event) {
    var drag = this.engine.globals.dragItem;
    this.dropTarget = null; this.dropCol = null; this.moveIdx = null;

    var c = this._colAt(event.pos);
    if ( c === -1 ) { this.engine.trigger("unhoverItem"); return; }

    var idx = c + this.options.index;
    var target = this.options.inventory.items[idx];
    // Gems have NO tooltip (learn their effects by equipping + reading the weapon
    // badge). Catalysts / hourglasses keep theirs (fuel rate, burn duration).
    this.engine.globals.toolTipItem = (target && target.type !== "gem") ? target : null;

    if ( drag ) {
      if ( target && target !== drag ) {
        this.dropTarget = target;   // merge candidate
        this.dropCol = c;
      } else if ( !target ) {
        this.moveIdx = idx;         // empty slot -> rearrange here
        this.dropCol = c;
      }
    }
    if ( !target ) this.engine.trigger("unhoverItem");
  }

  onMouseUp(event) {
    var drag = this.engine.globals.dragItem;
    var src = this.engine.globals.dragSource;
    var inv = this.engine.globals.inventory;
    if ( !drag ) return;
    if ( this.dropTarget ) {
      var newItem = inv.attemptMerge(drag, this.dropTarget);
      if ( newItem ) {
        // attemptMerge only nulls an inventory slot; clear an equip/synth source too.
        inv.clearSource(drag, src);
        if ( this.iconRects[this.dropCol] ) {
          this.engine.register(new EffectRect(this.engine, this.engine.globals.cursor.rect, {
            color: drag.borderColor,
            icon: drag.icon,
            grow: -0.6,
            fade: 0.06,
          }));
          this.iconRects[this.dropCol].pulse("white", 0.25);
          this.iconRects[this.dropCol].changeStateIn(0.75, {
            icon: newItem.icon,
            color: newItem.borderColor,
          });
        }
      } else {
        // Different (non-mergeable) gems -> SWAP: the dragged gem takes the
        // target's inventory slot; the target moves to wherever the drag came from.
        var targetIdx = inv.items.indexOf(this.dropTarget);
        if ( targetIdx === -1 ) return;
        if ( src && src.kind === "equip" ) {
          inv.equipment[src.slot] = this.dropTarget;
        } else if ( src && src.kind === "synth" ) {
          // Synth slots are colour-locked: only the matching colour can swap in.
          // Wrong colour -> reject the whole swap (both gems snap back).
          if ( this.dropTarget.color + "Gem" !== src.slot ) return;
          inv.machines[src.slot].loaded = { name: this.dropTarget.name, tier: this.dropTarget.tier };
        } else {
          var dragIdx = inv.items.indexOf(drag);
          if ( dragIdx === -1 ) return;
          inv.items[dragIdx] = this.dropTarget;
        }
        inv.items[targetIdx] = drag;
        inv.engine.trigger("openInventory");
        inv.engine.trigger("saveRequested");
      }
    } else if ( this.moveIdx != null ) {
      // Drop into an empty inventory slot: rearrange (inv) or unequip (equip).
      inv.dropToInventory(drag, this.moveIdx, src);
    }
  }

  update() {
    this.iconRects.forEach(rect => rect.update());
  }

  drawComponent() {
    for ( var i = 0; i < this.options.itemCount && i + this.options.index < this.options.inventory.items.length; i++ ) {
      var item = this.options.inventory.items[i + this.options.index];

      // Hide a gem that's still flying from its synth into this slot — it's
      // revealed when the flyer lands (see FlyingGem / _spawnGemFlyer).
      if ( item && !item._inFlight ) {
        var rect = this.iconRects[i];
        if ( !rect ) {
          var x = i * (this.options.iconSize + this.options.iconPadding);
          var size = this.options.iconSize;
          rect = this.iconRects[i] = new EffectRect(this.engine, {x, y: 0, w: size, h: size}, {
            icon: item.icon,
            color: Item.borderColors[item.type],
          });
          rect.item = item;
        } else if ( rect.item !== item && !rect.changeStateTime ) {
          // This slot now holds a DIFFERENT item (e.g. a fresh gem synthesized
          // into a freed slot) — refresh the cached icon so it doesn't keep
          // showing the previous occupant. Skipped mid merge-animation.
          rect.item = item;
          rect.icon = item.icon;
          rect.color = Item.borderColors[item.type];
        }
        // Dim the dragged item and anything it can't merge with, so valid
        // merge targets (same colour + tier) stay highlighted.
        var dragItem = this.engine.globals.dragItem;
        rect.alpha =
          (item === dragItem || (dragItem && !dragItem.mergesWith(item))) ? 0.3 : 1.0;
        rect.draw(this.ctx);
      }
    }

    // While dragging over an empty slot in this row, outline it as the move target.
    if ( this.engine.globals.dragItem && this.moveIdx != null && this.dropCol != null ) {
      this.slotRects[this.dropCol].draw(this.ctx, "#7ee787");
    }
  }
}

// The synthesis plant. A "Buy" button mints white catalyst gems for a flat
// cost; each coloured machine (red/blue/yellow) has an item slot you DROP a
// white catalyst into. The catalyst is consumed over time to fill the machine,
// which pops its colour gem into the inventory — running passively on the
// inventory screen AND during levels. Higher-tier catalysts hold more fuel and
// run faster. Machine state lives on `inventory.machines` (so it persists/saves
// and keeps producing while this panel is off-screen).
class Synthesis extends UIComponent {
  height = 159;

  initialize() {
    super.initialize();

    this.inventory = this.engine.globals.inventory;
    this.hoverSlot = null;
    this.hoverMachine = null;
    this.fire = [];   // local fire particles for active hourglass boosts
    this.idleSparks = [];   // mild always-on smoulder at a loaded synth's bar lip
    this.slotFlash = {};   // brief white flash per slot after a catalyst merge
    this.crackle = new CrackleBed();   // smouldering burn sfx (synth'd)

    // One synthesizer per colour. Each is fuelled by ANY gem dropped in its slot
    // (its tier = fuel/s) and outputs its own colour. Seed the red synth with your
    // starting red gem to bootstrap.
    var gems = ["redGem", "blueGem", "yellowGem"];
    var W = this.suggestedWidth, n = gems.length;
    this.machines = gems.map((gem, i) => {
      var cx = W * (i + 0.5) / n;
      return {
        gem,
        body: new BoundingRect(cx - 30, 6, 60, 80),
        slot: new BoundingRect(cx - 19, 96, 38, 38),
      };
    });

    // Drop a gem onto a slot to fuel it; drop an hourglass onto any machine to
    // inject a burst of growth.
    this.engine.on("stopDragItem", item => {
      if ( !item ) return;
      if ( item.type === "gem" ) this._tryLoad(item);
      else if ( item.type === "boost" ) this._tryBoost(item);
    });
  }

  // Idle fuel/sec from the loaded gem (0 if empty) — no base rate. In sub-fuel
  // units this is ALSO the exact per-frame idle drip (see FUEL_SCALE).
  _idleFuel(st) {
    return st.loaded ? st.loaded.tier * IDLE_FUEL_PER_TIER : 0;
  }

  // Burst fuel/sec from an active hourglass (0 if none burning) — the honest
  // tier rate, shown in the readout and used as the per-frame drain (sub-fuel).
  _burstFuel(st) {
    return (st.burstLeft || 0) > 0 ? (st.burstRate || 0) : 0;
  }

  // Sub-fuel needed for one gem at this output level. Integer, so `fuel >= cost`
  // is exact. Doubles per level (bigger gem) — see FUEL_SCALE / PROGRESSION.md.
  _gemCost(level) {
    return GEN_SECONDS * FUEL_SCALE * Math.pow(2, (level || 1) - 1);
  }

  _tryLoad(item) {
    if ( !this.hoverSlot || item.type !== "gem" ) return;
    // COLOUR-LOCKED: a synth only accepts its OWN colour as fuel (red gems fuel
    // the red synth, etc.). Each colour is its own tree you climb independently —
    // a maxed red gem can't be dumped into the blue synth to leapfrog it. Wrong
    // colour = silent no-op; the gem snaps back to where it came from.
    if ( item.color + "Gem" !== this.hoverSlot ) return;
    // Dropping a synth gem back onto its own slot = no-op (don't self-merge).
    var src = this.engine.globals.dragSource;
    if ( src && src.kind === "synth" && src.slot === this.hoverSlot ) return;
    var st = this.inventory.machines[this.hoverSlot];
    // The fuel gem sits in the slot permanently (NOT consumed) and charges the
    // machine forever — its tier sets the fuel rate (colour is fixed by the slot).
    if ( st.loaded ) {
      // Drop a MATCHING gem (same colour + tier) onto a loaded slot to merge it
      // up in place. Otherwise swap, returning the old fuel gem to your bag.
      var next = Item.list[item.name]?.craft?.[item.name];
      if ( item.name === st.loaded.name && next ) {
        st.loaded = { name: next, tier: st.loaded.tier + 1 };
        this.inventory.clearSource(item, this.engine.globals.dragSource);
        // Same merge feedback as the inventory grid: a poof off the cursor + a
        // brief flash on the slot.
        this.engine.register(new EffectRect(this.engine, this.engine.globals.cursor.rect, {
          color: item.borderColor, icon: item.icon, grow: -0.6, fade: 0.06,
        }));
        this.slotFlash[this.hoverSlot] = SLOT_FLASH_FRAMES;
        this.engine.trigger("saveRequested");
        return;
      }
      this.inventory.add(st.loaded.name);
    }
    st.loaded = { name: item.name, tier: item.tier };
    this.inventory.clearSource(item, this.engine.globals.dragSource);
    this.engine.trigger("saveRequested");
  }

  // Sacrifice an hourglass for a flat +fuel/sec burst (item.fuel) over a fixed
  // duration (item.seconds). Works on an empty synth too. Stacking extends the
  // timer and takes the higher burst rate.
  _tryBoost(item) {
    if ( !this.hoverMachine ) return;
    var m = this.machines.find(x => x.gem === this.hoverMachine);
    var st = this.inventory.machines[this.hoverMachine];
    if ( !m || !st ) return;
    var rate = item.fuel || 0;                                       // fuel/s == sub-fuel/frame
    var total = rate * (item.seconds || BURST_SECONDS) * FUEL_SCALE; // EXACT sub-fuel this hourglass delivers
    // ONE-TIME starter bonus: the FIRST hourglass burned on a save delivers
    // DOUBLE fuel at DOUBLE rate. A bare T1 is ½ a gem, so doubled fuel = exactly
    // one gem (exact integer math — no margin), and doubling the rate too means it
    // still burns in the normal ~BURST_SECONDS instead of twice as long. The flag
    // persists in the save, so no later hourglass is boosted.
    if ( !this.inventory.firstHourglassBonusUsed ) {
      total *= 2;   // double fuel  → one full gem
      rate  *= 2;   // double speed → burns in ~BURST_SECONDS, not ~2× as long
      this.inventory.firstHourglassBonusUsed = true;
    }
    // Reservoir model: deposits are ADDITIVE and exact (stacking two hourglasses
    // delivers exactly the sum of their fuel), drained at the highest tier's rate.
    st.burstRate = Math.max(st.burstRate || 0, rate);
    st.burstLeft = (st.burstLeft || 0) + total;
    this.inventory.remove(item);
    this.engine.sounds.play("fireball", { volume: 0.4 });
    this.engine.trigger("saveRequested");
  }

  // Spawn a few rising fire particles at the base of a boosting machine.
  _emitFire(m) {
    var r = m.body;
    for ( var i = 0; i < 3; i++ ) {
      this.fire.push({
        x: r.x + r.w / 2 + (Math.random() - 0.5) * r.w * 0.85,
        y: r.y + r.h - 4,
        vx: (Math.random() - 0.5) * 0.6,
        vy: -1.2 - Math.random() * 1.5,
        life: 1,
        decay: 0.02 + Math.random() * 0.03,
        size: 6 + Math.random() * 9,
      });
    }
    if ( this.fire.length > 260 ) this.fire.splice(0, this.fire.length - 260);
  }

  // Always-on smoulder: while a gem is loaded, drop sparks at the LIP of the
  // rising fuel bar so you can see it slowly burning upward. Mild but clearly
  // visible; frequency + size scale with gem tier. No audio (this runs constantly).
  _emitIdleSpark(m, st) {
    if ( !st.loaded ) return;
    var tier = st.loaded.tier || 1;
    if ( Math.random() > 0.12 + 0.036 * tier ) return;   // ~9/s at T1 → ~29/s at T10 (2× density)
    var r = m.body;
    var frac = Math.min((st.fuel || 0) / this._gemCost(st.level || 1), 1);
    var lipY = r.y + r.h - r.h * frac;                    // top edge of the fill
    this.idleSparks.push({
      x: r.x + 3 + Math.random() * (r.w - 6),
      y: lipY,
      vy: -0.28 - Math.random() * 0.45,
      life: 1,
      decay: 0.025 + Math.random() * 0.03,
      size: 1.7 + Math.random() * 1.5 + tier * 0.2,
    });
    if ( this.idleSparks.length > 120 ) this.idleSparks.splice(0, this.idleSparks.length - 120);
  }

  onMouseMove(event) {
    var bySlot = this.machines.find(x => x.slot && x.slot.contains(event.pos));
    this.hoverSlot = bySlot ? bySlot.gem : null;
    var byMachine = this.machines.find(x => x.body.contains(event.pos) || (x.slot && x.slot.contains(event.pos)));
    this.hoverMachine = byMachine ? byMachine.gem : null;
  }

  onMouseClick(event) {
    // Pick up the fuel gem to drag it out (drop in inventory to retrieve, or onto
    // another slot to move/merge) — just like the equipment slots. The gem stays
    // in place until a valid drop.
    var m = this.machines.find(x => x.slot && x.slot.contains(event.pos));
    if ( !m ) return;
    var st = this.inventory.machines[m.gem];
    if ( st && st.loaded ) {
      this.engine.globals.dragItem = new Item(this.engine, st.loaded.name);
      this.engine.globals.dragSource = { kind: "synth", slot: m.gem };
    }
  }

  update() {
    // Runs every frame (inventory + levels). Each machine accumulates integer
    // sub-fuel (idle drip + burst drain) and pops a gem each time it covers the
    // gem cost — all exact integer math, so fuel→gem conversions never drift.
    this.machines.forEach(m => {
      var st = this.inventory.machines[m.gem];
      if ( !st ) return;
      st.level = st.level || 1;
      st.xp = st.xp || 0;
      st.fuel = st.fuel || 0;
      st.fuel += this._idleFuel(st);                 // idle drip (sub-fuel/frame, whole)
      if ( (st.burstLeft || 0) > 0 ) {               // burst: drain the reservoir, exactly
        var drain = Math.min(st.burstRate || 0, st.burstLeft);
        st.fuel += drain;
        st.burstLeft -= drain;
        this._emitFire(m);
      }
      var cost = this._gemCost(st.level);
      while ( st.fuel >= cost ) {
        var made = this.inventory.add(gemName(m.gem, st.level));
        this.engine.trigger("gemSynthed", made, m.gem);   // fly it into its slot (if panel open)
        st.fuel -= cost;
        // XP: every LEVEL_GEMS gems produced levels the machine up one tier, so
        // it then starts you at the next gem tier (capped at GEM_MAX_TIER).
        if ( st.level < GEM_MAX_TIER ) {
          st.xp += 1;
          if ( st.xp >= LEVEL_GEMS ) { st.xp = 0; st.level += 1; cost = this._gemCost(st.level); }
        }
      }
      // Mild idle "smoulder": a gem in the slot slowly burns the bar upward.
      this._emitIdleSpark(m, st);
    });

    // Advance + cull fire particles (buoyant, fading).
    for ( var i = this.fire.length - 1; i >= 0; i-- ) {
      var p = this.fire[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy -= 0.02;       // accelerate upward
      p.vx *= 0.98;
      p.life -= p.decay;
      if ( p.life <= 0 ) this.fire.splice(i, 1);
    }

    // Advance + cull idle smoulder sparks (drift up gently, fade).
    for ( var s = this.idleSparks.length - 1; s >= 0; s-- ) {
      var sp = this.idleSparks[s];
      sp.y += sp.vy;
      sp.life -= sp.decay;
      if ( sp.life <= 0 ) this.idleSparks.splice(s, 1);
    }

    // Decay catalyst-merge slot flashes.
    for ( var k in this.slotFlash ) {
      if ( this.slotFlash[k] > 0 ) this.slotFlash[k] -= 1;
    }

    // Smouldering crackle bed plays whenever any machine is mid-burn.
    var anyBurning = this.machines.some(m => (this.inventory.machines[m.gem]?.burstLeft || 0) > 0);
    if ( anyBurning ) this.crackle.start();
    else this.crackle.stop();
  }

  drawComponent() {
    var ctx = this.ctx;
    var drag = this.engine.globals.dragItem;
    var boostHover = drag && drag.type === "boost";

    this.machines.forEach(m => {
      var st = this.inventory.machines[m.gem] || { fuel: 0 };
      var level = st.level || 1, xp = st.xp || 0;
      var surging = (st.burstLeft || 0) > 0;
      var r = m.body;
      ctx.save();
      ctx.fillStyle = "#10151f";
      ctx.lineWidth = 2;
      // Highlight a valid hourglass target while dragging one.
      ctx.strokeStyle = (boostHover && this.hoverMachine === m.gem) ? "#f0c060" : "#2a3a5a";
      ctx.fillRect(r.x, r.y, r.w, r.h);
      var fillH = r.h * Math.min((st.fuel || 0) / this._gemCost(level), 1);
      ctx.fillStyle = surging ? "#caa23a" : "#274060";   // gold rush during a surge
      ctx.fillRect(r.x, r.y + r.h - fillH, r.w, fillH);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.restore();

      // Yellow XP bar climbing the right side; full = maxed out.
      var bw = 5, bx = r.x + r.w - bw - 2, by = r.y + 4, bh = r.h - 8;
      ctx.save();
      ctx.fillStyle = "#0c0c12";
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = "#ffd84d";
      var xpH = level < GEM_MAX_TIER ? bh * (xp / LEVEL_GEMS) : bh;
      ctx.fillRect(bx, by + bh - xpH, bw, xpH);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#5a5a3a";
      ctx.strokeRect(bx, by, bw, bh);
      ctx.restore();

      // Tier label over the machine (its current output gem level), dark-backed
      // so it reads over the fill. The player doesn't know gem tiers up front, so
      // this tells them what level this synthesizer is producing.
      var tlx = r.x + r.w / 2, tly = r.y + 3;
      Text.draw(ctx, "T" + level, tlx + 1, tly + 1, { fontSize: 12, fontColor: "#0a0e16", center: true });
      Text.draw(ctx, "T" + level, tlx, tly, { fontSize: 12, fontColor: "#cfe0ff", center: true });

      // Output icon = the gem at the machine's current level.
      var s = 36;
      var icon = this.engine.images.get(Item.list[gemName(m.gem, level)].icon);
      icon.draw(ctx, r.x + r.w / 2 - s / 2, r.y + r.h / 2 - s / 2, s, s);

      var sl = m.slot;
      // Only light the slot when the hover is actually actionable: a plain hover
      // (pick-up affordance) OR dragging a gem of THIS slot's colour. A wrong-
      // colour gem (or an hourglass) can't load here, so don't highlight it.
      var slotActive = this.hoverSlot === m.gem &&
        ( !drag || (drag.type === "gem" && drag.color + "Gem" === m.gem) );
      ctx.save();
      ctx.fillStyle = "#0c0c12";
      ctx.fillRect(sl.x, sl.y, sl.w, sl.h);
      ctx.lineWidth = 2;
      ctx.strokeStyle = slotActive ? "#7dd3fc" : "#3a3a4a";
      ctx.strokeRect(sl.x, sl.y, sl.w, sl.h);
      ctx.restore();
      if ( st.loaded ) {
        this.engine.images.get(Item.list[st.loaded.name].icon).draw(ctx, sl.x + 2, sl.y + 2, sl.w - 4, sl.h - 4);
      } else {
        Text.draw(ctx, "+", sl.x + sl.w / 2, sl.y + 7, { fontSize: 20, fontColor: "#3a4a5a", center: true });
      }
      // Fuel/sec readout: IDLE (loaded gem) always, plus BURST (active hourglass)
      // beside it while burning. Kept inside the panel so it isn't clipped below.
      var cx2 = sl.x + sl.w / 2;
      var burst = this._burstFuel(st);
      if ( burst > 0 ) {
        Text.draw(ctx, this._idleFuel(st) + "/s", cx2, sl.y + sl.h + 1, { fontSize: 10, fontColor: "#bcd3e8", center: true });
        Text.draw(ctx, "+" + burst + "/s", cx2, sl.y + sl.h + 12, { fontSize: 10, fontColor: "#ffcf6b", center: true });
      } else {
        Text.draw(ctx, this._idleFuel(st) + "/s", cx2, sl.y + sl.h + 4, { fontSize: 11, fontColor: "#bcd3e8", center: true });
      }
      // White flash after a fuel-gem merge in this slot (matches inventory pulse).
      if ( this.slotFlash[m.gem] > 0 ) {
        ctx.save();
        ctx.globalAlpha = flashAlpha(this.slotFlash[m.gem]);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(sl.x, sl.y, sl.w, sl.h);
        ctx.restore();
      }
    });

    // Fire particles for active hourglass burns (additive glow over everything).
    if ( this.fire.length ) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      this.fire.forEach(p => {
        var a = Math.max(0, p.life);
        var col = a > 0.6 ? "255,232,130" : a > 0.32 ? "255,146,42" : "205,44,22";
        var rad = p.size * (0.5 + a * 0.5);
        var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
        g.addColorStop(0, "rgba(" + col + "," + (a * 0.9) + ")");
        g.addColorStop(1, "rgba(" + col + ",0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }

    // Mild idle smoulder at each loaded synth's bar lip — faint warm sparks.
    if ( this.idleSparks.length ) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      this.idleSparks.forEach(sp => {
        var a = Math.max(0, sp.life) * 0.85;     // mild, but clearly visible
        var g = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, sp.size);
        g.addColorStop(0, "rgba(255,212,140," + a + ")");
        g.addColorStop(1, "rgba(255,170,60,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }

    // Burn countdown on top of each boosting machine (seconds of 10× left; with
    // stacked hourglasses this shows the accumulated time). Dark backing for
    // legibility over the flames.
    this.machines.forEach(m => {
      var st = this.inventory.machines[m.gem];
      if ( !st || (st.burstLeft || 0) <= 0 ) return;
      var r = m.body;
      var label = (st.burstLeft / st.burstRate / 60).toFixed(1) + "s";
      var tx = r.x + r.w / 2, ty = r.y + 18;   // below the tier label
      Text.draw(ctx, label, tx + 1, ty + 1, { fontSize: 11, fontColor: "#1a0d00", center: true });
      Text.draw(ctx, label, tx, ty, { fontSize: 11, fontColor: "#ffe8a0", center: true });
    });
  }
}

class Equipment extends UIComponent {
  height = 215;

  // Every slot now takes a GEM. In primary/left/right the gem acts as a weapon
  // (colour -> type, tier -> power); in effect it augments.
  static SLOT_TYPES = { primary: "gem", effect: "gem", left: "gem", leftEffect: "gem", right: "gem", rightEffect: "gem" };
  // Tint for the little effect-name label drawn beside the effect slot.
  static LABEL_COLORS = { red: "#ff6b6b", blue: "#7dd3fc", yellow: "#ffd84d", white: "#e2e8f0" };
  static HELPER_LABEL = "#7fe3ee";   // matches the base-helper tint

  initialize() {
    super.initialize();

    this.borderRect = new BoundingRect(0, 0, this.width, this.height);

    this.base = new Sprite(this.engine.images.get("base").img, this.width/2, this.height);
    this.base.rad = 3*Math.PI/2;

    this.inventory = this.engine.globals.inventory;
    this.equipment = this.inventory.equipment;
    this.equipFlash = {};   // brief white flash per slot after a merge

    var size = Item.ICON_SIZE, gap = 34, W = this.width, H = this.height;
    var label = (text, x, ly, color) => new Text(text, x + size/2, ly, {fontSize: 11, fontColor: color ?? "#9aa7c2", center: true});

    // Player's two slots: weapon + its effect gem, paired & centered, floating
    // above the main base's head (the base sits center-bottom, off-screen like
    // in the level).
    var pairY = 15, center = W/2 - size - gap/2;

    // Helper turrets mirror the play screen: small, off the bottom corners,
    // each with its weapon slot floating ABOVE its head. When aimed up the base
    // art's tall dimension is ~300px, so the visible top is ~300*scale/2 above
    // the sprite's y (which sits at the panel bottom).
    var helperScale = 0.42;
    var helperX = { left: 70, right: W - 70 };
    var helperHeadTop = H - 300 * helperScale / 2;
    // Each helper now has TWO slots (weapon + effect) side by side, centred on the
    // turret and raised so the on-hover readout has room ABOVE them. weapon = left
    // of centre, effect = right of centre (mirrors the player's pair).
    var hGap = 6;
    var helperSlotY = helperHeadTop - 6 - size - 30;
    var hWeaponX = cx => cx - size - hGap / 2;
    var hEffectX = cx => cx + hGap / 2;

    this.helperSprites = {};
    ["left", "right"].forEach(s => {
      var sp = new Sprite(this.engine.images.get("base-helper").img, helperX[s], H, helperScale);
      sp.rad = 3*Math.PI/2;
      this.helperSprites[s] = sp;
    });

    this.equipSlots = {
      primary: new BoundingRect(center, pairY, size, size),
      effect: new BoundingRect(center + size + gap, pairY, size, size),
      left:        new BoundingRect(hWeaponX(helperX.left),  helperSlotY, size, size),
      leftEffect:  new BoundingRect(hEffectX(helperX.left),  helperSlotY, size, size),
      right:       new BoundingRect(hWeaponX(helperX.right), helperSlotY, size, size),
      rightEffect: new BoundingRect(hEffectX(helperX.right), helperSlotY, size, size),
    };
    this.slotLabels = {
      primary: label("Weapon", center, pairY + size + 2),
      effect: label("Effect", center + size + gap, pairY + size + 2),
      // One "Helper" label per pair, centred above both slots (slot+"Effect" gets
      // no label of its own — the on-hover readout clarifies which is which).
      left: label("Helper", helperX.left - size/2, helperSlotY - 16, Equipment.HELPER_LABEL),
      right: label("Helper", helperX.right - size/2, helperSlotY - 16, Equipment.HELPER_LABEL),
    };

    // Current-weapon badge on the base's chest: SHAPE = weapon type (from the
    // primary gem), COLOUR = the effect gem's colour. Hover it for live stats.
    this.weaponBadge = { x: W / 2, y: 112, r: 22 };
    this.weaponIconRect = new BoundingRect(W / 2 - 24, 112 - 24, 48, 48);

    // Equip slots behave like inventory slots: drop a gem on an empty slot to
    // equip, a matching gem to merge in place, a DIFFERENT gem to swap.
    this.engine.on("stopDragItem", (item) => {
      if ( !this.equipHover ) return;
      var slot = this.equipHover;
      if ( item.type !== Equipment.SLOT_TYPES[slot] ) return;
      var src = this.engine.globals.dragSource;
      var current = this.equipment[slot];
      if ( !current ) {
        this.inventory.clearSource(item, src);
        this.equipment[slot] = item;
        this.engine.trigger("itemEquipped");
        this.engine.trigger("openInventory");
        this.engine.trigger("saveRequested");
      } else if ( current === item ) {
        return;   // dropped back on its own slot
      } else if ( item.mergesWith(current) ) {
        var result = new Item(this.engine, item.stats.craft[item.name]);
        this.inventory.clearSource(item, src);
        this.equipment[slot] = result;
        this._mergeFx(item, slot);
        this.engine.trigger("itemsMerged");
        this.engine.trigger("openInventory");
        this.engine.trigger("saveRequested");
      } else {
        // SWAP: equip the dragged gem; the displaced gem goes to the drag's origin.
        if ( src && src.kind === "equip" ) this.equipment[src.slot] = current;
        else if ( src && src.kind === "synth" ) this.inventory.machines[src.slot].loaded = { name: current.name, tier: current.tier };
        else { this.inventory.remove(item); this.inventory.add(current); }
        this.equipment[slot] = item;
        this.engine.trigger("itemEquipped");
        this.engine.trigger("openInventory");
        this.engine.trigger("saveRequested");
      }
    });
  }

  // Merge feedback shared by the equip slots: a poof off the cursor + a white
  // flash on the slot (mirrors the inventory grid's merge animation).
  _mergeFx(item, slot) {
    this.engine.register(new EffectRect(this.engine, this.engine.globals.cursor.rect, {
      color: item.borderColor, icon: item.icon, grow: -0.6, fade: 0.06,
    }));
    this.equipFlash[slot] = SLOT_FLASH_FRAMES;
  }

  onMouseClick(event) {
    // Pick up the equipped gem to drag it (out to inventory = unequip; onto
    // another slot = move/merge). No more click-to-unequip.
    if ( this.equipHover && this.equipment[this.equipHover] ) {
      this.engine.globals.dragItem = this.equipment[this.equipHover];
      this.engine.globals.dragSource = { kind: "equip", slot: this.equipHover };
    }
  }

  onMouseMove(event) {
    this.weaponHover = this.weaponIconRect.contains(event.pos);
    for ( var key in this.equipment ) {
      var slot = this.equipSlots[key];
      slot.hover = slot.contains(event.pos);
      if ( slot.hover ) {
        this.equipHover = key;
        // Equip slots hold gems, which have no tooltip — use the weapon badge.
        this.engine.globals.toolTipItem = null;
        return;
      }
      this.equipHover = null;
    }
  }

  // Weapon "kind" from the primary gem's projectile flags (colour-agnostic).
  _weaponType(gem) {
    if ( !gem ) return "basic";
    var p = gem.projectile || {};
    if ( p.aoe ) return "aoe";
    if ( p.laser ) return "laser";
    if ( p.small || p.alternate ) return "stinger";
    return "ball";
  }

  _weaponName(type) {
    return { stinger: "Stinger", ball: "Ball", aoe: "AOE Blast", laser: "Laser", basic: "Basic Shot" }[type];
  }

  // Effect-gem description lines. `cfg` is the gemEffect config (homing has BOTH
  // homing + a small damageMult, so we key off the label, not damageMult). For
  // homing we add a tracking metric that improves with tier (deg/s for seeking
  // projectiles, or the beam-bend angle for the laser) so higher tiers read as
  // better homing.
  _effectLines(cfg, weaponType) {
    if ( !cfg ) return [];
    var lines = [cfg.label];
    if ( cfg.homing ) {
      lines.push(weaponType === "laser"
        ? "Beam bend " + Math.round((cfg.laserArc || 0) * 180 / Math.PI) + "°"
        : "Tracking " + Math.round((cfg.homingTurn || 0) * 60 * 180 / Math.PI) + "°/s");
    }
    if ( cfg.aoe ) lines.push("Blast radius " + Math.round(cfg.aoeRadius || 0));
    return lines;
  }

  // Live weapon stats from the equipped primary + effect gems (matches Base/Item
  // shoot math: dmg = power × proj.dmg × effectMult; fireRate = speed × proj.speed).
  _weaponStats() {
    var s = this.engine.globals.stats;
    var gem = this.equipment.primary, fx = this.equipment.effect;
    // No gem -> the basic fallback shot (still augmented by an effect gem).
    var p = gem ? gem.projectile : Item.NONE.stats.projectile;
    var base = s.power.val * (p.damage ?? 1);
    var mult = fx?.effect?.damageMult ?? 1;
    var type = this._weaponType(gem);
    return {
      type,
      name: gem ? this._weaponName(type) + " T" + gem.tier : "Basic Shot",
      base: base,                 // base weapon damage (shown to the left)
      bonus: base * mult - base,  // effect's added damage (shown in parens)
      rate: s.speed.val * (p.speed ?? 1),
      effectLines: this._effectLines(fx?.effect, type),
      effectColor: fx?.effect ? (Equipment.LABEL_COLORS[fx.effect.color] ?? "#cbd5e1") : null,
    };
  }

  // A helper turret's live stats (half damage + half rate), now including its OWN
  // effect gem. `side` = "left" | "right".
  _helperStats(side) {
    var gem = this.equipment[side];
    if ( !gem ) return { none: true, name: "Helper (empty)" };
    var s = this.engine.globals.stats;
    var p = gem.projectile;
    var fx = this.equipment[side + "Effect"];
    var type = this._weaponType(gem);
    var base = s.power.val * (p.damage ?? 1) * HELPER_MULT;
    var mult = fx?.effect?.damageMult ?? 1;
    return {
      name: this._weaponName(type) + " T" + gem.tier,
      base: base,
      bonus: base * mult - base,
      rate: s.speed.val * (p.speed ?? 1) * HELPER_MULT,
      effectLines: this._effectLines(fx?.effect, type),
      effectColor: fx?.effect ? (Equipment.LABEL_COLORS[fx.effect.color] ?? "#cbd5e1") : null,
    };
  }

  // A small dark readout box of text lines, centred at cx, clamped to the panel.
  _drawReadout(lines, cx, topY, accent) {
    var ctx = this.ctx;
    var bw = 168, lh = 15, bh = lines.length * lh + 8;
    var px = Math.max(2, Math.min(this.width - bw - 2, cx - bw / 2));
    var py = Math.max(2, Math.min(this.height - bh - 2, topY));
    ctx.save();
    ctx.fillStyle = "rgba(6,8,15,0.92)";
    ctx.strokeStyle = accent ?? "#5a6b8a";
    ctx.lineWidth = 1;
    ctx.fillRect(px, py, bw, bh);
    ctx.strokeRect(px, py, bw, bh);
    ctx.restore();
    lines.forEach((ln, i) => {
      Text.draw(ctx, ln.t, px + bw / 2, py + 5 + i * lh, { fontSize: 12, fontColor: ln.c, center: true });
    });
  }

  _drawWeaponBadge(ctx, b, type, color, hover) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(8,10,18,0.88)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = hover ? "#ffffff" : color;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if ( type === "ball" ) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 9, 0, Math.PI * 2);
      ctx.fill();
    } else if ( type === "stinger" ) {
      [-6, 2].forEach(off => {
        ctx.beginPath();
        ctx.moveTo(b.x + off - 4, b.y - 7);
        ctx.lineTo(b.x + off + 5, b.y);
        ctx.lineTo(b.x + off - 4, b.y + 7);
        ctx.stroke();
      });
    } else if ( type === "aoe" ) {
      for ( var i = 0; i < 8; i++ ) {
        var a = i * Math.PI / 4;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(b.x + Math.cos(a) * 5, b.y + Math.sin(a) * 5);
        ctx.lineTo(b.x + Math.cos(a) * 13, b.y + Math.sin(a) * 13);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
      ctx.fill();
    } else if ( type === "laser" ) {
      // A vertical beam with a bright core + a muzzle dot.
      ctx.lineWidth = 5;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y - 13);
      ctx.lineTo(b.x, b.y + 13);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y - 13);
      ctx.lineTo(b.x, b.y + 13);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(b.x, b.y + 11, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "#8a93a8";
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawComponent() {
    this.base.draw(this.ctx);
    // The two helper turrets, behind their slots.
    this.helperSprites.left.draw(this.ctx);
    this.helperSprites.right.draw(this.ctx);
    this.borderRect.draw(this.ctx);
    for ( var key in this.equipment ) {
      var slot = this.equipSlots[key];
      var equip = this.equipment[key];
      equip?.icon.draw(this.ctx, slot);
      slot.draw(
        this.ctx, equip?.borderColor ?? Item.borderColors[Equipment.SLOT_TYPES[key]],
      );
      this.slotLabels[key]?.draw(this.ctx);
      // White merge flash: bright fill + a glowing border (matches inventory pulse).
      if ( this.equipFlash[key] > 0 ) {
        var f = flashAlpha(this.equipFlash[key]);
        this.ctx.save();
        this.ctx.globalAlpha = f;
        this.ctx.fillStyle = "#ffffff";
        this.ctx.fillRect(slot.x, slot.y, slot.w, slot.h);
        this.ctx.globalAlpha = 1;
        this.ctx.shadowColor = "#ffffff";
        this.ctx.shadowBlur = 14 * f;
        this.ctx.lineWidth = 3;
        this.ctx.strokeStyle = "rgba(255,255,255," + f + ")";
        this.ctx.strokeRect(slot.x, slot.y, slot.w, slot.h);
        this.ctx.restore();
        this.equipFlash[key] -= 1;
      }
    }

    // (The effect's description lives in the weapon-badge tooltip now; the badge
    // colour conveys the equipped effect, so no text beside the effect slot.)

    var fmt = n => (Math.round(n * 100) / 100).toString();

    // Current-weapon badge (shape = type, colour = effect). The player's weapon
    // readout is ALWAYS shown (not just on hover); helper readouts are on-hover.
    var stats = this._weaponStats();
    var badgeColor = stats.effectColor ?? "#cfd6e2";
    this._drawWeaponBadge(this.ctx, this.weaponBadge, stats.type, badgeColor, this.weaponHover);

    var lines = [
      { t: stats.name, c: badgeColor },
      { t: "Dmg " + fmt(stats.base) + (stats.bonus > 0.001 ? " (+" + fmt(stats.bonus) + ")" : ""), c: "#e8edf6" },
      { t: "Rate " + fmt(stats.rate) + "/s", c: "#e8edf6" },
    ];
    (stats.effectLines || []).forEach(t => lines.push({ t, c: stats.effectColor ?? "#cbd5e1" }));
    this._drawReadout(lines, this.weaponBadge.x, this.weaponBadge.y + this.weaponBadge.r + 6, badgeColor);

    // Hovering EITHER of a helper's slots (weapon or effect) shows that turret's
    // combined stats (half dmg / rate + its effect). On-hover only, so the two
    // helper readouts don't blanket the bottom of the panel.
    var helperSide = (this.equipHover === "left" || this.equipHover === "leftEffect") ? "left"
                   : (this.equipHover === "right" || this.equipHover === "rightEffect") ? "right" : null;
    if ( helperSide ) {
      var hs = this._helperStats(helperSide);
      var hlines = hs.none
        ? [ { t: hs.name, c: "#9aa7c2" } ]
        : [
            { t: "Helper — " + hs.name, c: Equipment.HELPER_LABEL },
            { t: "Dmg " + fmt(hs.base) + (hs.bonus > 0.001 ? " (+" + fmt(hs.bonus) + ")" : ""), c: "#e8edf6" },
            { t: "Rate " + fmt(hs.rate) + "/s", c: "#e8edf6" },
          ];
      if ( !hs.none ) (hs.effectLines || []).forEach(t => hlines.push({ t, c: hs.effectColor ?? "#cbd5e1" }));
      // Centre the readout over the pair, just above the slots (raised earlier so it fits).
      var wSlot = this.equipSlots[helperSide], eSlot = this.equipSlots[helperSide + "Effect"];
      var pairCx = (wSlot.x + eSlot.x + eSlot.w) / 2;
      this._drawReadout(hlines, pairCx, wSlot.y - (hlines.length * 15 + 8) - 4, Equipment.HELPER_LABEL);
    }
  }
}