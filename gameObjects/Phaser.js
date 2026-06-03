import Enemy from "./Enemy.js";
import { getDirectionFrom } from "../engine/GameMath.js";

// A green "blink-dodge" grunt. It drifts toward the base like a basic enemy, but
// the instant it takes a hit it PHASES: ghosts out, does a fast barrel-roll spin,
// and slides horizontally (left/right only) to a random spot in the opposite half
// of the screen, then re-materialises. While phasing it's INTANGIBLE — every shot
// (bullet / laser / homing / AOE / chain) passes straight through it (see the
// `intangible` guards in Projectile/Enemy/Base). So you land one hit, it relocates,
// and you have to track + hit it again. It still dies normally at 0 hp.
export default class Phaser extends Enemy {
  static PHASE_FRAMES = 46;   // dodge length (~0.77s): ghost out → slide+spin → ghost in
  static SPIN_TURNS   = 2;    // barrel rolls during the dodge
  static MARGIN       = 60;   // keep the destination this far off each wall

  constructor(engine, x, y, hp, type = "green") {
    super(engine, x, y, hp, type);
    this.phase = "approach";   // "approach" (normal, hittable) | "phase" (dodging, intangible)
    this.intangible = false;
    this.ghostAlpha = 1;
    this.spin = 0;
  }

  // A landed hit applies normally, then (if it survived) kicks off the dodge.
  damage(dmg, type) {
    if ( this.intangible ) return;        // safety: nothing should target it mid-phase
    super.damage(dmg, type);
    if ( this.hp > 0 && this.phase === "approach" ) this._startPhase();
  }

  _startPhase() {
    var W = this.engine.window.width;
    var m = Phaser.MARGIN;
    this.phase = "phase";
    this.intangible = true;
    this.phaseT = 0;
    this.startX = this.x;
    this.phaseY = this.y;                  // hold vertical — the dodge is horizontal only
    // Slide to a random spot in the OPPOSITE half, so it's always a real move.
    this.targetX = this.x < W / 2
      ? W / 2 + Math.random() * (W / 2 - m)
      : m + Math.random() * (W / 2 - m);
    this.spin = 0;
    this.ghostAlpha = 1;
    this.engine.sounds.play("spark", { volume: 0.3 });
  }

  update() {
    if ( this.phase === "phase" ) { this._updatePhase(); return; }
    super.update();   // normal basic-enemy descent toward the base
  }

  _updatePhase() {
    this.phaseT += 1 / Phaser.PHASE_FRAMES;
    var t = Math.min(this.phaseT, 1);
    var ease = t * t * (3 - 2 * t);                       // smoothstep slide
    this.x = this.startX + (this.targetX - this.startX) * ease;
    this.y = this.phaseY;
    this.ghostAlpha = 1 - 0.82 * Math.sin(Math.PI * t);  // fade out, then back in
    this.spin = t * Phaser.SPIN_TURNS * Math.PI * 2;

    if ( this.phaseT >= 1 ) {
      this.phase = "approach";
      this.intangible = false;
      this.ghostAlpha = 1;
      this.spin = 0;
      this.x = this.targetX;
      this.y = this.phaseY;
      if ( this.engine.globals.base ) {
        this.dir = getDirectionFrom(this.pos, this.engine.globals.base.pos);   // resume descent
      }
    }
  }

  draw(ctx) {
    if ( this.phase !== "phase" ) {
      super.draw(ctx);
      return;
    }
    // Ghostly + barrel-rolling: fade by ghostAlpha and flip around the vertical
    // axis (scaleX = cos of the spin) so the orb reads as rolling out of the way.
    ctx.save();
    ctx.globalAlpha = this.ghostAlpha;
    ctx.translate(this.x, this.y);
    ctx.scale(Math.cos(this.spin), 1);
    ctx.translate(-this.x, -this.y);
    super.draw(ctx, { noHp: true });   // no HP readout mid-dodge
    ctx.restore();
  }
}
