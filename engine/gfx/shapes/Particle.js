import Image from "../Image.js";
import GameObject from "../../objects/GameObject.js";

export default class Particle extends GameObject {
  static drawQueue = []
  static partSheets = [];
  
  z = 1000;

  constructor(engine, options = {start:{}}) {
    super(engine, {x: 50, y: 50, radius: 50});

    this.part = generateParticle();
    this.ctx = this.part.img.getContext("2d");
    this.ctx.globalCompositeOperation = "source-atop";

    this.time = 0;
    this.lifeSpan = options.lifeSpan ?? 1;

    this.initial = options.start;
    this._setState(this.initial);

    this.newRender = options.newRender ?? false;
    
    this.stateDelta = {};
    for(var key in options.start) {
      if ( typeof options.start[key] === "number" && typeof options.end?.[key] === "number" ) {
        this.stateDelta[key] = options.end[key] - options.start[key];
      }
    }
  }

  update(ctx) {
    this.time += 1/60;
    if ( this.time > this.lifeSpan ) {
      this.engine.unregister(this);
    }
    this._setState(this._generateDeltaState(this.time / this.lifeSpan));
  }

  draw(ctx) {
    if ( this.newRender ) {
      Particle._queueForDraw(this);
    } else {
      ctx.save();
      ctx.globalAlpha = this.alpha;
      this.ctx.fillStyle = this.col;
      this.ctx.fillRect(0, 0, 100, 100);
      this.part.draw(ctx, this.rect);
      ctx.restore();
    }
  }

  get r() {
    return this._r;
  }

  set r(val) {
    this._r = Math.floor(val);
    this._changeColor(this.r, this.g, this.b);
  }
  
  get g() {
    return this._g;
  }

  set g(val) {
    this._g = Math.floor(val);
    this._changeColor(this.r, this.g, this.b);
  }

  get b() {
    return this._b;
  }

  set b(val) {
    this._b = Math.floor(val);
    this._changeColor(this.r, this.g, this.b);
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
    var newDeltaState = {};
    for ( var key in this.stateDelta ) {
      newDeltaState[key] = this.initial[key] + this.stateDelta[key] * delta;
    }
    return newDeltaState;
  }

  static _queueForDraw(particle) {
    this.drawQueue.push(particle);
  }

  static drawQueuedParticles(ctx) {
    var x = 0, y = 0, sheet = 0;
    var particleSegments = [];
    this.drawQueue.forEach(particle => {
      if ( sheet >= Particle.partSheets.length ) {
        var can = generateParticleSheet();
        Particle.partSheets.push({can, ctx: can.getContext("2d")});
      }
      var ctx = Particle.partSheets[sheet].ctx;
      ctx.fillStyle = particle.col;
      ctx.fillRect(x, y, 50, 50);
      particleSegments.push({particle, sheet, x, y});
      x += 50;
      if ( x >= 1000 ) {
        x = 0;
        y += 50;
        if ( y >= 1000 ) {
          y = 0;
          sheet++;
        }
      }
    });
    // if ( Math.random() < 1/60 ) console.log("Part Count", this.drawQueue.length, "Sheet Count", Particle.partSheets.length, this.drawQueue[0].col);
    particleSegments.forEach(seg => {
      var { x: px, y: py, w: pw, h: ph } = seg.particle.rect;
      ctx.globalAlpha = seg.particle.alpha;
      ctx.drawImage(Particle.partSheets[seg.sheet].can, seg.x, seg.y, 50, 50, px, py, pw, ph);
    });
    this.drawQueue = [];
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