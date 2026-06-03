import GameObject from "../engine/objects/GameObject.js";
import Sprite from "../engine/gfx/Sprite.js";
import { getDirectionFrom, slideDirectionTowards, Coord } from "../engine/GameMath.js";

// A small side turret. Takes a weapon gem AND its own effect gem, auto-aims at
// the nearest enemy, and fires at half the main base's fire rate for half damage
// — so each helper is ~25% of your output, both together ~50%. Equipped via the
// `left`+`leftEffect` / `right`+`rightEffect` equipment slots (slot = the weapon
// key; `slot+"Effect"` = its effect); both use the shared tinted `base-helper`.
export default class Helper extends GameObject {
  static FIRE_MULT = 0.5;   // half fire rate
  static DAMAGE_MULT = 0.5; // half damage
  // Projectile travel speed (px/s) — mirrors the hardcoded speed in Item.shoot;
  // used to lead moving targets so helper shots don't trail behind them.
  static PROJ_SPEED = 300;
  // Constant angular step per tick (radians). At 60fps, 0.01 ≈ 0.6 rad/s ≈ one
  // full rotation every ~10s — deliberately slow so you watch them creep around.
  static TURN_RATE = 0.01;

  z = 5;
  firePos = new Coord(0, 0);

  constructor(engine, slot, x, y, scale = 0.38) {
    super(engine, { w: 100, h: 150 });
    this.slot = slot;        // "left" | "right" — which equipment slot it draws from
    this.x = x;
    this.y = y;
    this.scale = scale;

    this.fireIn = 1 / engine.globals.stats.speed.val;
    this.sprite = new Sprite(engine.images.get("base-helper").img, this.x, this.y, scale);
    this.sprite.rad = 3 * Math.PI / 2; // point up until it sees a target

    this.equip = engine.globals.inventory.equipment;
  }

  update() {
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
      this.sprite.rad = slideDirectionTowards(this.sprite.rad, getDirectionFrom(this.pos, aim), Helper.TURN_RATE);
    }
    this.firePos.x = this.x + Math.cos(this.sprite.rad) * 90 * this.scale;
    this.firePos.y = this.y + Math.sin(this.sprite.rad) * 90 * this.scale;

    // No weapon, or nothing to shoot at -> hold fire (don't bank up shots).
    if ( !weapon || !target ) return;

    this.fireIn -= 1 / 60;
    if ( this.fireIn < 0 ) {
      this.fireIn += 1 / (this.engine.globals.stats.speed.val * weapon.projectile.speed * Helper.FIRE_MULT);
      setTimeout(() => {
        weapon.shoot(this.firePos.x, this.firePos.y, this.sprite.rad, {
          // Each helper has its OWN effect slot ("<slot>Effect"); null = no effect.
          effectGem: this.equip[this.slot + "Effect"] ?? null,
          damageScale: Helper.DAMAGE_MULT,
        });
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
    this.sprite.draw(ctx);
  }
}
