import Image from "../Image.js";
import GameObject from "../../objects/GameObject.js";

export default class Particle extends GameObject {
  static drawQueue = [];
  static particleColorMap = {};
  static partSheets = [];

  // Named easings for the optional `ease` option (see constructor). `in*` start
  // slow + accelerate (good for "pulled in by gravity"); `out*` start fast +
  // decelerate (good for a burst that settles); `inOut` is a smoothstep.
  static EASING = {
    linear:  t => t,
    inQuad:  t => t * t,
    inCubic: t => t * t * t,
    inQuart: t => t * t * t * t,
    outQuad: t => 1 - (1 - t) * (1 - t),
    outCubic: t => 1 - Math.pow(1 - t, 3),
    inOut:   t => t * t * (3 - 2 * t),
  };
  
  z = 1000;

  constructor(engine, options = {start:{}}) {
    super(engine, {x: 50, y: 50, radius: 50});

    this.part = generateParticle();
    this.ctx = this.part.img.getContext("2d");
    this.ctx.globalCompositeOperation = "source-atop";

    this.time = 0;
    this.lifeSpan = options.lifeSpan ?? 1;

    // Optional easing: remaps the 0→1 life fraction before the start→end interp,
    // so motion can accelerate/decelerate instead of moving at a constant rate.
    // `ease` is a function (t→t) or a key into Particle.EASING. Default = linear
    // (every existing effect passes no `ease`, so they're unaffected).
    this.ease = typeof options.ease === "function"
      ? options.ease
      : (options.ease ? Particle.EASING[options.ease] : null);

    this.optimizeColorTransitions = options.optimizeColorTransitions ?? true;
    if ( this.optimizeColorTransitions ) {
      ['r', 'g', 'b'].forEach(col => {
        this._normalizeColor(options, col);
      });
    }

    this.initial = options.start;
    this._setState(this.initial);

    this.stateDelta = {};
    for(var key in options.start) {
      if ( typeof options.start[key] === "number" && typeof options.end?.[key] === "number" ) {
        this.stateDelta[key] = options.end[key] - options.start[key];
      }
    }

  }

  update(ctx) {
    this.time += 1/60;
    if ( this.engine && this.time > this.lifeSpan ) {
      this.engine.unregister(this);
    }
    this._setState(this._generateDeltaState(this.time / this.lifeSpan));
  }

  draw(ctx) {
    Particle._queueForDraw(this);
  }

  get r() {
    return this._r ?? 0;
  }

  set r(val) {
    this._r = Math.floor(val);
    this._changeColor();
  }
  
  get g() {
    return this._g ?? 0;
  }

  set g(val) {
    this._g = Math.floor(val);
    this._changeColor();
  }

  get b() {
    return this._b ?? 0;
  }

  set b(val) {
    this._b = Math.floor(val);
    this._changeColor();
  }

  _changeColor() {
    this.col = "rgb("+this.r+","+this.g+","+this.b+")";
  }

  _setState(state) {
    for ( var key in state ) {
      this[key] = state[key];
    }
  }

  _generateDeltaState(delta) {
    var d = this.ease ? this.ease(delta < 0 ? 0 : delta > 1 ? 1 : delta) : delta;
    var newDeltaState = {};
    for ( var key in this.stateDelta ) {
      newDeltaState[key] = this.initial[key] + this.stateDelta[key] * d;
    }
    return newDeltaState;
  }

  _normalizeColor(options, color) {
    [options.start, options.end].forEach(state => {
      if ( state?.hasOwnProperty(color) ) {
        state[color] = Math.round(state[color]/16)*16;
      }
    });
  }

  static _queueForDraw(particle) {
    Particle.drawQueue.push(particle);
    if ( Particle.particleColorMap[particle.col] === undefined) {
      Particle.particleColorMap[particle.col] = Particle._getNextSheetParticle();
    }
    particle.drawTarget = Particle.particleColorMap[particle.col];
  }

  static drawQueuedParticles(ctx) {
    Particle.drawQueue.forEach(particle => {
      var draw = particle.drawTarget;
      if ( !Particle.particleColorMap[particle.col].drawn ) {
        if ( draw.sheet >= Particle.partSheets.length ) {
          var can = generateParticleSheet();
          Particle.partSheets.push({can, ctx: can.getContext("2d")});
        }
        var sheetCtx = Particle.partSheets[draw.sheet].ctx;
        sheetCtx.fillStyle = particle.col;
        sheetCtx.fillRect(draw.x, draw.y, 50, 50);
        Particle.particleColorMap[particle.col].drawn = true;
      }
    });
    // console.log("Drawing " + Object.keys(Particle.particleColorMap).length + "/" + Particle.drawQueue.length + " particles on " + Particle.partSheets.length + " sheets.");
    this.drawQueue.forEach(particle => {
      var { x: px, y: py, w: pw, h: ph } = particle.rect;
      ctx.globalAlpha = particle.alpha;
      ctx.drawImage(Particle.partSheets[particle.drawTarget.sheet].can, particle.drawTarget.x, particle.drawTarget.y, 50, 50, px, py, pw, ph);
    });
    this.drawQueue = [];
    this.particleColorMap = {};
    Particle._resetParticleSheet();
  }

  static _getNextSheetParticle() {
    if ( Particle.tSheet === undefined ) {
      Particle.tx = -50;
      Particle.ty = 0;
      Particle.tSheet = 0;
    }

    Particle.tx += 50;
    if ( Particle.tx >= 1000 ) {
      Particle.tx = 0;
      Particle.ty += 50;
      if ( Particle.ty >= 1000 ) {
        Particle.ty = 0;
        Particle.sheet = 0;
      }
    }

    return { sheet: Particle.tSheet, x: Particle.tx, y: Particle.ty, drawn: false };
  }

  static _resetParticleSheet() {
    Particle.tSheet = undefined;
  }
}

function generateParticle(size = 50) {
  if ( generateParticle.particle ) {
    return generateParticle.particle;
  }

  var can = document.createElement("canvas");
  can.width = can.height = size;
  var ctx = can.getContext("2d");
  var iData = ctx.getImageData(0, 0, size, size);
  var data = iData.data;

  var i = 0, center = size / 2;
  for ( var y = 0; y < size; y++ ) {
    for ( var x = 0; x < size; x++ ) {
      var dist = Math.sqrt(Math.pow(x-center, 2) + Math.pow(y-center, 2));
      
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.max((center - dist) / center, 0) * 255;

      i += 4;
    }
  }

  ctx.putImageData(iData, 0, 0);
  return generateParticle.particle = new Image(can);
}

function generateParticleSheet() {
  var part = generateParticle(50);
  var sheet = document.createElement("canvas");
  sheet.width = sheet.height = 1000;
  var ctx = sheet.getContext("2d");
  
  for ( var y = 0; y < 1000; y += 50 ) {
    for ( var x = 0; x < 1000; x += 50 ) {
      part.draw(ctx, x, y);
    }
  }

  ctx.globalCompositeOperation = "source-atop";

  return sheet;
}

export class ParticleSprite extends GameObject {
  z = 1000;
  constructor(engine, shape, options = {}) {
    super(engine, shape);

    this.pw = options.pw ?? 50;
    this.ph = options.ph ?? 50;

    this.qty = options.qty ?? 1;
    this.nextQty = 0;

    this.generator = options.generator ?? (() => ({
      start: {
        x: 25, y: 25,
        radius: 5,
        r: 255, g: 255, b: 255,
        alpha: 1,
      },
      end: {
        x: Math.random()*50, y: Math.random()*50,
        alpha: 0,
      },
      lifespan: 1,
    }));

    this.particles = [];
    
    this.can = document.createElement("canvas");
    this.can.width = this.pw;
    this.can.height = this.ph;
    this.ctx = this.can.getContext("2d");
    this.img = new Image(this.can);
  }

  update() {
    if ( this.img.drawnWithin(1)) {
      this.nextQty += this.qty;
      while ( this.nextQty >= 1 ) {
        this.particles.push(new Particle(null, this.generator()));
        this.nextQty--;
      }

      this.particles.forEach(particle => {
        particle.update();
      });
      this.particles = this.particles.filter(particle => particle.time <= particle.lifeSpan);

      this.ctx.clearRect(0, 0, this.pw, this.ph);
      this.particles.forEach(particle => {
        particle.draw(this.ctx);
      });

      Particle.drawQueuedParticles(this.ctx);
    }
  }

  draw(ctx) {
    this.img.draw(ctx, this.rect);
  }
}