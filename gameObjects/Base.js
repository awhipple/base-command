import GameObject from "../engine/objects/GameObject.js";
import { getDirectionFrom, Coord } from "../engine/GameMath.js";
import Item from "./Item.js";
import Circle from "../engine/gfx/shapes/Circle.js";
import { drawTurret, weaponTypeOf, effectColorOf, TURRET } from "./TurretSprite.js";

export default class Base extends GameObject {
  z = 5;
  firePos = new Coord(0, 0);
  on = false;
  aim = -Math.PI / 2;   // barrel direction (radians); starts pointing up
  flash = 0;            // decaying muzzle-flash intensity for the turret
  flashSide = 1;        // which stinger barrel last fired (±1)
  life = 0;             // tick counter -> idle reactor/lens pulse phase

  constructor(engine) {
    super(engine, {
      w: 200,
      h: 300,
    });
    this.x = engine.window.width/2;
    this.y = engine.window.height;

    this.fireIn = 1/engine.globals.stats.speed.val;

    this.pointTo({x: engine.window.width/2, y: 0});

    this.engine.onMouseMove(event => {
      this.pointTo(event.pos);
    });

    this.equip = engine.globals.inventory.equipment;
  }

  update() {
    this.life++;
    this.flash *= 0.8;   // muzzle flash decays each tick

    // With no gem equipped, fall back to the basic shot (tiny, 1 dmg, short range)
    // so level 1 is beatable from a cold start.
    var weapon = this.equip.primary ?? Item.NONE;
    this.fireIn -= 1/60;
    if ( this.fireIn < 0 ) {
      this.fireIn += 1/(this.engine.globals.stats.speed.val * weapon.projectile.speed);

      var isLaser = weapon.projectile.laser;
      if ( !isLaser ) {
        this.engine.sounds.play("shot", {volume: 0.12});
      }
      setTimeout(() => {
        var hit = weapon.shoot(this.firePos.x, this.firePos.y, this.aim, { spread: TURRET.side(1) });
        // Light the just-fired aperture (stinger alternates sides; weapon.alt
        // holds the side the shot just used -> alt ? -side : +side).
        this.flash = 1;
        this.flashSide = weapon.alt ? -1 : 1;
        // The laser always zaps when fired (not only on a hit); other weapons
        // already played their "shot" above.
        if ( isLaser ) this.engine.sounds.play("zap", {volume: 0.25});
      }, 150);
    }
  }

  pointTo(pointPos) {
    this.aim = getDirectionFrom(this.pos, pointPos);
    this.firePos.x = this.x + Math.cos(this.aim) * TURRET.reach(1);
    this.firePos.y = this.y + Math.sin(this.aim) * TURRET.reach(1);
  }

  draw(ctx) {
    ctx.save();

    drawTurret(ctx, {
      x: this.x, y: this.y, aim: this.aim,
      scale: 1,
      weapon: weaponTypeOf(this.equip.primary),
      effectColor: effectColorOf(this.equip.effect),
      flash: this.flash, flashSide: this.flashSide, phase: this.life / 60,
    });

    var weapon = this.equip.primary ?? Item.NONE;
    if ( weapon.stats.projectile.laserSight ) {
      ctx.globalAlpha = 0.4;
      var point;
      this.engine.getObjects("enemy").forEach(enemy => {
        if ( enemy.intangible ) return;   // sight ignores a phased-out enemy
        var inter = enemy.lineIntercept(this.firePos.x, this.firePos.y, this.aim);
        if ( inter && (!point || inter.y > point.y )) {
          point = inter;
        }
      });

      point = point || {x: this.firePos.x + Math.cos(this.aim) * 1000, y: this.firePos.y + Math.sin(this.aim) * 1000};
      ctx.beginPath();
      ctx.strokeStyle = "yellow";
      ctx.lineWidth = 1;
      ctx.moveTo(this.firePos.x, this.firePos.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();

      Circle.draw(ctx, point.x, point.y, 2, {color: "yellow"});
    }

    ctx.restore();
  }
}
