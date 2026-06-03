import GameObject from "../../objects/GameObject.js";
import Particle from "../shapes/Particle.js";
import { Coord, getDirectionFrom } from "../../GameMath.js";

export default class Lightning extends GameObject {
  alpha = 1
  z = 200;

  constructor(engine, options = {}) {
    super(engine, {});
    this.engine = engine;
    this.x1 = options.x1 ?? options.x ?? 0;
    this.y1 = options.y1 ?? options.y ?? 0;
    this.x2 = options.x2 ?? 0;
    this.y2 = options.y2 ?? 0;
    this.circRad = options.radius;

    this.fade = options.fade ?? 0;

    this.dist = (new Coord(this.x1, this.y1)).distanceTo({x: this.x2, y: this.y2});

    this.dir = getDirectionFrom({x: this.x1, y: this.y1}, {x: this.x2, y: this.y2});
    this.xv = Math.cos(this.dir);
    this.yv = Math.sin(this.dir);

    this.perpDir = this.dir + Math.PI/2;
    this.pxv = Math.cos(this.perpDir);
    this.pyv = Math.sin(this.perpDir);

    this.innerCol = options.innerCol ?? "yellow";
    this.outerCol = options.outerCol ?? "orange";

    this.spawnParticles = options.spawnParticles ?? true;

    var segLength = 10;
    this.segments = [];
    if ( this.circRad ) {
      var diam = 2 * this.circRad * Math.PI;
      var numSteps = Math.ceil(diam / segLength);
      var stepLength = (Math.PI * 2) / numSteps;
      for ( var step = 0; step < numSteps; step++ ) {
        var rad = step * stepLength;
        this.segments.push({
          x: this.x1 + Math.cos(rad) * this.circRad,
          y: this.y1 + Math.sin(rad) * this.circRad,
          px: Math.cos(rad), py: Math.sin(rad),
          size: 10,
        });
      }
    } else {
      this.segments.push({x: this.x1, y: this.y1, px: 0, py: 0, size: 0});
      var numSteps = Math.ceil(this.dist / segLength) - 1;
      var stepLength = this.dist / numSteps;
      for ( var step = 1; step < numSteps; step++ ) {
        this.segments.push({
          x: this.x1 + this.xv * step * stepLength,
          y: this.y1 + this.yv * step * stepLength,
          px: this.pxv, py: this.pyv,
          size: 50 * Math.min(step, numSteps - step) / numSteps,
        });
      }
      this.segments.push({x: this.x2, y: this.y2, px: 0, py: 0, size: 0});
    }
  }

  update() {
    if ( this.fade ) {
      this.alpha = Math.max(this.alpha - 1/(60*this.fade), 0);
      if ( this.alpha <= 0 ) {
        this.engine.unregister(this);
      }
    }

    if ( !this.nextUpdate ) {
      this.nextUpdate = 3;

      this.points = [];
      this.segments.forEach(seg => {
        var vary = Math.random() * seg.size * 2 - seg.size;
        this.points.push({
          x: seg.x + seg.px * vary,
          y: seg.y + seg.py * vary,
        });
      });
      if ( this.spawnParticles ) {
        this.spawnParticles = false;
        var sparkCol = {
          yellow: {r: 255, g: 255},
          white:  {r: 255, g: 255, b: 255},
          blue:   {g: 128, b: 255},
        }[this.innerCol] ?? {r: 255, g: 255};
        this.points.forEach(point => {
          if ( Math.random() < 0.5) {
            this.engine.register(new Particle(
              this.engine,
              {
                start: {
                  ...point,
                  ...sparkCol,
                  radius: Math.random()*7+3,
                },
                end: {
                  x: point.x + Math.random()*150-75,
                  y: point.y + Math.random()*150-75,
                  radius: 0,
                },
                lifeSpan: Math.random()*0.5,
              }
            ));
          }
        });
      }
      if ( this.circRad ) {
        // This joins the circle. Pushing the first two keeps it from having a gap.
        this.points.push(this.points[0]);
        this.points.push(this.points[1]);
      }
    }
    this.nextUpdate--;
  }

  draw(ctx) {
    ctx.save();

    ctx.globalAlpha = this.alpha;
    if ( this.points ) {
      [
        {color: this.outerCol, size: 6},
        {color: this.innerCol, size: 2},
      ].forEach(line => {
        ctx.lineWidth = line.size;
        ctx.strokeStyle = line.color;
        ctx.beginPath();
        ctx.moveTo(this.points[0].x, this.points[0].y);
        this.points.slice(1).forEach(point => ctx.lineTo(point.x, point.y));
        ctx.stroke();
      });
    }

    ctx.restore();
  }

  static rect(engine, rect, options) {
    return [
      new Lightning(engine, {
        x1: rect.x, y1: rect.y,
        x2: rect.x + rect.w, y2: rect.y,
        ...options,
      }),
      new Lightning(engine, {
        x1: rect.x + rect.w, y1: rect.y,
        x2: rect.x + rect.w, y2: rect.y + rect.h,
        ...options,
      }),
      new Lightning(engine, {
        x1: rect.x + rect.w, y1: rect.y + rect.h,
        x2: rect.x, y2: rect.y + rect.h,
        ...options,
      }),
      new Lightning(engine, {
        x1: rect.x, y1: rect.y + rect.h,
        x2: rect.x, y2: rect.y,
        ...options,
      }),
    ];
  }
}