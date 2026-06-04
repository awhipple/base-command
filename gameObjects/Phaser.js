import Enemy from "./Enemy.js";
import { getDirectionFrom } from "../engine/GameMath.js";

// A green "blink-dodge" grunt. It drifts toward the base like a basic enemy, but
// the instant it takes a hit it PHASES: ghosts out, does a fast barrel-roll spin,
// and slides (mostly) horizontally to a random spot in the opposite half of the
// screen, then re-materialises. While phasing it's INTANGIBLE — every shot
// (bullet / laser / homing / AOE / chain) passes straight through it (see the
// `intangible` guards in Projectile/Enemy/Base). So you land one hit, it relocates,
// and you have to track + hit it again. It still dies normally at 0 hp.
//
// Anti-stall: under heavy fire (final level) a phaser used to get hit the instant
// it spawned and dodge sideways forever, never marching down — harmless. So each
// approach→phase CYCLE now guarantees a minimum NET downward step: the dodge adds
// whatever downward distance the normal approach since the last phase didn't cover.
// Hit instantly (little natural descent) → it phases down more; left to crawl for a
// while first → it already descended, so the dodge stays horizontal.
export default class Phaser extends Enemy {
  static PHASE_FRAMES  = 46;   // dodge length (~0.77s): ghost out → slide+spin → ghost in
  static SPIN_TURNS    = 2;    // barrel rolls during the dodge
  static MARGIN        = 60;   // keep the destination this far off each wall
  static MIN_DESCENT   = 55;   // min net px toward the base per approach→phase cycle
  static BOTTOM_MARGIN = 160;  // never let a single dodge drop it past here (base sits below)
  static PHASE_DMG_FRAC = 0.2; // dodge after taking this fraction of max hp since the last phase

  constructor(engine, x, y, hp, type = "green") {
    super(engine, x, y, hp, type);
    this.phase = "approach";   // "approach" (normal, hittable) | "phase" (dodging, intangible)
    this.intangible = false;
    this.ghostAlpha = 1;
    this.spin = 0;
    this.segmentStartY = y;    // y at the start of this approach segment (spawn / last phase end)
    this.dmgSincePhase = 0;    // damage accumulated since the last phase (or spawn)
  }

  // A landed hit applies normally, then (if it survived) kicks off the dodge once
  // accumulated damage crosses the threshold. One big hit trips it instantly; many
  // small AOE/Stinger ticks add up and eventually trip it too — but a single chip
  // tick no longer flings it around, so a swarm under area fire actually dies.
  damage(dmg, type) {
    if ( this.intangible ) return;        // safety: nothing should target it mid-phase
    super.damage(dmg, type);
    this.dmgSincePhase += dmg;
    if ( this.hp > 0 && this.phase === "approach" &&
         this.dmgSincePhase >= this.maxHp * Phaser.PHASE_DMG_FRAC ) {
      this._startPhase();
    }
  }

  _startPhase() {
    var W = this.engine.window.width;
    var H = this.engine.window.height;
    var m = Phaser.MARGIN;
    this.phase = "phase";
    this.intangible = true;
    this.dmgSincePhase -= this.maxHp * Phaser.PHASE_DMG_FRAC;   // carry any overshoot
    if ( this.dmgSincePhase < 0 ) this.dmgSincePhase = 0;
    this.phaseT = 0;
    this.startX = this.x;
    this.startY = this.y;
    // Slide to a random spot in the OPPOSITE half, so it's always a real move.
    this.targetX = this.x < W / 2
      ? W / 2 + Math.random() * (W / 2 - m)
      : m + Math.random() * (W / 2 - m);
    // Net at least MIN_DESCENT down per approach→phase cycle: subtract what the
    // normal crawl already covered since the last phase, add the rest here. So a
    // phaser sniped on spawn still creeps down; one left to approach a while doesn't.
    var descended = this.y - this.segmentStartY;
    var boost = Math.max(0, Phaser.MIN_DESCENT - descended);
    this.targetY = Math.min(this.y + boost, H - Phaser.BOTTOM_MARGIN);
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
    this.y = this.startY + (this.targetY - this.startY) * ease;
    this.ghostAlpha = 1 - 0.82 * Math.sin(Math.PI * t);  // fade out, then back in
    this.spin = t * Phaser.SPIN_TURNS * Math.PI * 2;

    if ( this.phaseT >= 1 ) {
      this.phase = "approach";
      this.intangible = false;
      this.ghostAlpha = 1;
      this.spin = 0;
      this.x = this.targetX;
      this.y = this.targetY;
      this.segmentStartY = this.y;   // start a fresh approach segment from here
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
