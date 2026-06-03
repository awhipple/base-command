import GameObject from "../engine/objects/GameObject.js";
import { getDirectionFrom } from "../engine/GameMath.js";
import Text from "../engine/gfx/Text.js";
import Lightning from "../engine/gfx/effects/Lightning.js";
import DamageText from "./effects/DamageText.js";
import Particle from "../engine/gfx/shapes/Particle.js";
import { deathBurst } from "./effects/Particle Effects.js";

const ENEMY_PALETTE = {
  white:  { glow: "#e8eef5", bright: "#ffffff", core: "#cdd9e6", edge: "#5e6878" },
  red:    { glow: "#ff5050", bright: "#ffc0c0", core: "#e23434", edge: "#5a0d0d" },
  green:  { glow: "#4dff88", bright: "#b6ffd0", core: "#34c46e", edge: "#0d4a2a" },
  blue:   { glow: "#5aaaff", bright: "#b6dcff", core: "#3076c9", edge: "#10314f" },
  purple: { glow: "#b266ff", bright: "#dec0ff", core: "#8a4ad6", edge: "#3a1359" },
  yellow: { glow: "#ffd84d", bright: "#fff0a8", core: "#e6b800", edge: "#5a4400" },
};

export default class Enemy extends GameObject {
  constructor(engine, x, y, hp, type = "white", initialXv = 0) {
    super(engine, {
      x: x,
      y: y,
      radius: 35,
    });
    this.type = type;
    this.initialXv = initialXv;

    if ( engine.globals.base ) {
      this.dir = getDirectionFrom(this.pos, engine.globals.base.pos);
    }

    this.hp = this.maxHp = hp;
  }

  damage(dmg, type) {
    this.hp -= dmg;
    if ( this.hp <= 0 ) {
      if ( this.type === "red" ) {
        this.engine.register(new Enemy(this.engine, this.x, this.y, Math.floor(this.maxHp/2), "white", -10), "enemy");
        this.engine.register(new Enemy(this.engine, this.x, this.y, Math.floor(this.maxHp/2), "white", 10), "enemy");
      }

      if ( this.constructor.name === "Boss" ) {
        this.engine.unregister(this);
        this.engine.register(this);
        this.startExplode();
      } else {
        // Debris burst in the enemy's colour so deaths read as a little explosion.
        var palette = ENEMY_PALETTE[this.type] || ENEMY_PALETTE.white;
        this.engine.register(deathBurst(this.x, this.y, palette.glow));
        this.engine.sounds.play("spark");
        this.engine.unregister(this);
      }

    } 
    if (type?.type === "lightning") {
      this.engine.register(Lightning.rect(this.engine, this.rect, {fade: 0.5, innerCol: type.innerCol, outerCol: type.outerCol}));
      type.hit = type.hit ?? [];
      type.hit.push(this);
      if ( type.chain > 0 ) {
        var closestEnemy, closestDist;
        this.engine.getObjects("enemy").forEach(enemy => {
          var sqDist = this.pos.squaredDistanceTo(enemy.pos);
          if ( type.hit.indexOf(enemy) === -1 && (!closestEnemy || sqDist < closestDist) ) {
            closestDist = sqDist;
            closestEnemy = enemy;
          }
        });
        if ( closestEnemy ) {
          var totalDamage = dmg * (type.weaken ?? 1);
          closestEnemy.damage(totalDamage, {type: "lightning", chain: type.chain - 1, hit: type.hit, innerCol: type.innerCol, outerCol: type.outerCol});
          var enemyDir = getDirectionFrom(this.pos, closestEnemy.pos);
          var point1 = this.lineIntercept(closestEnemy.x, closestEnemy.y, enemyDir + Math.PI);
          var point2 = closestEnemy.lineIntercept(this.x, this.y, enemyDir);
          this.engine.register(new Lightning(this.engine, {
            x1: point1.x, y1: point1.y,
            x2: point2.x, y2: point2.y,
            fade: 0.5,
            innerCol: type.innerCol, outerCol: type.outerCol
          }));
          this.engine.register(new DamageText(this.engine, totalDamage, point2.x, point2.y));
        }
      }
    }
  }

  update() {
    this.x += this.xv + this.initialXv;
    this.y += this.yv;

    this.initialXv *= 0.9;
    var absInitialXv = Math.abs(this.initialXv);
    if ( absInitialXv < 0.05 && absInitialXv > 0 ) {
      this.initialXv = 0;
      this.dir = getDirectionFrom(this.pos, this.engine.globals.base.pos);
    }

    if ( this.rect.y + this.rect.h > this.engine.window.height - 100 ) {
      this.engine.sounds.play("explosion");
      this.engine.trigger("enemyCollide");
    }

    if ( this.type === "fireBall" ) {
      this.nextPart = this.nextPart ?? 1;
      this.nextPart--;
      if ( this.nextPart === 0 ) {
        this.nextPart = 4;
        this.engine.register(new Particle(
          this.engine,
          {
            start: {
              x: this.x, y: this.y,
              r: 255, g: Math.random()*128, b: 0,
              radius: 20,
              alpha: 1,
            },
            end: {
              x: this.x + Math.random()*80-40, y: this.y + Math.random()*80-40,
              radius: 70,
              alpha: 0,
            },
            lifeSpan: 1,
          }
        ));
      }
    }
  }

  unregister() {
    this.dead = true;
  }

  draw(ctx, opts = {}) {
    if ( this.type === "fireBall" ) return;

    var palette = ENEMY_PALETTE[this.type] || ENEMY_PALETTE.white;
    var r = 35;
    var t = performance.now() * 0.0008;

    ctx.save();
    var glow = ctx.createRadialGradient(this.x, this.y, r * 0.5, this.x, this.y, r * 1.45);
    glow.addColorStop(0, palette.glow + "aa");
    glow.addColorStop(1, palette.glow + "00");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r * 1.45, 0, Math.PI * 2);
    ctx.fill();

    var body = ctx.createRadialGradient(this.x - r * 0.35, this.y - r * 0.35, 2, this.x, this.y, r);
    body.addColorStop(0, palette.bright);
    body.addColorStop(0.55, palette.core);
    body.addColorStop(1, palette.edge);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = palette.bright;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for ( var i = 0; i < 3; i++ ) {
      var a = t + i * (Math.PI * 2 / 3);
      ctx.moveTo(this.x + Math.cos(a) * r * 0.25, this.y + Math.sin(a) * r * 0.25);
      ctx.lineTo(this.x + Math.cos(a) * r * 0.75, this.y + Math.sin(a) * r * 0.75);
    }
    ctx.stroke();
    ctx.restore();

    if ( !opts.noHp ) {
      ctx.save();
      ctx.font = "bold 36px Lucida Console, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.lineJoin = "round";
      ctx.lineWidth = 5;
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.fillStyle = "#ffffff";
      var hpStr = String(Math.ceil(this.hp));
      ctx.strokeText(hpStr, this.x, this.y - 22);
      ctx.fillText(hpStr, this.x, this.y - 22);
      ctx.restore();
    }
  }

  get dir() {
    return this._dir;
  }

  set dir(val) {
    this._dir = val;
    this.xv = Math.cos(this.dir);
    this.yv = Math.sin(this.dir);
  }
}