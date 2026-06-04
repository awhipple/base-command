import GameObject from "../engine/objects/GameObject.js"
import { getDirectionFrom, slideDirectionTowards, BoundingRect } from "../engine/GameMath.js";
import DamageText from "./effects/DamageText.js";
import Laser from "./effects/Laser.js";
import Particle from "../engine/gfx/shapes/Particle.js";
import { aoeBlast, impactSpark } from "./effects/Particle Effects.js";
import LaserRing from "./effects/LaserRing.js";

export default class Projectile extends GameObject {
  z = 1;

  // Laser tuning. LASER_MAX_ARC is how far (radians) a homing laser can bend
  // toward a target; aim further off than this and the beam arcs but misses.
  static LASER_RANGE = 1000;
  static LASER_MAX_ARC = Math.PI / 4;
  static FADE_TIME = 0.3;   // seconds a spent homing shot takes to fade out

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

    // Per-tier visual scaling (set by Item.shoot; defaults = no change). Affects
    // only the drawn size/brightness/trail, never the hitbox.
    this.drawScale = options.drawScale ?? 1;
    this.drawAlpha = options.drawAlpha ?? 1;
    this.trailScale = options.trailScale ?? 1;

    this.img = options.image;

    this.options = options;

    this.onCollision(target => {
      if ( target.intangible ) return;   // phased-out enemy (Phaser) → shot passes through
      this.hit = true;
      if ( options.aoe ) {
        this._explode();
      } else {
        this._dealDamage(target, this.damage, { x: this.x, y: this.y });
        this.engine.register(impactSpark(this.x, this.y, this.color, "bullet"));
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
      if ( e.intangible ) return;          // phased-out enemy is immune to the blast
      var d2 = this.pos.squaredDistanceTo(e.pos);
      if ( d2 <= r2 ) {
        var t = Math.sqrt(d2) / radius;   // 0 at centre, 1 at the rim
        var dmg = this.damage * (1 - t * (1 - Projectile.EXPLODE_EDGE_MULT));
        this._dealDamage(e, dmg, { x: e.x, y: e.y });
      }
    });
    // Laser + explosive reads as a fast expanding ring of beam; other weapons
    // get the particle blast.
    if ( this.laser ) {
      this.engine.register(new LaserRing(this.engine, this.x, this.y, radius, this.color));
    } else {
      this.engine.register(aoeBlast(this.x, this.y, radius, this.color));
    }
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

  // Instant hit-scan beam. Straight by default; the homing (blue) variant marches
  // and curves toward enemies — see _fireHomingLaser.
  _fireLaser(x, y, dir) {
    this.hide = true;
    var enemies = this.engine.getObjects("enemy");

    if ( this.homing ) {
      this._fireHomingLaser(x, y, dir, enemies);
      return;
    }

    // Straight beam: hit the first enemy along the ray (closest to the base) at
    // its hitbox edge.
    var target = null, point = null;
    enemies.forEach(e => {
      if ( e.intangible ) return;
      var inter = e.lineIntercept(x, y, dir);
      if ( inter && (!point || inter.y > point.y) ) { point = inter; target = e; }
    });
    var end = point ?? { x: x + Math.cos(dir) * Projectile.LASER_RANGE, y: y + Math.sin(dir) * Projectile.LASER_RANGE };

    this.engine.register(new Laser(this.engine, {
      x1: x, y1: y, x2: end.x, y2: end.y,
      color: this.color,
      widthScale: this.options.widthScale,   // tier → thicker beam
      glow: this.options.glowBoost,           // tier → brighter wide aura
    }));

    if ( this.options.aoe ) {
      this.x = end.x; this.y = end.y;
      this.hit = true;
      this._explode();
    } else if ( target ) {
      this.hit = true;
      this._dealDamage(target, this.damage, end);
      this.engine.register(impactSpark(end.x, end.y, this.color, "laser"));
    }
  }

  // Homing (blue) laser: a SINGLE-TARGET beam that marches outward, gently
  // steering toward the nearest enemy AHEAD of it (so it follows your aim), and
  // TERMINATES at the first hitbox it enters — dealing damage to just that one
  // enemy, even if the beam only clipped it by accident.
  _fireHomingLaser(x, y, dir, enemies) {
    var march = this._marchHomingBeam(x, y, dir, enemies);

    this.engine.register(new Laser(this.engine, {
      points: march.points,
      color: this.color,
      widthScale: this.options.widthScale,
      glow: this.options.glowBoost,
    }));

    if ( march.hit ) {
      this.hit = true;
      this._dealDamage(march.hit.enemy, this.damage, march.hit.point);
      this.engine.register(impactSpark(march.hit.point.x, march.hit.point.y, this.color, "laser"));
    }
  }

  // March a homing beam in small steps: steer toward the nearest enemy within a
  // FORWARD cone (homing assists your aim, doesn't yank toward a closer enemy off
  // to the side/behind), and STOP at the first enemy whose hitbox a step enters.
  // Returns { points, hit } — the polyline to draw and the single contact (or null).
  _marchHomingBeam(x, y, dir, enemies) {
    var STEP = 7;                                               // px per step
    var MAX = Math.ceil(Projectile.LASER_RANGE / STEP);
    // The beam steers more GENTLY than a homing projectile of the same tier. A
    // hit-scan beam that curved as hard as a projectile read as an auto-aim
    // laser — it snapped onto enemies right out of the muzzle (worst at the
    // start of the arc). Scaling the per-step turn down keeps homing as an
    // assist, not a lock-on. Projectile homing (see update()) is unchanged.
    var BEAM_TURN_SCALE = 0.45;
    var turn = (this.options.homingTurn ?? 0.02) * (STEP / 5) * BEAM_TURN_SCALE;  // rad/step
    var CONE = Math.PI / 2;                                      // only home toward enemies ahead
    var W = this.engine.window.width, H = this.engine.window.height;

    var heading = dir, px = x, py = y;
    var points = [{ x: px, y: py }];
    var hit = null;

    for ( var i = 0; i < MAX; i++ ) {
      // Steer toward the nearest enemy AHEAD (within the forward cone of the
      // current heading) — an enemy off to the side or behind doesn't pull it.
      var nearest = null, nd = Infinity;
      for ( var a = 0; a < enemies.length; a++ ) {
        var ea = enemies[a];
        if ( ea.intangible ) continue;
        var toE = Math.atan2(ea.y - py, ea.x - px);
        var off = Math.abs(Math.atan2(Math.sin(toE - heading), Math.cos(toE - heading)));
        if ( off > CONE ) continue;
        var ex = ea.x - px, ey = ea.y - py, d2 = ex * ex + ey * ey;
        if ( d2 < nd ) { nd = d2; nearest = ea; }
      }
      if ( nearest ) {
        var desired = Math.atan2(nearest.y - py, nearest.x - px);
        var dd = Math.atan2(Math.sin(desired - heading), Math.cos(desired - heading));
        heading += Math.max(-turn, Math.min(turn, dd));
      }

      var nx = px + Math.cos(heading) * STEP, ny = py + Math.sin(heading) * STEP;

      // Terminate at the first enemy this step enters (any enemy, even one we
      // weren't homing on) — single target, at the hitbox edge.
      var struck = null;
      for ( var b = 0; b < enemies.length; b++ ) {
        var eb = enemies[b];
        if ( eb.intangible ) continue;
        if ( eb.rect.contains(nx, ny) ) { struck = eb; break; }
      }
      if ( struck ) {
        var segDir = Math.atan2(ny - py, nx - px);
        var edge = struck.lineIntercept(px, py, segDir) ?? { x: nx, y: ny };
        points.push({ x: edge.x, y: edge.y });
        hit = { enemy: struck, point: edge };
        break;
      }

      px = nx; py = ny;
      points.push({ x: px, y: py });
      if ( px < -50 || px > W + 50 || py < -50 || py > H + 50 ) break;
    }

    return { points: points, hit: hit };
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

    // Homing shots curve back onto the screen and would otherwise live forever,
    // sniping anything that appears. Cap their travel: after ~2 screen-heights
    // with no hit, fade out and vanish. They keep homing until then; once fading
    // they just drift.
    if ( this.homing ) {
      this.traveled = (this.traveled ?? 0) + Math.hypot(this.xv, this.yv);
      if ( !this.fading && this.traveled > 2 * this.engine.window.height ) {
        this.fading = true;
      }
    }
    if ( this.fading ) {
      this.fadeT = (this.fadeT ?? 0) + 1/60;
      if ( this.fadeT >= Projectile.FADE_TIME ) {
        this.engine.unregister(this);
        return;
      }
    }

    if ( this.homing && !this.fading ) {
      this.recomputeTarget--;
      if ( this.recomputeTarget === 0 || !this.target ) {
        this.recomputeTarget = 10;
        if ( this.target?.dead ) {
          this.target = null;
        }
        var closest = null;
        this.engine.getObjects("enemy").forEach(enemy => {
          if ( enemy.intangible ) return;
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
        var tcfg = Projectile.TRAIL[this.trail];
        var baseR = (tcfg.radius ?? 17) * this.trailScale;   // tier swells the trail
        this.engine.register(new Particle(
          this.engine,
          {
            start: {
              x: this.x, y: this.y,
              r: tcfg.r, g: tcfg.g, b: tcfg.b,
              radius: baseR,
              alpha: 0.6,
            },
            end: {
              radius: baseR * 0.3,
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
    // Spent homing shots fade out over FADE_TIME before vanishing.
    var fade = this.fading ? Math.max(0, 1 - (this.fadeT ?? 0) / Projectile.FADE_TIME) : 1;
    if ( this.img ) {
      // Base draw size: stinger ≈ rect (20px), ball ≈ rect grown by 15/side (50px);
      // tier scales it (and the alpha) around the projectile centre.
      var base = this.scaleDown ? this.rect.w : this.rect.w + 30;
      var size = base * this.drawScale;
      this.img.draw(ctx, new BoundingRect(this.x - size / 2, this.y - size / 2, size, size), { alpha: this.drawAlpha * fade });
    }

    // Ball weapons: a crisp, bright core on top of the soft body so the head
    // reads as a distinct ball (white-hot centre → vivid colour) with a soft
    // trail behind it — instead of blending into the trail as a moving line.
    if ( !this.laser && !this.scaleDown ) {
      var rgb = Projectile.TRAIL[this.color] ?? Projectile.TRAIL.white;
      var coreR = (this.rect.w + 30) * this.drawScale * 0.33;
      var a = this.drawAlpha * fade;
      var grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, coreR);
      grad.addColorStop(0,    "rgba(255,255,255," + (0.95 * a) + ")");
      grad.addColorStop(0.45, "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + "," + (0.95 * a) + ")");
      grad.addColorStop(1,    "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",0)");
      ctx.save();
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(this.x, this.y, coreR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
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
