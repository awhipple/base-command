import Enemy, { ENEMY_PALETTE } from "./Enemy.js";
import { getDirectionFrom } from "../engine/GameMath.js";

// A fast, evasive dart enemy. Behaviour is a 3-phase state machine:
//   1. "strafe" — enters from the left or right edge near the top and weaves
//      back and forth, centipede-style: it crosses the screen, drops a row on
//      each wall bounce, and bobs vertically as it goes. After a few passes…
//   2. "spin"   — it stops and spins up in place (a brief, readable windup that
//      telegraphs the attack)…
//   3. "dive"   — it locks the base's position and accelerates straight into it,
//      committed (a dive bomb — it does NOT re-home, so you can dodge/kill it).
// Small, fast, and only loosely aimable — the kind of target the high-tier
// homing gem is meant to handle.
export default class Strafer extends Enemy {
  // --- tunables -------------------------------------------------------------
  static R            = 28;    // visual + hitbox radius (smaller than a grunt)
  static STRAFE_SPEED = 5;     // px/frame across the screen (~300px/s, fast)
  static DESCEND      = 70;    // px dropped per wall bounce
  static DRIFT        = 0.25;  // px/frame of constant downward creep while strafing
  static PASSES       = 3;     // wall bounces before it commits to a dive
  static MARGIN       = 45;    // how close to the wall it turns
  static BOB_RATE     = 0.16;  // vertical wobble speed
  static BOB_AMP      = 13;    // vertical wobble amplitude
  static TURN_FRAMES  = 24;    // length of the smooth U-turn at each wall
  static SPIN_FRAMES  = 34;    // windup length (~0.55s)
  static SPIN_RATE    = 0.55;  // rad/frame during the windup spin
  static DIVE_ACCEL   = 0.6;   // px/frame² ramp on the dive
  static DIVE_MAX     = 14;    // px/frame terminal dive speed (~840px/s)

  // How far the swept U-turn bulges past the turn line — we start the turn this
  // much before the wall so the apex just kisses the margin and stays on-screen.
  static get TURN_BULGE() {
    return Strafer.STRAFE_SPEED * Strafer.TURN_FRAMES / Math.PI;
  }

  constructor(engine, x, y, hp, type = "orange", side = null) {
    var W = engine.window.width;
    side = side ?? (Math.random() < 0.5 ? "left" : "right");
    var entryX = side === "left" ? -30 : W + 30;
    var entryY = 90 + Math.random() * 70;

    super(engine, entryX, entryY, hp, type, 0);
    this.radius = Strafer.R;
    this.x = entryX;
    this.y = entryY;

    this.phase = "strafe";
    this.dirX = side === "left" ? 1 : -1;   // entering from the left ⇒ moving right
    this.baseY = entryY;                    // wobble rides on top of this
    this.passesLeft = Strafer.PASSES;
    this.bobPhase = Math.random() * Math.PI * 2;
    this.angle = this.dirX > 0 ? 0 : Math.PI;
    this.diveSpeed = 0;
  }

  update() {
    var W = this.engine.window.width;
    var H = this.engine.window.height;

    if ( this.phase === "strafe" ) {
      this.x += this.dirX * Strafer.STRAFE_SPEED;
      this.baseY += Strafer.DRIFT;
      this.bobPhase += Strafer.BOB_RATE;
      this.y = this.baseY + Math.sin(this.bobPhase) * Strafer.BOB_AMP;
      this.angle = this.dirX > 0 ? 0 : Math.PI;

      // Begin the swept U-turn a little before the wall so the arc's apex lands
      // on the margin rather than overshooting it.
      var bulge = Strafer.TURN_BULGE;
      var hitRight = this.dirX > 0 && this.x >= W - Strafer.MARGIN - bulge;
      var hitLeft  = this.dirX < 0 && this.x <= Strafer.MARGIN + bulge;
      if ( hitRight || hitLeft ) {
        this.phase = "turn";
        this.turnT = 0;
        this.dirX0 = this.dirX;     // direction we were travelling
        this.turnX0 = this.x;       // arc anchor (horizontal return point)
        this.turnY0 = this.baseY;   // row baseline to descend from
      }

    } else if ( this.phase === "turn" ) {
      // A smooth half-loop: horizontal speed eases from +v through 0 to -v while
      // the row descends on a raised-cosine, so the dart sweeps out, noses down
      // at the apex, and levels onto the next row facing the other way.
      var t = this.turnT;
      var vx = this.dirX0 * Strafer.STRAFE_SPEED * Math.cos(Math.PI * t);
      var vy = Strafer.DESCEND * Math.PI * Math.sin(Math.PI * t) / (2 * Strafer.TURN_FRAMES);
      this.x = this.turnX0 + this.dirX0 * (Strafer.STRAFE_SPEED * Strafer.TURN_FRAMES / Math.PI) * Math.sin(Math.PI * t);
      this.y = this.turnY0 + Strafer.DESCEND * (1 - Math.cos(Math.PI * t)) / 2;
      this.angle = Math.atan2(vy, vx);
      this.turnT += 1 / Strafer.TURN_FRAMES;

      if ( this.turnT >= 1 ) {
        this.dirX = -this.dirX0;
        this.baseY = this.turnY0 + Strafer.DESCEND;
        this.y = this.baseY;
        this.bobPhase = 0;
        this.angle = this.dirX > 0 ? 0 : Math.PI;
        this.passesLeft--;
        if ( this.passesLeft <= 0 ) {
          this.phase = "spin";
          this.spinFrames = Strafer.SPIN_FRAMES;
          this.spinAngle = this.angle;
        } else {
          this.phase = "strafe";
        }
      }

    } else if ( this.phase === "spin" ) {
      this.spinFrames--;
      this.spinAngle += Strafer.SPIN_RATE;
      this.angle = this.spinAngle;
      // tiny hover bob so it doesn't look frozen
      this.y = this.baseY + Math.sin(this.bobPhase += 0.1) * 4;
      if ( this.spinFrames <= 0 ) {
        this.phase = "dive";
        var base = this.engine.globals.base;
        this.diveAngle = base ? getDirectionFrom(this.pos, base.pos) : Math.PI / 2;
        this.angle = this.diveAngle;        // nose (drawn pointing +x) faces the dive
        this.diveSpeed = 4;
        this.engine.sounds.play("shot", { volume: 0.18 });
      }

    } else { // dive
      this.diveSpeed = Math.min(this.diveSpeed + Strafer.DIVE_ACCEL, Strafer.DIVE_MAX);
      this.x += Math.cos(this.diveAngle) * this.diveSpeed;
      this.y += Math.sin(this.diveAngle) * this.diveSpeed;
      this.angle = this.diveAngle;
    }

    if ( this.rect.y + this.rect.h > H - 100 ) {
      this.engine.sounds.play("explosion");
      this.engine.trigger("enemyCollide");
    }
  }

  draw(ctx, opts = {}) {
    var r = Strafer.R;
    var pal = ENEMY_PALETTE[this.type] || ENEMY_PALETTE.orange;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    // soft glow
    var glow = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 1.6);
    glow.addColorStop(0, pal.glow + "aa");
    glow.addColorStop(1, pal.glow + "00");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2);
    ctx.fill();

    // dart body — nose toward +x, swept-back wings
    ctx.beginPath();
    ctx.moveTo(r * 1.35, 0);
    ctx.lineTo(-r * 0.85, -r * 0.9);
    ctx.lineTo(-r * 0.35, 0);
    ctx.lineTo(-r * 0.85, r * 0.9);
    ctx.closePath();
    var body = ctx.createLinearGradient(r * 1.35, 0, -r * 0.85, 0);
    body.addColorStop(0, pal.bright);
    body.addColorStop(0.5, pal.core);
    body.addColorStop(1, pal.edge);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = pal.bright;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    if ( opts.noHp ) return;

    // HP text, upright (matches Enemy)
    ctx.save();
    ctx.font = "bold 30px Lucida Console, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.fillStyle = "#ffffff";
    var hpStr = String(Math.ceil(this.hp));
    ctx.strokeText(hpStr, this.x, this.y - r - 6);
    ctx.fillText(hpStr, this.x, this.y - r - 6);
    ctx.restore();
  }
}
