import GameObject from "../../engine/objects/GameObject.js";
import Particle from "../../engine/gfx/shapes/Particle.js";

// A freshly-synthesized gem flying from its synth slot into its inventory slot.
//
// NOTE: this draws the REAL gem icon (an Image). The engine's Particle system
// only renders colour-tinted alpha DOTS (a soft radial mask filled with one
// rgb colour) — it can't show an arbitrary image — so it's no good for the gem
// itself. We use it only for the little spawn SPARKLE (colour dots are perfect
// for that), and draw the icon ourselves with an eased start→end tween over a
// fixed duration. On landing, `onLand` reveals the gem in its inventory slot.
// Pure screen-space cosmetic (z above the inventory panel).
const SPARK_RGB = {
  red:    { r: 255, g: 90,  b: 80 },
  blue:   { r: 120, g: 180, b: 255 },
  yellow: { r: 255, g: 220, b: 90 },
  white:  { r: 255, g: 255, b: 255 },
};

export default class FlyingGem extends GameObject {
  z = 120;   // above the inventory panel (z = 101)

  constructor(engine, icon, start, end, opts = {}) {
    super(engine, { x: start.x, y: start.y, radius: 1 });
    this.icon = icon;
    this.start = start;
    this.end = end;
    this.t = 0;
    this.duration = opts.duration ?? 0.5;   // seconds, fixed (keys the reveal)
    this.size = opts.size ?? 34;
    this.onLand = opts.onLand;

    // Spawn sparkle (particle engine = colour dots, exactly its strength).
    var c = SPARK_RGB[opts.color] ?? SPARK_RGB.white;
    var sparks = [];
    for ( var i = 0; i < 6; i++ ) {
      var a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 14;
      sparks.push(new Particle(null, {
        start: { x: start.x, y: start.y, radius: 2 + Math.random() * 2, ...c, alpha: 1 },
        end:   { x: start.x + Math.cos(a) * d, y: start.y + Math.sin(a) * d, radius: 0, alpha: 0 },
        lifeSpan: 0.25 + Math.random() * 0.2,
      }));
    }
    engine.register(sparks);
  }

  update() {
    this.t += (1 / 60) / this.duration;
    if ( this.t >= 1 ) {
      this.onLand?.();
      this.engine.unregister(this);
      return;
    }
    // Ease-in-out (quad): picks up speed, then slows into the slot.
    var e = this.t < 0.5
      ? 2 * this.t * this.t
      : 1 - Math.pow(-2 * this.t + 2, 2) / 2;
    this.x = this.start.x + (this.end.x - this.start.x) * e;
    this.y = this.start.y + (this.end.y - this.start.y) * e;
  }

  draw(ctx) {
    // Slight scale pop mid-flight, settling to normal size on arrival.
    var s = this.size * (1 + 0.2 * Math.sin(Math.min(this.t, 1) * Math.PI));
    this.icon.draw(ctx, this.x - s / 2, this.y - s / 2, s, s);
  }
}
