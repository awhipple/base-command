import GameObject from "../engine/objects/GameObject.js";
import Item from "./Item.js";
import { BoundingRect } from "../engine/GameMath.js";

// Eased overshoot for the pop-in (grows past full size, then settles back).
function easeOutBack(t) {
  var c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export default class Reward extends GameObject {
  z = 110;
  alpha = 0;
  pulseRate = 0.3;     // pulse-ring cadence
  nextPulse = 0;
  pulses = [];
  elapsed = 0;

  // opts (used to make the one-time KEY reward read LOUDER than the repeatable
  // energy cell — same machinery, just bigger/longer/captioned):
  //   caption   — banner text under the icon ("NEW KEY!")
  //   ringColor — pulse-ring colour (default gold; keys use their own colour)
  //   scale     — icon size multiplier (keys land bigger)
  //   time      — total lifetime (keys dwell longer before sliding out)
  //   slideAt   — start sliding once `time` drops below this
  //   popIn     — overshoot scale-up on spawn (keys "punch" in)
  constructor(engine, item, opts = {}) {
    super(engine, {
      x: engine.window.width / 2,
      y: engine.window.height / 2,
      radius: (Item.ICON_SIZE / 2) * (opts.scale ?? 1),
    });
    this.item = item;
    this.caption = opts.caption ?? null;
    this.ringColor = opts.ringColor ?? "yellow";
    this.time = opts.time ?? 1.1;          // total lifetime
    this.slideAt = opts.slideAt ?? 0.6;    // brief pulse in place, then slide out
    this.popIn = opts.popIn ?? false;
  }

  update() {
    this.elapsed += 1 / 60;

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

    if ( this.time < this.slideAt ) {   // brief pulse in place, then slide out quickly
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
    // Pulse rings expand from the (full-size) icon box. For a key these glow in
    // the key's own colour, so the burst itself reads as "this one's different".
    this.pulses.forEach(pulse => {
      pulse.alpha = Math.max((100-pulse.w) / 100, 0);
      pulse.draw(ctx, this.ringColor, undefined, pulse.alpha);
    });

    // Pop-in: scale the icon (and its caption) about the centre for the first
    // ~0.2s, overshooting then settling. Drawn AFTER the rings so the rings read
    // as a shockwave the icon punches out of.
    ctx.save();
    if ( this.popIn ) {
      var pt = Math.min(this.elapsed / 0.2, 1);
      var s = easeOutBack(pt);
      ctx.translate(this.x, this.y);
      ctx.scale(s, s);
      ctx.translate(-this.x, -this.y);
    }

    this.rect.draw(ctx, this.item.borderColor, "black");
    this.item.icon.draw(ctx, this.rect);

    if ( this.caption ) {
      ctx.font = "bold 18px Lucida Console, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      var cy = this.rect.y + this.rect.h + 16;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "black";
      ctx.strokeText(this.caption, this.x, cy);   // dark outline for contrast
      ctx.fillStyle = this.ringColor;
      ctx.fillText(this.caption, this.x, cy);
    }
    ctx.restore();
  }
}
