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
      color: "sand",
      tier,
      fuel,
      seconds: BURST_SECONDS,
      value: 20 * Math.pow(2, tier - 1),
      icon: "hourglass-" + tier,
      toolTipName: "Hourglass T" + tier,
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
function gemEffect(color, tier) {
  if ( color === "red" ) {
    // Explosive: shots blast on impact (AOE) — works on ball, stinger, or laser.
    // Radius grows with tier. Damage falls off from the centre (see Projectile).
    return { color, aoe: true, aoeRadius: Math.round(120 * (1 + 0.2 * (tier - 1))), label: "Explosive T" + tier };
  }
  if ( color === "blue" ) {
    // Homing scales QUADRATICALLY so it feels weak/loose at low tiers (a gentle
    // nudge — you still have to aim) and only zeroes in tightly at high tiers.
    // homingTurn T1≈0.001 (turn radius ~5000px, barely curves) → T10=0.1 (~50px,
    // tight). Same ceiling as before; the early game is just much weaker. (Future:
    // high tiers are meant for fast, small, evasive enemies that need tight arcs.)
    return {
      color, homing: true,
      homingTurn: 0.001 * tier * tier,                              // projectile turn rate/frame (quadratic)
      laserArc: Math.min(Math.PI * 0.6, Math.PI * 0.008 * tier * tier), // laser bend limit (quadratic, caps ~T9)
      damageMult: 1 + 0.05 * tier,                                  // small dmg, well under white
      label: "Homing T" + tier,
    };
  }
  // yellow: chain. T1 = 1 jump (2 enemies); falloff starts gentler than 50% and
  // improves with tier so deeper chains stay worthwhile.
  return {
    color,
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
    var color = fx.color ?? "white";
    var damage = this.engine.globals.stats.power.val * this.projectile.damage * (fx.damageMult ?? 1) * (opts.damageScale ?? 1);

    if ( this.projectile.alternate ) {
      this.alt = !this.alt;
      var dist = 13;
      var mod = dir + (this.alt ? -Math.PI/2 : Math.PI/2);
      x += Math.cos(mod) * dist;
      y += Math.sin(mod) * dist;
    }

    var small = this.projectile.small;
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