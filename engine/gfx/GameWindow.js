import Text from "./Text.js";
import Particle from "./shapes/Particle.js";

export default class GameWindow {
  fpsUpdateNext = (new Date()).getTime() + 1000;
  frames = 0;
  fps = 0;
  // showFps = true;

  constructor(engine, canvasId, gameObjects, options = {}) {
    this.engine = engine;
    this.objects = gameObjects;
    
    this.canvas = document.getElementById(canvasId);
    this.canvas.oncontextmenu = () => false;
    this.canvas.width = options.width || window.innerWidth;
    this.canvas.height = options.height || window.innerHeight;
    if ( options.width && options.height ) {
      if ( options.width / options.height > window.innerWidth / window.innerHeight ) {
        this.ratioStyle = "width: 100%;";
      } else {
        this.ratioStyle = "height: 100%;";
      }
    } else if ( !options.width && !options.height ) {
      this.ratioStyle = "width: 100%; height: 100%;";
    }
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
    if ( options.bgColor ) {
      document.body.style.background = options.bgColor;
    }
    if ( this.engine.mobile ) {
      document.body.style.overscrollBehavior = "none";
      document.body.style.touchAction = "manipulation";
    }
    this.canvas.style = engine.mobile ? 
      "width: 100%; height: 100%;" :
      this.ratioStyle + "padding-left: 0;margin-left: auto;margin-right: auto;display: block;";
      
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    this.ctx = this.canvas.getContext("2d");

    this.bgColor = options.bgColor;

    this.fpsText = new Text("", 15, 0, {fontColor: "#050"});
    engine.onKeyPress(evt => {
      if ( evt.key === "f" ) {
        this.showFps = !this.showFps;
      }
    });

    requestAnimationFrame(() => this.draw());
  }

  draw() {
    this.frames++;
    var time = (new Date()).getTime();
    if ( time > this.fpsUpdateNext ) {
      this.fps = this.frames;
      this.fpsText.setText(this.fps);
      this.frames = 0;
      this.fpsUpdateNext = time + 1000;
    }

    requestAnimationFrame(() => this.draw());

    this.ctx.save();
    if ( this.bgColor ) {
      this.ctx.fillStyle = this.bgColor;
      this.ctx.fillRect(0, 0, this.width, this.height);
    } else {
      this.ctx.clearRect(0, 0, this.width, this.height);
    }
    this.objects.sort((a, b) => (a.z || 0) - (b.z || 0))
    for(var i = 0; i < this.objects.length; i++) {
      if ( !this.objects[i].hide ) {
        this.objects[i].updateScreenRect?.();
        this.objects[i].draw?.(this.ctx, this.engine);
      }
    }
    Particle.drawQueuedParticles(this.ctx);
    this.drawLoop?.(this.ctx);
    if ( this.showFps ) {
      this.fpsText.draw(this.ctx);
    }
    if ( this.debugImage ) {
      this.debugImage.debug(this.ctx);
      this.debugImage = null;
    }
    this.ctx.restore();
  }
}