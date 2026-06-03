import GameObject from "../../engine/objects/GameObject.js";

// Explosive effect on a LASER weapon: a fast-expanding ring of "laser" from the
// contact point — purely cosmetic (the AOE damage is applied instantly in
// Projectile._explode, so the visual just needs to read fast). The ring is a
// filled radial gradient that fades from the INSIDE out (transparent centre →
// coloured leading edge) plus a bright edge stroke, the whole thing fading as it
// grows. Drawn additively so it glows like the beam.
const RING_RGB = {
  red:    "255,90,80",
  blue:   "120,180,255",
  yellow: "255,220,90",
  white:  "255,255,255",
};

export default class LaserRing extends GameObject {
  z = 200;

  constructor(engine, x, y, radius, color = "red", opts = {}) {
    super(engine, { x, y, radius: 1 });
    this.cx = x;
    this.cy = y;
    this.maxR = radius;
    this.rgb = RING_RGB[color] ?? RING_RGB.red;
    this.t = 0;
    this.duration = opts.duration ?? 0.3;   // fast, so the damage reads correctly
  }

  update() {
    this.t += (1 / 60) / this.duration;
    if ( this.t >= 1 ) this.engine.unregister(this);
  }

  draw(ctx) {
    var t = Math.min(this.t, 1);
    var r = this.maxR * (1 - Math.pow(1 - t, 2));   // ease-out: shoots out, then settles
    if ( r < 1 ) return;
    var fade = 1 - t;                                // fades as it expands

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // Filled gradient: transparent in the centre, brightening to the rim — the
    // "ghost" that trails the expanding edge and fades inside→outside.
    var g = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, r);
    g.addColorStop(0, "rgba(" + this.rgb + ",0)");
    g.addColorStop(0.6, "rgba(" + this.rgb + "," + (0.12 * fade) + ")");
    g.addColorStop(1, "rgba(" + this.rgb + "," + (0.5 * fade) + ")");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Bright leading edge.
    ctx.globalAlpha = fade;
    ctx.strokeStyle = "rgba(" + this.rgb + ",1)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }
}
