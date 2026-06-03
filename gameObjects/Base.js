import GameObject from "../engine/objects/GameObject.js";
import Sprite from "../engine/gfx/Sprite.js";
import { getDirectionFrom, Coord } from "../engine/GameMath.js";
import Item from "./Item.js";
import Circle from "../engine/gfx/shapes/Circle.js";

export default class Base extends GameObject {
  z = 5;
  firePos = new Coord(0, 0);
  on = false;

  constructor(engine) {
    super(engine, {
      w: 200,
      h: 300,
    });
    this.x = engine.window.width/2;
    this.y = engine.window.height;

    this.fireIn = 1/engine.globals.stats.speed.val;

    this.sprite = new Sprite(this.engine.images.get("base").img, this.x, this.y, 1);
    this.pointTo({x: engine.window.width/2, y: 0});

    this.engine.onMouseMove(event => {
      this.pointTo(event.pos);
    });

    this.equip = engine.globals.inventory.equipment;
  }

  update() {
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
        if ( weapon.shoot(this.firePos.x, this.firePos.y, this.sprite.rad) && isLaser ) {
          this.engine.sounds.play("zap", {volume: 0.25});
        }
      }, 150);
    }
  }

  pointTo(pointPos) {
    this.sprite.rad = getDirectionFrom(this.pos, pointPos);
    this.firePos.x = this.x + Math.cos(this.sprite.rad)*150;
    this.firePos.y = this.y + Math.sin(this.sprite.rad)*150;
  }

  draw(ctx) {
    ctx.save();

    this.sprite.draw(ctx);

    var weapon = this.equip.primary ?? Item.NONE;
    if ( weapon.stats.projectile.laserSight ) {
      ctx.globalAlpha = 0.4;
      var point;
      this.engine.getObjects("enemy").forEach(enemy => {
        var inter = enemy.lineIntercept(this.firePos.x, this.firePos.y, this.sprite.rad);
        if ( inter && (!point || inter.y > point.y )) {
          point = inter;
        }
      });

      point = point || {x: this.firePos.x + Math.cos(this.sprite.rad) * 1000, y: this.firePos.y + Math.sin(this.sprite.rad) * 1000};
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