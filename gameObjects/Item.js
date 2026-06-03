import Projectile from "./Projectile.js";
import Image from "../engine/gfx/Image.js";

export const GEM_MAX_TIER = 10;   // 10 art tiles per colour sheet

// Hourglass BURST: every hourglass burns for the SAME fixed duration; higher
// tiers just pour MORE fuel/sec. The burst is a FLAT add to the synth's fuel
// rate (independent of the loaded gem / its idle rate — NOT a multiplier), so
// the idle and burst systems can be balanced separately. Each tier is > 2× the
// previous by a small additive bonus, so merging beats stacking raw ones.
export const HOURGLASS_FUEL = [6, 14, 32, 70, 150, 320, 680]; // fuel/sec, by tier
export const HOURGLASS_MAX_TIER = HOURGLASS_FUEL.length;
export const BURST_SECONDS = 5;   // every hourglass burns this long, any tier

// Energy-cell tier ramp (the old "hourglasses" — now sci-fi fuel cells). Each
// tier climbs a rarity/heat ladder so a brighter, hotter cell instantly reads as
// "more fuel": blue → cyan → emerald → gold → orange → magenta → white-violet
// plasma. SINGLE source of truth, shared by the icon generator (Game.js draws
// the cell from these) and the inventory slot border (per-tier, set below).
// {glow} = outer bloom / deepest tone, {core} = the orb body + slot border,
// {hot} = the white-hot centre.
export const ENERGY_TIER_COLORS = [
  { glow: "#1f5cf0", core: "#5b93ff", hot: "#d4e6ff" }, // T1 blue
  { glow: "#08a6cc", core: "#34d6f2", hot: "#d6fbff" }, // T2 cyan
  { glow: "#10a64f", core: "#3fe389", hot: "#d8ffe9" }, // T3 emerald
  { glow: "#c8930f", core: "#ffd24a", hot: "#fff6d2" }, // T4 gold
  { glow: "#d85a12", core: "#ff9648", hot: "#ffe5d0" }, // T5 orange
  { glow: "#c41680", core: "#ff5cb6", hot: "#ffd9ee" }, // T6 magenta
  { glow: "#7b2ff5", core: "#c08bff", hot: "#ffffff" }, // T7 plasma violet
];

// Hourglasses (type "boost"): dropped by levels, dragged onto a synthesizer for
// a flat fuel/sec burst (with a fiery particle burn). Mergeable. Tooltip text is
// GENERATED from the constants above — changing them never needs a manual edit.
function buildHourglasses() {
  var out = {};
  var nameFor = t => t === 1 ? "hourglass" : "hourglass" + t;
  for ( var tier = 1; tier <= HOURGLASS_MAX_TIER; tier++ ) {
    var fuel = HOURGLASS_FUEL[tier - 1];
    var entry = {
      type: "boost",
      color: "energy",
      tier,
      fuel,
      seconds: BURST_SECONDS,
      value: 20 * Math.pow(2, tier - 1),
      icon: "hourglass-" + tier,   // image name kept stable; art is now an energy cell
      // Per-tier slot/cursor border matches the cell's core colour so the tier
      // reads even at a glance in the grid.
      borderColor: (ENERGY_TIER_COLORS[tier - 1] || ENERGY_TIER_COLORS[0]).core,
      toolTipName: "Energy Cell T" + tier,
      description: "Drop on a synthesizer for +" + fuel + " fuel/s for "
        + BURST_SECONDS + "s. Merge two to make a bigger one.",
    };
    if ( tier < HOURGLASS_MAX_TIER ) entry.craft = { [nameFor(tier)]: nameFor(tier + 1) };
    out[nameFor(tier)] = entry;
  }
  return out;
}

// Per-tier effect config for a gem colour. Tier 1 is the synthesized base;
// merging two of the same colour+tier yields the next tier (see buildGems).
// Numbers are deliberately rough — easy to tune later.
// The three effects trade PER-TARGET damage against REACH, so each owns a niche:
//   • homing (blue)  — single target, so it hits the HARDEST per shot. Your tool
//                       for one fast, evasive target (e.g. a Strafer).
//   • explosive (red)— only damages enemies clustered near the impact, so it hits
//                       HARD per target too (beats chain) but needs them bunched.
//   • chain (yellow) — jumps between enemies at ANY distance = guaranteed, free
//                       AOE, so it pays for that reach with LOW per-target damage.
// Net: lone target → homing wins; tight cluster → explosive wins; spread out at
// range → chain reaches everyone but tickles. (Numbers rough — easy to tune.)
function gemEffect(color, tier) {
  if ( color === "red" ) {
    // Explosive: shots blast on impact (AOE) — works on ball, stinger, or laser.
    // Radius grows with tier; damage falls off centre→rim (see Projectile). High
    // per-target multiplier so a centred hit on a cluster hurts — its weakness is
    // it does nothing to enemies that aren't bunched up.
    return {
      color, aoe: true,
      aoeRadius: Math.round(120 * (1 + 0.2 * (tier - 1))),
      damageMult: 1.0 + 0.044 * (tier - 1),                        // T1=1.0 → T10≈1.4 per enemy; the multi-hit is the payoff
      label: "Explosive T" + tier,
    };
  }
  if ( color === "blue" ) {
    // Homing = a FLOOR (always perceptible, even at T1 you can see it curve)
    // plus a QUADRATIC curve on top, so low tiers feel loose — a clear nudge you
    // still have to aim — and high tiers zero in tight. homingTurn T1=0.004
    // (turn radius ~1250px, gently curving) → T10≈0.103 (~50px, tight).
    // Single-target only, so it carries a BIG damage multiplier to keep pace with
    // the multi-hit effects — this is the gem you bring to delete one Strafer.
    return {
      color, homing: true,
      homingTurn: 0.004 + 0.001 * (tier * tier - 1),               // floor + quadratic, per-frame turn rate
      laserArc: Math.min(Math.PI * 0.6, Math.PI * (0.025 + 0.008 * (tier * tier - 1))), // floor + quadratic bend limit
      damageMult: 1.5 + 0.167 * (tier - 1),                        // T1=1.5 → T10≈3.0, focused single-target premium
      label: "Homing T" + tier,
    };
  }
  // yellow: chain. T1 = 1 jump (2 enemies); falloff starts gentler than 50% and
  // improves with tier so deeper chains stay worthwhile. LOW base damage (0.5×) —
  // its value is free, infinite-range coverage, not raw per-hit power.
  return {
    color,
    damageMult: 0.5,                                               // low per-target — the cost of guaranteed AOE
    chain: { jumps: tier, falloff: Math.min(0.9, 0.6 + 0.03 * (tier - 1)) },
    label: "Chain T" + tier,
  };
}

// A gem's WEAPON role (when in the primary or a helper slot): colour picks the
// weapon type, tier scales BOTH damage and attack speed (fire rate). red=ball,
// blue=stinger (rapid), yellow=laser (hit-scan). Rough first pass — tunable.
function gemWeapon(color, tier) {
  var base = {
    red:    { damage: 1.0, speed: 1.0 },                                                // ball
    blue:   { damage: 0.6, speed: 2.0, alternate: true, scaleDown: true, small: true }, // stinger (rapid)
    yellow: { damage: 1.5, speed: 0.9, laser: true },                                  // laser (hit-scan)
  }[color];
  return {
    ...base,
    damage: base.damage * tier,             // tier -> damage
    speed: base.speed * (1 + 0.5 * (tier - 1)), // tier -> attack speed (milder)
  };
}

// Generate every gem tier for white/blue/yellow. tier 1 keeps the bare colour
// name (so synth output / saves stay stable); tiers 2+ append the tier number.
// `value` = total fuel sunk in (base × 2^(tier-1)) = the furnace refund. Each
// tier's `craft` maps "same gem + same gem -> next tier" (capped at GEM_MAX_TIER).
// Each gem carries BOTH a weapon role (`projectile`, used in primary/helpers) and
// an effect role (`effect`, used in the effect slot) — same colour, scaled by tier.
function buildGems() {
  var gems = {};
  // All three colours cost the SAME — no gem is strictly better than another,
  // they're customization sidegrades (stinger / ball / AOE). value doubles per
  // tier (furnace refund / relative worth). Base picked equal across colours.
  [
    { base: "redGem",    color: "red",    value: 50, tip: "Ruby",     weap: "Stinger"   },
    { base: "blueGem",   color: "blue",   value: 50, tip: "Sapphire", weap: "AOE Blast" },
    { base: "yellowGem", color: "yellow", value: 50, tip: "Topaz",    weap: "Laser"     },
  ].forEach(c => {
    var nameFor = t => t === 1 ? c.base : c.base + t;
    for ( var tier = 1; tier <= GEM_MAX_TIER; tier++ ) {
      var entry = {
        type: "gem",
        color: c.color,
        tier,
        value: c.value * Math.pow(2, tier - 1),
        icon: c.color + "-gem-" + tier,
        toolTipName: tier === 1 ? c.tip : c.tip + " T" + tier,
        description: "Weapon: " + c.weap + ". Effect: " + gemEffect(c.color, tier).label + ".",
        projectile: gemWeapon(c.color, tier),
        effect: gemEffect(c.color, tier),
      };
      if ( tier < GEM_MAX_TIER ) {
        entry.craft = { [nameFor(tier)]: nameFor(tier + 1) };
      }
      gems[nameFor(tier)] = entry;
    }
  });
  // No more white "catalyst" gems: ANY coloured gem doubles as synth fuel (its
  // tier = fuel/sec) AND as an equippable weapon/effect. Drop a gem into a synth
  // slot to fuel it (the gem stays, persistent) or into an equip slot to use it.
  return gems;
}

export default class Item {
  static borderColors = {
    weapon: "orange",
    gem: "white",
    fuel: "#cbd5e1",
    boost: "#f0c060",
  }

  // GEMS DRIVE WEAPONS. There are no separate weapon items: the gem in the
  // primary (or a helper) slot IS the weapon — its colour picks the type
  // (red=stinger, blue=AOE, yellow=laser) and its tier scales damage + fire
  // rate (see gemWeapon). The gem in the EFFECT slot augments it (gemEffect).
  // `value` = synth cost (tier 1) AND furnace refund.
  static list = {
    ...buildGems(),
    ...buildHourglasses(),
    // Fallback when the primary slot is empty: a small, weak white shot that
    // only travels a short distance (the original "basic" gun).
    none: {
      type: "weapon", value: 0, icon: "red-gem-1",
      projectile: {
        speed: 0.8,
        damage: 1,
        range: 220,
        imageName: "white-circle",
        scaleDown: true,
      }
    },
  }

  static dummyItems = {};
  static get(engine, name) {
    return this.dummyItems[name] = this.dummyItems[name] || new Item(engine, name);
  }

  static NONE = new Item(null, "none");

  static ICON_SIZE = 40;

  constructor(engine, name) {
    this.name = name;
    this.stats = Item.list[name];
    this.craft = this.stats.craft ?? {};
    this.toolTipName = this.stats.toolTipName ?? name;
    this.description = this.stats.description ?? "";
    this.tier = this.stats.tier ?? 1;
    this.color = this.stats.color ?? null;
    this.seconds = this.stats.seconds ?? null;   // hourglass: burn duration
    this.fuel = this.stats.fuel ?? null;         // hourglass: fuel/sec while burning

    // Effect-slot config (gems only): {color, damageMult?, homing?/homingTurn?/
    // laserArc?, chain?} — scaled by tier in gemEffect().
    this.effect = this.stats.effect ?? null;

    this.borderColor = this.stats.borderColor = this.stats.borderColor ?? Item.borderColors[this.stats.type];
    
    this.value = this.stats.value;
    
    this.projectile = this.stats.projectile = this.stats.projectile ?? {};
    this.projectile.speed = this.projectile.speed ?? 1;
    this.projectile.damage = this.projectile.damage ?? 1;
    
    this.engine = engine;
  }

  shoot(x, y, dir, opts = {}) {
    // The gem equipped in the effect slot (if any) tints + augments the shot:
    // its `color` recolors the shot, `damageMult` scales damage, `homing` makes
    // projectiles seek / the laser arc, `chain` makes hits jump between enemies.
    // Helper turrets pass {noEffect:true} (they ignore the gem) and a
    // {damageScale} (they fire for a fraction of the main base's damage).
    // Effect gem: an explicit one (helpers pass their OWN effect slot, possibly
    // null), else the main base's effect slot. `noEffect:true` forces none.
    var gem = opts.effectGem !== undefined ? opts.effectGem
            : (opts.noEffect ? null : this.engine.globals.inventory?.equipment?.effect);
    var fx = gem?.effect ?? {};
    // Shot colour comes from the EFFECT gem only — the weapon type is the SHAPE,
    // the effect is the ELEMENT/colour. With NO effect gem every weapon fires
    // white ("uncharged"): a bare laser is a white beam, a bare ball is white,
    // etc. Equip a yellow/red/blue effect to tint it (and the turret aperture).
    var color = fx.color ?? "white";
    var damage = this.engine.globals.stats.power.val * this.projectile.damage * (fx.damageMult ?? 1) * (opts.damageScale ?? 1);

    if ( this.projectile.alternate ) {
      this.alt = !this.alt;
      // Lateral offset of the two stinger barrels. The firer passes its turret's
      // scaled spread (TURRET.side) so shots leave the DRAWN side barrels; full
      // size = 13 (the player), half that for a helper.
      var dist = opts.spread ?? 13;
      var mod = dir + (this.alt ? -Math.PI/2 : Math.PI/2);
      x += Math.cos(mod) * dist;
      y += Math.sin(mod) * dist;
    }

    var small = this.projectile.small;

    // Weapon tier (the primary gem's tier) scales the LOOK of the shot — purely
    // visual, the hitbox/damage are unchanged. tierF = 0 at T1 … 1 at T10.
    //   • ball   — dim + small at T1, grows bigger + brighter with tier
    //   • stinger— body a touch bigger, and its TRAIL swells the most
    //   • laser  — beam gets thicker + brighter (a wide glow aura at high tier)
    var tierF = (Math.min(this.tier, GEM_MAX_TIER) - 1) / (GEM_MAX_TIER - 1);
    var vis;
    if ( this.projectile.laser ) {
      vis = { widthScale: 0.8 + 0.7 * tierF, glowBoost: tierF };
    } else if ( small ) {                                  // stinger: emphasise the trail
      vis = { drawScale: 0.85 + 0.3 * tierF, drawAlpha: 0.8 + 0.2 * tierF, trailScale: 0.7 + 0.9 * tierF };
    } else {                                               // ball: dim+small → bright+big
      vis = { drawScale: 0.72 + 0.5 * tierF, drawAlpha: 0.6 + 0.4 * tierF, trailScale: 0.72 + 0.5 * tierF };
    }

    var opts = {
      ...this.projectile,
      color,
      homing: fx.homing ?? false,
      homingTurn: fx.homingTurn,   // per-tier projectile turn rate (homing effect)
      laserArc: fx.laserArc,       // per-tier laser bend limit (homing effect)
      chain: fx.chain,
      aoe: fx.aoe ?? this.projectile.aoe,                 // explosive effect -> blast on hit
      aoeRadius: fx.aoeRadius ?? this.projectile.aoeRadius,
      image: this.engine.images.get(color + "-part-circle"),
      trail: small ? "small" + color[0].toUpperCase() + color.slice(1) : color,
      ...vis,                                              // per-tier draw scaling
    };

    var Type = this.projectile.class ?? Projectile;
    var proj = new Type(this.engine, x, y, dir, damage, 300, opts);
    this.engine.register(proj, "projectile");
    return !this.projectile.laser || proj.hit;
  }

  mergesWith(other) {
    return Object.keys(this.stats.craft ?? {}).indexOf(other.name) !== -1;
  }

  get borderIcon() {
    if ( !this._borderIcon ) {
      var canvas = document.createElement("canvas");
      canvas.width = canvas.height = Item.ICON_SIZE;
      var ctx = canvas.getContext("2d");
      this.icon.draw(ctx, 0, 0, Item.ICON_SIZE, Item.ICON_SIZE);
      ctx.lineWidth = 3;
      ctx.strokeStyle = this.borderColor;
      ctx.strokeRect(0, 0, Item.ICON_SIZE, Item.ICON_SIZE);
      this._borderIcon = new Image(canvas);
    }

    return this._borderIcon;
  }

  get type() {
    return Item.list[this.name].type;
  }

  get merges() {
    return Object.keys(this.craft).map(name => Item.get(this.engine, name));
    // return [this];
  }

  get engine() {
    return this._engine;
  }

  set engine(val) {
    this._engine = val;

    if ( this.engine ) {
      this.icon = this.engine.images.get(this.stats.icon ?? name);
      this.projectile.image = this.projectile.imageName && this.engine.images.get(this.projectile.imageName);
    }
  }
}