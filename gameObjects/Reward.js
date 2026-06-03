import GameObject from "../engine/objects/GameObject.js";
import Item from "./Item.js";
import { BoundingRect } from "../engine/GameMath.js";

export default class Reward extends GameObject {
  z = 110;
  time = 1.1;          // total lifetime — snappy; brief pulse then quick slide out
  alpha = 0;
  pulseRate = 0.3;     // pulse-ring cadence
  nextPulse = 0;
  pulses = [];

  constructor(engine, item) {
    super(engine, {x: engine.window.width/2, y: engine.window.height/2, radius: Item.ICON_SIZE/2});
    this.item = item;
  }

  update() {
    this.nextPulse -= 1/60;
    if ( this.nextPulse <= 0 ) {
      this.nextPulse += this.pulseRate;
      this.pulses.push(new BoundingRect(this.rect.x, this.rect.y, this.rect.h, this.rect.w));
      this.pulses[this.pulses.length-1].alpha = 1;
    }
    this.pulses.forEach(pulse => {
      pulse.x--;
      pulse.y--;
      pulse.w += 2;
      pulse.h += 2;
    });
    this.pulses = this.pulses.filter(pulse => pulse.alpha > 0);

    this.time -= 1/60;

    if ( this.time < 0.6 ) {   // brief pulse in place, then slide out quickly
      this.xv = this.xv ?? 0;
      this.xv += 0.32;
      this.x += this.xv;
    }

    // Remove only once it's slid FULLY off the right edge (toward the inventory
    // tab) — never pop while still on-screen. x keeps accelerating, so this fires.
    if ( this.originX > this.engine.window.width ) {
      this.engine.unregister(this);
    }
  }

  draw(ctx) {
    this.rect.draw(ctx, this.item.borderColor, "black");
    this.item.icon.draw(ctx, this.rect);

    this.pulses.forEach(pulse => {
      pulse.alpha = Math.max((100-pulse.w) / 100, 0);
      pulse.draw(ctx, "yellow", undefined, pulse.alpha);
    });
  }
}