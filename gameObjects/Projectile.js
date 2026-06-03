import GameObject from "../engine/objects/GameObject.js"
import { getDirectionFrom, slideDirectionTowards } from "../engine/GameMath.js";
import DamageText from "./effects/DamageText.js";
import Laser from "./effects/Laser.js";
import Particle from "../engine/gfx/shapes/Particle.js";
import { aoeBlast } from "./effects/Particle Effects.js";

export default class Projectile extends GameObject {
  z = 1;

  // Laser tuning. LASER_MAX_ARC is how far (radians) a homing laser can bend
  // toward a target; aim further off than this and the beam arcs but misses.
  static LASER_RANGE = 1000;
  static LASER_MAX_ARC = Math.PI / 4;

  constructor(engine, x, y, dir, damage = 1, speed = 60, options = {}) {
    super(engine, {
      x: x,
      y: y,
      radius: 10,
    });

    this.damage = damage;
    this.speed = speed;
    this.dir = dir;

    this.scaleDown = options.scaleDown ?? false;

    this.homing = options.homing ?? false;
    this.target = null;
    this.recomputeTarget = 0;

    this.color = options.color ?? "white";
    // When set ({jumps, falloff}) a hit chains to nearby enemies with
    // diminishing damage (the yellow effect gem). Handled by Enemy.damage.
    this.chain = options.chain;

    this.trail = options.trail;

    this.img = options.image;

    this.options = options;

    this.onCollision(target => {
      this.hit = true;
      if ( options.aoe ) {
        this._explode();
      } else {
        this._dealDamage(target, this.damage, { x: this.x, y: this.y });
      }
      this.engine.unregister(this);
    }, "enemy");

    this.laser = options.laser;
    if ( this.laser ) {
      this._fireLaser(x, y, dir);
    }
  }

  // AOE weapon (blue gem): on impact, damage every enemy within aoeRadius and
  // spray a particle blast. Damage falls off with distance from the blast centre
  // (full at the centre, EXPLODE_EDGE_MULT at the rim) so tight clusters take
  // the most. Each hit still chains if a chain effect is equipped.
  static EXPLODE_EDGE_MULT = 0.25;
  _explode() {
    var radius = this.options.aoeRadius ?? 80;
    var r2 = radius * radius;
    this.engine.getObjects("enemy").forEach(e => {
      var d2 = this.pos.squaredDistanceTo(e.pos);
      if ( d2 <= r2 ) {
        var t = Math.sqrt(d2) / radius;   // 0 at centre, 1 at the rim
        var dmg = this.damage * (1 - t * (1 - Projectile.EXPLODE_EDGE_MULT));
        this._dealDamage(e, dmg, { x: e.x, y: e.y });
      }
    });
    this.engine.register(aoeBlast(this.x, this.y, radius, this.color));
    this.engine.sounds.play("explosion", { volume: 0.35 });
  }

  // Apply this shot's damage to an enemy, chaining if the effect gem grants it.
  _dealDamage(target, dmg, point) {
    if ( this.chain ) {
      target.damage(dmg, {
        type: "lightning",
        chain: this.chain.jumps,
        weaken: this.chain.falloff,
        innerCol: "yellow", outerCol: "orange",
      });
    } else {
      target.damage(dmg);
    }
    this.engine.register(new DamageText(this.engine, dmg, point.x, point.y));
  }

  // Instant hit-scan beam. Straight by default; when homing (blue gem) it arcs
  // toward the nearest enemy, but only up to LASER_MAX_ARC — too wide an aim
  // bends toward the target and misses.
  _fireLaser(x, y, dir) {
    this.hide = true;
    var enemies = this.engine.getObjects("enemy");
    var target = null, end = null, control = null;

    if ( this.homing ) {
      var nearest = null, nd = Infinity;
      enemies.forEach(e => {
        var d = this.pos.squaredDistanceTo(e.pos);
        if ( d < nd ) { nd = d; nearest = e; }
      });
      var maxArc = this.options.laserArc ?? Projectile.LASER_MAX_ARC;
      if ( nearest ) {
        var toTarget = getDirectionFrom({ x, y }, nearest.pos);
        var delta = Math.atan2(Math.sin(toTarget - dir), Math.cos(toTarget - dir));
        var reach = Math.min(Math.sqrt(nd), Projectile.LASER_RANGE);
        if ( Math.abs(delta) <= maxArc ) {
          target = nearest;
          end = { x: nearest.x, y: nearest.y };
        } else {
          var bent = dir + Math.sign(delta) * maxArc;
          end = { x: x + Math.cos(bent) * reach, y: y + Math.sin(bent) * reach };
        }
        // Control point along the aim direction => beam leaves straight then
        // curves to the endpoint, reading as an arc through the air.
        var span = Math.hypot(end.x - x, end.y - y);
        control = { x: x + Math.cos(dir) * span * 0.6, y: y + Math.sin(dir) * span * 0.6 };
      }
    } else {
      var point = null;
      enemies.forEach(e => {
        var inter = e.lineIntercept(x, y, dir);
        if ( inter && (!point || inter.y > point.y) ) { point = inter; target = e; }
      });
      if ( point ) {
        end = point;
      } else {
        target = null;
      }
    }

    end = end ?? { x: x + Math.cos(dir) * Projectile.LASER_RANGE, y: y + Math.sin(dir) * Projectile.LASER_RANGE };

    this.engine.register(new Laser(this.engine, {
      x1: x, y1: y, x2: end.x, y2: end.y,
      control,
      color: this.color,
    }));

    if ( this.options.aoe ) {
      // Explosive effect on a laser: blast at the beam's end point.
      this.x = end.x; this.y = end.y;
      this.hit = true;
      this._explode();
    } else if ( target ) {
      this.hit = true;
      this._dealDamage(target, this.damage, end);
    }
  }

  update() {
    if ( this.laser ) {
      this.engine.unregister(this);
      return;
    }

    this.x += this.xv;
    this.y += this.yv;

    if ( this.offScreen(100) ) {
      this.engine.unregister(this);
    }

    // Limited-range shots (e.g. the no-gem basic shot) fizzle after `range` px.
    if ( this.options.range ) {
      this.traveled = (this.traveled ?? 0) + Math.hypot(this.xv, this.yv);
      if ( this.traveled > this.options.range ) {
        this.engine.unregister(this);
        return;
      }
    }

    if ( this.homing ) {
      this.recomputeTarget--;
      if ( this.recomputeTarget === 0 || !this.target ) {
        this.recomputeTarget = 10;
        if ( this.target?.dead ) {
          this.target = null;
        }
        var closest = null;
        this.engine.getObjects("enemy").forEach(enemy => {
          if ( closest === null || this.pos.squaredDistanceTo(enemy.pos) < closest) {
            closest = this.pos.squaredDistanceTo(enemy.pos);
            this.target = enemy;
          }
        });
      }

      if ( this.target ) {
        this.dir = slideDirectionTowards(this.dir, getDirectionFrom({x: this.x, y: this.y}, this.target.pos), this.options.homingTurn ?? 0.02);
        if ( this.sprite ) {
          this.sprite.rad = this.dir;
        }
      }

    }

    if ( this.trail ) {
      this.nextTrail = this.nextTrail ?? 0;
      this.nextTrail -= 1/60;
      if ( this.nextTrail <= 0 ) {
        this.nextTrail += 1/30;
        this.engine.register(new Particle(
          this.engine,
          {
            start: {
              x: this.x, y: this.y,
              radius: 17,
              alpha: 0.6,
              ...Projectile.TRAIL[this.trail],
            },
            end: {
              radius: 5,
              alpha: 0,
            },
            lifeSpan: 0.5,
          }
        ));
      }
    }

  }

  draw(ctx) {
    if ( this.sprite ) {
      this.sprite.x = this.x;
      this.sprite.y = this.y;
    }
    this.img?.draw(ctx, this.rect.grow(this.scaleDown ? 0 : 15));
  }

  get dir() {
    return this._dir;
  }

  set dir(val) {
    this._dir = val;

    if ( !this.speed ) {
      console.log("Projectile created with no speed");
      throw("Projectile created with no speed");
    }
    this.xv = Math.cos(this.dir) * (this.speed / 60);
    this.yv = Math.sin(this.dir) * (this.speed / 60);
  }

  static TRAIL = {
    white: {r: 255, g: 255, b: 255},
    smallWhite: {r: 255, g: 255, b: 255, radius: 8},

    red: {r: 255, g: 60, b: 50},
    smallRed: {r: 255, g: 60, b: 50, radius: 8},

    blue: {r: 0, g: 128, b: 255},
    smallBlue: {r: 0, g: 128, b: 255, radius: 8},

    yellow: {r: 255, g: 230, b: 40},
    smallYellow: {r: 255, g: 230, b: 40, radius: 8},
  };
}
