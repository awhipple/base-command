import GameObject from "../../engine/objects/GameObject.js";
import Particle from "../../engine/gfx/shapes/Particle.js";

// Instant laser beam. Appears for a few frames then fades. Straight by default;
// pass a `control` point for a quadratic-bezier arc (the homing/blue laser).
// Colour comes from the equipped effect gem; white when none.
const COLORS = {
  white:  { core: "#ffffff", glow: "#bfefff", rgb: { r: 255, g: 255, b: 255 } },
  blue:   { core: "#dff0ff", glow: "#3aa0ff", rgb: { r: 80,  g: 160, b: 255 } },
  yellow: { core: "#ffffcc", glow: "#ffcc33", rgb: { r: 255, g: 220, b: 60  } },
};

export default class Laser extends GameObject {
  z = 200;
  alpha = 1;

  constructor(engine, options = {}) {
    super(engine, {});
    this.engine = engine;
    this.x1 = options.x1; this.y1 = options.y1;
    this.x2 = options.x2; this.y2 = options.y2;
    this.control = options.control;          // {x,y} => arced beam
    this.col = COLORS[options.color] ?? COLORS.white;
    this.fade = options.fade ?? 0.14;

    this.points = this._samplePath();

    // Sparkle particles along the beam (uses the particle engine).
    for ( var i = 0; i < this.points.length; i += 2 ) {
      var p = this.points[i];
      this.engine.register(new Particle(this.engine, {
        start: { x: p.x, y: p.y, radius: 6, alpha: 0.9, ...this.col.rgb },
        end: { x: p.x + Math.random()*30-15, y: p.y + Math.random()*30-15, radius: 0, alpha: 0 },
        lifeSpan: Math.random()*0.25 + 0.1,
      }));
    }
  }

  _samplePath() {
    var pts = [];
    var steps = 24;
    for ( var i = 0; i <= steps; i++ ) {
      var t = i / steps;
      if ( this.control ) {
        var mt = 1 - t;
        pts.push({
          x: mt*mt*this.x1 + 2*mt*t*this.control.x + t*t*this.x2,
          y: mt*mt*this.y1 + 2*mt*t*this.control.y + t*t*this.y2,
        });
      } else {
        pts.push({ x: this.x1 + (this.x2 - this.x1)*t, y: this.y1 + (this.y2 - this.y1)*t });
      }
    }
    return pts;
  }

  update() {
    this.alpha = Math.max(this.alpha - 1/(60*this.fade), 0);
    if ( this.alpha <= 0 ) {
      this.engine.unregister(this);
    }
  }

  draw(ctx) {
    if ( !this.points ) return;
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    [
      { color: this.col.glow, size: 8 },
      { color: this.col.core, size: 3 },
    ].forEach(line => {
      ctx.strokeStyle = line.color;
      ctx.lineWidth = line.size;
      ctx.beginPath();
      ctx.moveTo(this.points[0].x, this.points[0].y);
      for ( var i = 1; i < this.points.length; i++ ) {
        ctx.lineTo(this.points[i].x, this.points[i].y);
      }
      ctx.stroke();
    });
    ctx.restore();
  }
}
