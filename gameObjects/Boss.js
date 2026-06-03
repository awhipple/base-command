import Enemy from "./Enemy.js";
import { explosion } from "./effects/Particle Effects.js";

export default class Boss extends Enemy {
  // Health-bar fill colours per dragon type.
  static BAR_COLORS = {
    purple: { bright: "#c98bff", dark: "#5a1f9e" },
    green:  { bright: "#5dffa0", dark: "#157a45" },
  };

  constructor(engine, hp, type) {
    super(engine, engine.window.width/2, -100, hp, "purple");
    this.rect.x = this.rect.x - 30;
    this.rect.y = this.rect.y - 30;
    this.rect.w = this.rect.w + 60;
    this.rect.h = this.rect.h + 60;
    this.img = engine.images.get("dragon-" + type);

    this.yv = 0;
    this.oX = this.oY = 0;

    this.flash = this.engine.images.get("dragon-flash");
    this.flashBoss = 0;

    this._setDest(300, 200);

    this.sizeBoost = 30;

    this.bType = type;
    // HP is whatever the level passes as `bossHp` (no hidden multiplier) — tune
    // it per-boss in Levels.js.
  }

  update() {
    super.update();

    if ( typeof this.delta === "number" ) {
      this.delta = Math.min(this.delta + 1/30, Math.PI/2);

      var cDelta = Math.pow(Math.sin(this.delta),1);

      this.x = this.iX + this.dX * cDelta;
      this.y = this.iY + this.dY * cDelta;

      if ( this.delta === Math.PI/2 ) {
        this.delta = null;
        this.timeBetweenMoves = this.timeBetweenMoves ?? (this.bType === "purple" ? 1 : 3);
        this.timeBetweenMoves = Math.max(this.timeBetweenMoves - 0.15, 0);
        this.nextMove = this.timeBetweenMoves;
        this.fireBalls = 3;
      }
    }

    if ( typeof this.nextMove === "number" ) {
      this.nextMove -= 1/60;
      if ( this.nextMove <= 0 ) {
        this.nextMove = null;
        this._setDest(
          Math.random()*(this.engine.window.width-200)+100,
          Math.random()*300+100,          
        );
      }
    }

    if ( (this.fireBalls ?? 0) > 0 ) {
      this.nextFire = this.nextFire || 0.2;
      this.nextFire -= 1/60;
      if ( this.nextFire <= 0 ) {
        var fireBallXv = 0;
        if ( this.fireBalls > 1 ) {
          fireBallXv = this.fireBalls === 3 ? -10 : 10;
        }
        // Killable in the volleys-of-3 they come in (was 500 — the old inflated
        // level-7 scale); a real threat but you can shoot them down with maxed gear.
        var fbHp = this.bType === "purple" ? 100 : 22;
        this.engine.register(new Enemy(this.engine, this.x, this.y, fbHp, "fireBall", fireBallXv), "enemy");
        this.engine.sounds.play("fireball");
        this.fireBalls--;
        this.nextFire = 0.2;
      }
      if ( this.fireBalls === 0 ) {
        this.nextFire = null;
      }
    }

    this.nextFlash = this.nextFlash ?? 180;
    if ( this.hp === this.maxHp ) {
      this.nextFlash = 180;
    }
    this.nextFlash = Math.max(this.nextFlash - 1, 0);
    if ( this.nextFlash === 0 && this.flashBoss === 0) {
      this.flashBoss = 0.1;
    }

    if ( this.flashBoss > 0 ) {
      this.flashBoss = Math.max(this.flashBoss - 1/60, 0);
      if ( this.flashBoss === 0 ) {
        this.nextFlash = 180 - 175 * (1 - this.hp/this.maxHp);
      }
    } 
  }

  damage(dmg, type) {
    super.damage(dmg, type);

    this.oX = Math.random()*30-15;
    this.oY = Math.random()*30-15;
  }

  startExplode() {
    this.on = false;
    var makeExplosion = (options = {}) => {
      var rad = Math.random()*Math.PI*2;
        var dist = options.center ? 0 : Math.random()*50;
        this.engine.register(explosion(this.x + Math.cos(rad)*dist*1.5, this.y + Math.sin(rad)*dist, options));
        this.engine.sounds.play("fireball", {volume: 1});
        this.oX = Math.random()*30-15;
        this.oY = Math.random()*30-15;
    };
    for ( var t = 815; t <= 3000; t += 160 ) {
      setTimeout(makeExplosion, t);
    }
    for ( var t = 100; t <= 2000; t += 480 ) {
      setTimeout(makeExplosion, t);
    }
    setTimeout(() => {
      makeExplosion({center: true, count: 100, size: 2, smokeLife: 3});
      this.engine.unregister(this);
    }, 3500);
  }

  draw(ctx) {
    var img = this.flashBoss > 0 ? this.flash : this.img;
    
    img.draw(
      ctx,
      this.rect.x - this.sizeBoost + this.oX, this.rect.y - this.sizeBoost + this.oY,
      this.rect.w + this.sizeBoost*2, this.rect.h + this.sizeBoost*2);

    this.oX *= 0.5;
    this.oY *= 0.5;

    this._drawHealthBar(ctx);
  }

  // Boss health meter across the top of the screen (centred so it clears the
  // top-right LVL/ENEMIES readout). Shown for the whole fight; hidden once it's
  // dying (death explosion). Themed to the dragon's colour.
  _drawHealthBar(ctx) {
    if ( this.hp <= 0 ) return;
    var W = this.engine.window.width;
    var w = Math.min(W * 0.62, 520), h = 18, x = (W - w) / 2, y = 16;
    var frac = Math.max(0, Math.min(1, this.hp / this.maxHp));
    var theme = Boss.BAR_COLORS[this.bType] || Boss.BAR_COLORS.purple;

    ctx.save();
    // backing + empty track
    ctx.fillStyle = "rgba(8,10,18,0.85)";
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = "rgba(40,48,66,0.9)";
    ctx.fillRect(x, y, w, h);
    // fill
    var grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, theme.bright);
    grad.addColorStop(1, theme.dark);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w * frac, h);
    // border
    ctx.lineWidth = 2;
    ctx.strokeStyle = theme.bright;
    ctx.strokeRect(x, y, w, h);
    // label
    ctx.font = "bold 13px Lucida Console, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.fillStyle = "#ffffff";
    var name = this.bType.charAt(0).toUpperCase() + this.bType.slice(1) + " Dragon";
    ctx.strokeText(name, W / 2, y + h - 4);
    ctx.fillText(name, W / 2, y + h - 4);
    ctx.restore();
  }

  _setDest(x, y) {
    this.iX = this.x;
    this.iY = this.y;
    this.dX = x - this.x;
    this.dY = y - this.y;
    this.delta = 0;
  }

}