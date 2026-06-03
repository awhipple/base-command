import UIWindow from "../../engine/gfx/ui/window/index.js";
import Text from "../../engine/gfx/Text.js";
import { BoundingRect } from "../../engine/GameMath.js";
import { UIComponent } from "../../engine/gfx/ui/window/UIComponent.js";
import Item, { GEM_MAX_TIER, BURST_SECONDS } from "../Item.js";
import CrackleBed from "../../engine/CrackleBed.js";
import { drawTurret, weaponTypeOf, effectColorOf } from "../TurretSprite.js";
import { roundedRectPath } from "./canvas.js";
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
const IDLE_FUEL_PER_TIER = 0.5;   // a loaded gem idles at tier × this fuel/sec (T1=0.5/s, T2=1/s…)
// NOTE: keep this a power-of-two fraction (0.25, 0.5, …) so tier × it stays an
// exactly-representable float and the integer sub-fuel accounting never drifts.

// EXACT accounting. Fuel is tracked in integer "sub-fuel" units (1 fuel =
// FUEL_SCALE sub-fuel) so per-frame accumulation never drifts: at 60fps the
// per-frame idle drip is `idleFuel/sec` sub-fuel and a burning hourglass drains
// its `rate` sub-fuel/frame — both whole numbers given integer GEN_SECONDS /
// IDLE_FUEL_PER_TIER / HOURGLASS_FUEL / BURST_SECONDS. A gem costs an integer
// number of sub-fuel, so `fuel >= cost` is exact: N hourglasses convert to a
// deterministic number of gems with no floating-point fuzz at the boundary.
const FUEL_SCALE = 60;          // sub-fuel per fuel (== fps, so per-frame drips are whole)

// Machine leveling: each machine produces levelGems(level) gems at its own `level`
// (output tier), filling the yellow XP bar, then bumps to the next tier — a bigger
// gem but ~twice as long per level (output rate stays ~flat; you just start higher).
//
// Why 16 (a power of two): a single level's batch then merges all the way up
// cleanly (16 → 8 → 4 → 2 → 1) to ONE gem four tiers higher. But across levels the
// merged-up batches collide — level L's 16 land at tier L+4, so levels 1..4 leave
// lone T5/T6/T7/T8 gems that never pair up (the "straggler leak"). LEVEL 5 makes 17
// instead: that one extra T5 pairs with level 1's leftover T5 and cascades up
// (T5→T6→T7→T8→T9→T10), zeroing the leak. It brings the running total to an exact
// power of two (512 = one T10) at level 5, after which every later 16-batch just
// doubles it, so the whole lifetime output collapses to pure T10 with NO low-tier
// leftovers. (Verified by merge sim; a 17th at any OTHER level re-breaks it.)
const LEVEL_GEMS = { 5: 17 };          // per-level overrides; default below
const LEVEL_GEMS_DEFAULT = 16;
function levelGems(level) { return LEVEL_GEMS[level] ?? LEVEL_GEMS_DEFAULT; }

// Helper turrets fire at half damage AND half rate (mirrors Helper.FIRE_MULT /
// DAMAGE_MULT) and ignore the effect gem — used for the helper hover readout.
const HELPER_MULT = 0.5;

// White merge-flash duration (frames) shared by ALL three drop regions (inventory
// grid, synth slots, equip slots) so every merge feels identical. ~0.8s at 60fps.
// flashAlpha() snaps to FULLY OPAQUE (peak 1.0) and holds for the first ~60% so the
// gem is completely hidden — the "magic merge" — then fades over the last ~40% to
// reveal the upgraded gem. (Peaking below 1.0 lets the gem show through, which
// reads as a computery snap-swap instead of a merge.)
const SLOT_FLASH_FRAMES = 50;
function flashAlpha(f) { return Math.min(1, (f / SLOT_FLASH_FRAMES) * 2.5); }

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

    // The slide-out tab handle straddles the panel's left edge (originX): the
    // "SYNTH" label shows on the protruding half when the panel is closed,
    // "CLOSE" (= back to the title screen) when it's open. invOpenClick is the
    // hit region (its x tracks the panel in update()); the look is drawn by
    // _drawTab() in the title screen's button language.
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

    // The three drop regions, cached once (built by super()'s _generateComponents).
    this._items = this.components.find(c => c instanceof Items);
    this._synth = this.components.find(c => c instanceof Synthesis);
    this._equip = this.components.find(c => c instanceof Equipment);

    // SINGLE drop authority. The Cursor fires "stopDragItem" once per release with
    // whatever gem is on the cursor; we resolve it here and nowhere else. (The old
    // design had three independent handlers racing on the shared dragItem, which
    // let one drop be consumed twice — gems lost / merged into the wrong slot.)
    this.engine.on("stopDragItem", (item) => this._resolveDrop(item));
  }

  // Resolve a finished drag exactly once. Find the ONE slot under the cursor (by
  // region, since the regions don't overlap) and hand off to inventory.resolveDrop,
  // then play the matching feedback. Anything off a valid target snaps back.
  _resolveDrop(drag) {
    if ( !drag ) return;
    var inv = this.engine.globals.inventory;
    var src = this.engine.globals.dragSource;

    // An hourglass (boost) dropped on a synth MACHINE is BURNED for a fuel burst —
    // a special action, not a slot move. Checked first so a boost over the synth
    // always burns (boosts can still merge/rearrange when dropped on the grid).
    if ( drag.type === "boost" && this._synth && this._synth.hoverMachine ) {
      this._synth.burn(drag);
      return;
    }

    // Otherwise it's a slot move. Pick the hovered target by region priority.
    var target = (this._equip && this._equip.dropRef())
              || (this._synth && this._synth.dropRef())
              || (this._items && this._items.dropRef());
    if ( !target ) return;                       // dropped on empty space → snap back

    var res = inv.resolveDrop(drag, src, target);
    if ( res.action === "none" ) return;         // rejected → nothing changed

    if ( res.action === "merge" ) {
      // Poof off the cursor + a white flash on the slot that received the merge.
      this.engine.register(new EffectRect(this.engine, this.engine.globals.cursor.rect, {
        color: drag.borderColor, icon: drag.icon, grow: -0.6, fade: 0.06,
      }));
      if ( target.kind === "equip" ) this._equip.flashSlot(target.slot);
      else if ( target.kind === "synth" ) this._synth.flashSlot(target.slot);
      else if ( target.kind === "inv" ) this._items.flashSlot(target.index);
      this.engine.trigger("itemsMerged");
    } else if ( target.kind === "equip" ) {
      this.engine.trigger("itemEquipped");   // move/swap into an equip slot
    }

    this.engine.trigger("openInventory");        // rebuild the grid's icon rects
    this.engine.trigger("saveRequested");
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
    this._drawTab(ctx);
  }

  // The slide-out tab handle, in the title screen's button language: rounded,
  // navy gradient, green accent + glow on hover. It straddles the panel's left
  // edge (originX), so the LEFT half ("SYNTH") shows when the panel is closed
  // (off to the right) and the RIGHT half ("CLOSE" — back to the title screen)
  // shows when it's open. The two labels cross-fade as the panel slides.
  _drawTab(ctx) {
    var W = this.engine.window.width;
    var x = this.originX - 48, y = 310, w = 96, h = 170;
    var hover = this.hoverInv;
    var accent = "#7ee787";
    // 1 when fully closed (panel parked right) → 0 when fully open; drives the
    // INVENTORY↔CLOSE label cross-fade so only the on-screen half reads.
    var t = Math.max(0, Math.min(1, this.originX / W));

    ctx.save();

    // Body — rounded handle, vertical navy gradient, accent border (+glow hover).
    roundedRectPath(ctx, x, y, w, h, 18);
    var bg = ctx.createLinearGradient(x, y, x, y + h);
    if ( hover ) { bg.addColorStop(0, "#1c2a44"); bg.addColorStop(1, "#0a1226"); }
    else         { bg.addColorStop(0, "#121a2c"); bg.addColorStop(1, "#070b17"); }
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = hover ? accent : "#3a4a6a";
    if ( hover ) { ctx.shadowColor = accent; ctx.shadowBlur = 14; }
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.font = "15px Lucida Console, Menlo, monospace";   // lighter than bold — the tab read too heavy
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var cy = y + h / 2;

    // LEFT half: "SYNTH" (visible closed). Left chevrons hint "pull open".
    if ( t > 0.02 ) {
      ctx.globalAlpha = t;
      var cInv = hover ? "#eaffea" : "#cfd6e2";
      this._tabChevron(ctx, x + 23, y + 26, "left", cInv);
      this._vTabText(ctx, "SYNTH", x + 23, cy, cInv);
      this._tabChevron(ctx, x + 23, y + h - 26, "left", cInv);
    }
    // RIGHT half: "CLOSE" (visible open). Right chevrons hint "push to close".
    if ( t < 0.98 ) {
      ctx.globalAlpha = 1 - t;
      var cCls = hover ? "#eaffea" : "#9aa7c2";
      this._tabChevron(ctx, x + 73, y + 26, "right", cCls);
      this._vTabText(ctx, "CLOSE", x + 73, cy, cCls);
      this._tabChevron(ctx, x + 73, y + h - 26, "right", cCls);
    }

    ctx.restore();
  }

  // Vertical label (reads bottom-to-top) centred at (cx, cy).
  _vTabText(ctx, text, cx, cy, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  // A small rounded chevron pointing "left"/"right" (the panel slide direction).
  _tabChevron(ctx, cx, cy, dir, color, size = 5) {
    var s = dir === "left" ? 1 : -1;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(cx + s * size / 2, cy - size);
    ctx.lineTo(cx - s * size / 2, cy);
    ctx.lineTo(cx + s * size / 2, cy + size);
    ctx.stroke();
    ctx.restore();
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

    var synth = this._synth, items = this._items;
    if ( !synth || !items ) return;
    var machine = synth.machines.find(x => x.gem === machineGem);
    if ( !machine ) return;

    var index = this.engine.globals.inventory.items.indexOf(item);
    if ( index < 0 ) return;
    var row = Math.floor(index / 8), col = index % 8;

    // START: machine output-icon centre (Synthesis-local) → screen.
    var r = machine.body, step = items.iconSize + items.iconPadding, sz = items.iconSize;
    var start = this._mapFromComponent(this, synth, r.x + r.w / 2, r.y + r.h / 2);

    // Is that slot's row currently scrolled into the visible grid window? The grid
    // shows `iconRows` rows starting at the scrolled-to row.
    var topRow = Math.round((items.menu.scroll || 0) / step);
    var onScreen = row >= topRow && row < topRow + items.iconRows;

    if ( onScreen ) {
      // Land it crisply in its slot. END: slot centre (ItemRow-local) → items.menu
      // → Items-local → screen. Hide the gem in its slot until the flyer lands
      // (save-safe: it's already in inventory; the flag is transient + unserialized).
      var rowComp = items.menu.components[row];
      if ( !rowComp ) return;
      var inMenu = this._mapFromComponent(items.menu, rowComp, col * step + sz / 2, sz / 2);
      var end = this._mapFromComponent(this, items, inMenu.x, inMenu.y);
      item._inFlight = true;
      this.engine.register(new FlyingGem(this.engine, item.icon, start, end, {
        color: item.color,
        onLand: () => { item._inFlight = false; },
      }));
    } else {
      // Destination is scrolled off-screen — there's no slot to land in, so fly a
      // generic "whoosh" up to the top-centre of the visible grid and fade it out.
      // The gem already lives in its (scrolled-away) slot; this is just the cue.
      var gx = items.menu.rect.x + items.menuWidth / 2;
      var gy = items.menu.rect.y + sz;     // ~one row below the grid's top edge
      var end = this._mapFromComponent(this, items, gx, gy);
      this.engine.register(new FlyingGem(this.engine, item.icon, start, end, {
        color: item.color,
        fadeOut: true,
      }));
    }
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

    this._flash = {};   // white merge-flash frames, keyed by absolute inventory index

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
        owner: this,           // rows report the hovered slot up to here (hoverRef)
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
    // Anchored to the component's bottom so it lines up with the grid's bottom
    // edge (and won't drift if the visible row count changes).
    this.sortRect = new BoundingRect(480, this.height - 32, 50, 28);
    this.sortText = new Text('Sort', 487, this.height - 28, {
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

    // Tick down merge flashes here (once/frame) so the fade is redraw-independent.
    for ( var k in this._flash ) {
      if ( this._flash[k] > 0 ) this._flash[k] -= 1;
      else delete this._flash[k];
    }
  }

  // The inventory slot currently under the cursor (set by the hovered ItemRow on
  // move, cleared here each move). null when the cursor isn't over the grid.
  dropRef() { return this.hoverRef ?? null; }

  // White merge-flash on an inventory slot (matches the synth/equip slot flash).
  // Drawn by the owning ItemRow; ticked down in update() so it lasts the same time
  // regardless of redraws.
  flashSlot(index) { this._flash[index] = SLOT_FLASH_FRAMES; }

  onMouseMove(event) {
    this.engine.globals.toolTipItem = null;
    this.hoverSort = this.sortRect.contains(event.pos);
    this.hoverRef = null;                 // cleared before rows run; the hovered row resets it

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
    var idx = c + this.options.index;
    var item = this.options.inventory.items[idx];
    if ( item ) {
      this.engine.globals.dragItem = item;
      this.engine.globals.dragSource = { kind: "inv", index: idx };   // exact slot to vacate
    }
  }

  onMouseMove(event) {
    var drag = this.engine.globals.dragItem;
    this.dropCol = null; this.moveIdx = null;

    var c = this._colAt(event.pos);
    if ( c === -1 ) { this.engine.trigger("unhoverItem"); return; }

    var idx = c + this.options.index;
    var target = this.options.inventory.items[idx];
    // Every hovered item gets a tooltip. Gems show a COMPACT one (just name + tier
    // — their weapon/effect stats stay hidden, learned via the equipped badge);
    // hourglasses show their full fuel-rate / burn-duration tooltip. (ToolTip
    // branches on item.type.)
    this.engine.globals.toolTipItem = target ?? null;

    // Report the hovered slot up to the grid so the drop coordinator can find it.
    // (Items.onMouseMove cleared hoverRef before dispatching; only the row under
    // the cursor sets it, so there's no clobbering between rows.)
    if ( drag ) {
      this.options.owner.hoverRef = { kind: "inv", index: idx };
      if ( !target ) { this.moveIdx = idx; this.dropCol = c; }   // empty → draw the move outline
    }
    if ( !target ) this.engine.trigger("unhoverItem");
  }

  update() {
    this.iconRects.forEach(rect => rect?.update());
  }

  drawComponent() {
    var dragItem = this.engine.globals.dragItem;
    var size = this.options.iconSize, step = size + this.options.iconPadding;

    // Data-driven: each column's icon is rebuilt from the live items array, and a
    // slot with no item drops its cached rect. So a slot can never keep showing a
    // gem that has moved/merged away (the old "vanishing / wrong icon" bug), and
    // a freed slot can never paint a ghost.
    for ( var i = 0; i < this.options.itemCount; i++ ) {
      var item = this.options.inventory.items[i + this.options.index];

      // Empty, or a gem still flying in from its synth (revealed on land — see
      // FlyingGem / _spawnGemFlyer): show nothing and forget any stale cache.
      if ( !item || item._inFlight ) {
        this.iconRects[i] = null;
        continue;
      }

      var rect = this.iconRects[i];
      if ( !rect || rect.item !== item ) {
        rect = this.iconRects[i] = new EffectRect(this.engine, {x: i * step, y: 0, w: size, h: size}, {
          icon: item.icon,
          color: Item.borderColors[item.type],
        });
        rect.item = item;
      }
      // Dim the dragged gem itself and anything it can't merge with, so valid
      // merge targets (same colour + tier) stay highlighted.
      rect.alpha = (item === dragItem || (dragItem && !dragItem.mergesWith(item))) ? 0.3 : 1.0;
      rect.draw(this.ctx);

      // White merge-flash over the just-merged slot (matches synth/equip). Ticked
      // down in Items.update; drawn on top of the new gem's icon.
      var ff = this.options.owner._flash[i + this.options.index];
      if ( ff > 0 ) {
        this.ctx.save();
        this.ctx.globalAlpha = flashAlpha(ff);
        this.ctx.fillStyle = "#ffffff";
        this.ctx.fillRect(i * step, 0, size, size);
        this.ctx.restore();
      }
    }

    // While dragging over an empty slot in this row, outline it as the move target.
    if ( dragItem && this.moveIdx != null && this.dropCol != null ) {
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

    // Drops are resolved centrally by InventoryMenu._resolveDrop (it calls our
    // dropRef()/burn() below). No per-component drop listener here — one drop, one
    // handler, so a gem can't be consumed by two places at once.
  }

  // The slot under the cursor for a GEM drop = the whole hovered machine (colour-
  // locked in resolveDrop). null when not over a machine. Used by the coordinator.
  dropRef() { return this.hoverMachine ? { kind: "synth", slot: this.hoverMachine } : null; }

  // White merge-flash on a machine's fuel slot (matches the inventory grid pulse).
  flashSlot(gem) { this.slotFlash[gem] = SLOT_FLASH_FRAMES; }

  // Idle fuel/sec from the loaded gem (0 if empty) — no base rate. In sub-fuel
  // units this is ALSO the exact per-frame idle drip (see FUEL_SCALE).
  _idleFuel(st) {
    return st.loaded ? st.loaded.tier * IDLE_FUEL_PER_TIER : 0;
  }

  // Burst fuel/sec of the CURRENTLY burning hourglass (queue head; 0 if none) —
  // the honest tier rate, shown in the readout and used as the per-frame drain.
  _burstFuel(st) {
    var head = st.burstQueue && st.burstQueue[0];
    return head ? head.rate : 0;
  }

  // Total seconds of burn left across the whole queue (head + everything waiting).
  _burstSeconds(st) {
    var frames = 0;
    (st.burstQueue || []).forEach(b => { if ( b.rate ) frames += b.left / b.rate; });
    return frames / 60;
  }

  // Sub-fuel needed for one gem at this output level. Integer, so `fuel >= cost`
  // is exact. Doubles per level (bigger gem) — see FUEL_SCALE / PROGRESSION.md.
  _gemCost(level) {
    return GEN_SECONDS * FUEL_SCALE * Math.pow(2, (level || 1) - 1);
  }

  // Sacrifice an hourglass for a +fuel/sec burst (item.fuel) over a fixed duration
  // (item.seconds). Works on an empty synth too. Called by InventoryMenu._resolveDrop
  // when a boost is released over a machine (gem loads go through resolveDrop).
  //
  // PRIORITY-QUEUE model: each hourglass is its OWN burn (`{rate, left}` sub-fuel)
  // that runs for its full duration at its own rate. The queue is kept sorted by
  // rate DESCENDING and only the head (highest fuel/s) burns, so a big cell you
  // drop jumps ahead of a small one still burning — and that small one resumes
  // afterward with its remaining fuel intact. Exact regardless of interleaving:
  // `left` is always a whole multiple of `rate` (starts rate×seconds×FUEL_SCALE,
  // drains rate/frame), so preemption changes only WHICH cell drains a frame, never
  // the amount. Total time = Σ(left/rate); the rate readout follows the head.
  burn(item) {
    if ( !this.hoverMachine ) return;
    var m = this.machines.find(x => x.gem === this.hoverMachine);
    var st = this.inventory.machines[this.hoverMachine];
    if ( !m || !st ) return;
    var rate = item.fuel || 0;                          // fuel/s == sub-fuel/frame
    var seconds = item.seconds || BURST_SECONDS;
    // ONE-TIME starter bonus: the FIRST hourglass burned on a save burns at DOUBLE
    // rate. Since its fuel = rate × seconds, doubling the rate doubles the fuel too
    // (a bare T1 → exactly one full gem) while still draining in ~BURST_SECONDS.
    if ( !this.inventory.firstHourglassBonusUsed ) {
      rate *= 2;
      this.inventory.firstHourglassBonusUsed = true;
    }
    var left = rate * seconds * FUEL_SCALE;             // EXACT sub-fuel; drains at `rate` → `seconds`
    // Insert sorted by rate desc, BEFORE the first strictly-lower-rate cell. Stable
    // for ties, so equal-rate cells keep arrival order (a fresh cell never preempts
    // an in-progress same-rate burn).
    var q = st.burstQueue = st.burstQueue || [];
    var at = q.findIndex(b => b.rate < rate);
    if ( at === -1 ) q.push({ rate, left }); else q.splice(at, 0, { rate, left });
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
      var head = st.burstQueue && st.burstQueue[0];  // head = highest-rate cell (queue is sorted desc)
      if ( head ) {
        var drain = Math.min(head.rate, head.left);  // exact: left is a whole multiple of rate
        st.fuel += drain;
        head.left -= drain;
        this._emitFire(m);
        if ( head.left <= 0 ) st.burstQueue.shift();  // spent → next in queue starts next frame
      }
      var cost = this._gemCost(st.level);
      while ( st.fuel >= cost ) {
        var made = this.inventory.add(gemName(m.gem, st.level));
        this.engine.trigger("gemSynthed", made, m.gem);   // fly it into its slot (if panel open)
        st.fuel -= cost;
        // XP: producing levelGems(level) gems levels the machine up one tier, so
        // it then starts you at the next gem tier (capped at GEM_MAX_TIER).
        if ( st.level < GEM_MAX_TIER ) {
          st.xp += 1;
          if ( st.xp >= levelGems(st.level) ) { st.xp = 0; st.level += 1; cost = this._gemCost(st.level); }
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
    var anyBurning = this.machines.some(m => (this.inventory.machines[m.gem]?.burstQueue?.length || 0) > 0);
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
      var surging = (st.burstQueue?.length || 0) > 0;
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
      var xpH = level < GEM_MAX_TIER ? bh * (xp / levelGems(level)) : bh;
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
        // Faint "ghost" of this slot's tier-1 gem so its colour reads at a glance.
        ctx.save();
        ctx.globalAlpha = 0.22;
        this.engine.images.get(Item.list[m.gem].icon).draw(ctx, sl.x + 2, sl.y + 2, sl.w - 4, sl.h - 4);
        ctx.restore();
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

    // Burn countdown on top of each boosting machine — total time left across the
    // whole queue (head + everything waiting). Dark backing for legibility.
    this.machines.forEach(m => {
      var st = this.inventory.machines[m.gem];
      if ( !st || !(st.burstQueue?.length) ) return;
      var r = m.body;
      var label = this._burstSeconds(st).toFixed(1) + "s";
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
  static HELPER_LABEL = "#7fe3ee";   // matches the helper turret tint (Helper.TINT)

  initialize() {
    super.initialize();

    this.borderRect = new BoundingRect(0, 0, this.width, this.height);

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

    // Procedural turret draw params (the old base/base-helper sprites are gone).
    // Aim straight up; the play screen's hand-rolled turret, scaled to the panel.
    this.helperDrawX = helperX;

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

    // Equip slots behave like inventory slots (drop on empty = equip, matching gem
    // = merge, different = swap) — but that logic now lives in inventory.resolveDrop,
    // driven by InventoryMenu._resolveDrop. No per-component drop listener here.
  }

  // The equip slot under the cursor (or null). Used by the drop coordinator.
  dropRef() { return this.equipHover ? { kind: "equip", slot: this.equipHover } : null; }

  // White merge-flash on a slot (mirrors the inventory grid's merge pulse).
  flashSlot(slot) { this.equipFlash[slot] = SLOT_FLASH_FRAMES; }

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
    // The main turret + the two helper minis (the same hand-rolled art as the
    // play screen), aimed up, behind their slots. Shape = equipped weapon type,
    // glow colour = equipped effect (white = none).
    var up = -Math.PI / 2, eq = this.equipment;
    drawTurret(this.ctx, {
      x: this.width / 2, y: this.height, aim: up, scale: 0.8,
      weapon: weaponTypeOf(eq.primary), effectColor: effectColorOf(eq.effect), phase: 0.4,
    });
    ["left", "right"].forEach(s => {
      drawTurret(this.ctx, {
        x: this.helperDrawX[s], y: this.height, aim: up, scale: 0.45, tint: "#35c9d6",
        weapon: weaponTypeOf(eq[s]), effectColor: effectColorOf(eq[s + "Effect"]), phase: 0.4,
      });
    });
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
    // Effect damage modifier in parens: "(+X)" for a buff, "(−X)" for a penalty
    // (chain trades per-hit damage for free reach), nothing when ~0.
    var dmgMod = b => Math.abs(b) <= 0.001 ? "" : " (" + (b < 0 ? "−" : "+") + fmt(Math.abs(b)) + ")";

    // Current-weapon badge (shape = type, colour = effect). The player's weapon
    // readout is ALWAYS shown (not just on hover); helper readouts are on-hover.
    var stats = this._weaponStats();
    var badgeColor = stats.effectColor ?? "#cfd6e2";
    this._drawWeaponBadge(this.ctx, this.weaponBadge, stats.type, badgeColor, this.weaponHover);

    var lines = [
      { t: stats.name, c: badgeColor },
      { t: "Dmg " + fmt(stats.base) + dmgMod(stats.bonus), c: "#e8edf6" },
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
            { t: "Dmg " + fmt(hs.base) + dmgMod(hs.bonus), c: "#e8edf6" },
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