import GameObject from "../engine/objects/GameObject.js";
import { getDirectionFrom, slideDirectionTowards, Coord } from "../engine/GameMath.js";
import { drawTurret, weaponTypeOf, effectColorOf, TURRET } from "./TurretSprite.js";

// A small side turret — a half-scale "mini-you". Takes a weapon gem AND its own
// effect gem, auto-aims at the nearest enemy, and fires at half the main base's
// fire rate for half damage — so each helper is ~25% of your output, both
// together ~50%. Equipped via the `left`+`leftEffect` / `right`+`rightEffect`
// slots (slot = the weapon key; `slot+"Effect"` = its effect). Drawn with the
// shared procedural turret (TurretSprite) at TURRET_SCALE with a cyan tint.
export default class Helper extends GameObject {
  static FIRE_MULT = 0.5;   // half fire rate
  static DAMAGE_MULT = 0.5; // half damage
  // Projectile travel speed (px/s) — mirrors the hardcoded speed in Item.shoot;
  // used to lead moving targets so helper shots don't trail behind them.
  static PROJ_SPEED = 300;
  // Constant angular step per tick (radians). At 60fps, 0.01 ≈ 0.6 rad/s ≈ one
  // full rotation every ~10s — deliberately slow so you watch them creep around.
  static TURN_RATE = 0.01;

  // The hand-rolled turret renders helpers as half-scale "mini-yous". All firing
  // geometry (muzzle distance + stinger spread) is derived from this so helper
  // shots leave the drawn barrels exactly.
  static TURRET_SCALE = 0.5;
  static TINT = "#35c9d6";

  z = 5;
  firePos = new Coord(0, 0);
  aim = 3 * Math.PI / 2;   // point up until it sees a target
  flash = 0;
  flashSide = 1;
  charge = 0;           // 0..1 laser pre-fire Tesla-arc charge (ramps over wind-up)
  charging = false;     // true between a laser's fire-timer trip and the shot leaving
  life = 0;

  constructor(engine, slot, x, y) {
    super(engine, { w: 100, h: 150 });
    this.slot = slot;        // "left" | "right" — which equipment slot it draws from
    this.x = x;
    this.y = y;

    this.fireIn = 1 / engine.globals.stats.speed.val;
    this.equip = engine.globals.inventory.equipment;
  }

  update() {
    this.life++;
    this.flash *= 0.8;   // muzzle flash decays each tick
    // Pre-fire arc charge: ramps over the ~100ms wind-up while `charging`, then
    // decays after the shot, so the laser's Tesla crackle builds right before
    // each shot at this helper's fire rate (see TurretSprite.drawLaserGun).
    this.charge = this.charging ? Math.min(1, this.charge + 0.22) : this.charge * 0.55;

    // Only active while the main base is (same level/win gating). With no gem in
    // this helper's slot the turret doesn't exist at all (see draw()).
    var weapon = this.equip[this.slot];
    if ( !weapon || !this.engine.globals.base?.on ) return;

    var target = this._nearestEnemy();
    if ( target ) {
      // Lead the target a little so shots don't trail behind moving enemies:
      // aim where it'll be after the shot's ~travel time (dist / proj speed).
      // Skipped for hitscan lasers, which land instantly and need no lead.
      var aim = target.pos;
      if ( !weapon.projectile.laser ) {
        var leadFrames = this.pos.distanceTo(target.pos) / (Helper.PROJ_SPEED / 60);
        aim = {
          x: target.x + ((target.xv || 0) + (target.initialXv || 0)) * leadFrames,
          y: target.y + (target.yv || 0) * leadFrames,
        };
      }
      // Swing smoothly toward the (led) aim point rather than snapping.
      this.aim = slideDirectionTowards(this.aim, getDirectionFrom(this.pos, aim), Helper.TURN_RATE);
    }
    var reach = TURRET.reach(Helper.TURRET_SCALE);
    this.firePos.x = this.x + Math.cos(this.aim) * reach;
    this.firePos.y = this.y + Math.sin(this.aim) * reach;

    // No weapon, or nothing to shoot at -> hold fire (don't bank up shots).
    if ( !weapon || !target ) return;

    this.fireIn -= 1 / 60;
    if ( this.fireIn < 0 ) {
      this.fireIn += 1 / (this.engine.globals.stats.speed.val * weapon.projectile.speed * Helper.FIRE_MULT);
      if ( weapon.projectile.laser ) this.charging = true;   // begin the laser's pre-fire arc
      setTimeout(() => {
        weapon.shoot(this.firePos.x, this.firePos.y, this.aim, {
          // Each helper has its OWN effect slot ("<slot>Effect"); null = no effect.
          effectGem: this.equip[this.slot + "Effect"] ?? null,
          damageScale: Helper.DAMAGE_MULT,
          // Scaled stinger spread so the two shots leave this mini-turret's drawn
          // side barrels (not the full-size ±13).
          spread: TURRET.side(Helper.TURRET_SCALE),
        });
        this.flash = 1;
        this.flashSide = weapon.alt ? -1 : 1;
        this.charging = false;   // discharge: the arc gives way to the muzzle flash
      }, 100);
    }
  }

  _nearestEnemy() {
    var best = null, bd = Infinity;
    this.engine.getObjects("enemy").forEach(e => {
      var d = this.pos.squaredDistanceTo(e.pos);
      if ( d < bd ) { bd = d; best = e; }
    });
    return best;
  }

  draw(ctx) {
    // No gem equipped -> the helper turret isn't present on the battlefield.
    if ( !this.equip[this.slot] ) return;

    drawTurret(ctx, {
      x: this.x, y: this.y, aim: this.aim,
      scale: Helper.TURRET_SCALE,
      weapon: weaponTypeOf(this.equip[this.slot]),
      effectColor: effectColorOf(this.equip[this.slot + "Effect"]),
      tint: Helper.TINT,
      flash: this.flash, flashSide: this.flashSide, phase: this.life / 60,
      charge: this.charge,
    });
  }
}
