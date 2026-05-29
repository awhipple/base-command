import Button from "../../engine/gfx/ui/window/components/Button.js";
import { roundedRectPath } from "./canvas.js";

export default class Upgrade extends Button {
  initialize() {
    super.initialize();

    this.rect.x = 8;
    this.rect.y = 7;
    this.rect.w = 56;
    this.rect.h = 56;

    this.nameText = this.options.textObj.name;
    this.nameText.x = 80;
    this.nameText.y = 0;
    this.nameText.fontSize = 20;

    this.lvlText = this.options.textObj.lvl;
    this.lvlText.x = 90 + this.ctx.measureText(this.nameText).width;
    this.lvlText.y = 8;
    this.lvlText.fontSize = 12;

    this.costText = this.options.textObj.cost;
    this.costText.x = 220;
    this.costText.y = 5;
    this.costText.fontSize = 15;

    this.statText = this.options.textObj.stat;
    this.statText.x = 80;
    this.statText.y = 40;
    this.statText.fontSize = 15;
  }

  drawComponent() {
    var ctx = this.ctx;
    var r = this.rect;

    ctx.save();
    var bg = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    if ( this.hover ) {
      bg.addColorStop(0, "#1f6a36");
      bg.addColorStop(1, "#0c3a1d");
    } else {
      bg.addColorStop(0, "#12421f");
      bg.addColorStop(1, "#061c0d");
    }
    roundedRectPath(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.shadowColor = "#7ee787";
    ctx.shadowBlur = this.hover ? 12 : 5;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#7ee787";
    ctx.stroke();

    ctx.shadowBlur = 0;
    var cx = r.x + r.w/2, cy = r.y + r.h/2, sz = 14;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#eaffea";
    ctx.beginPath();
    ctx.moveTo(cx - sz, cy);
    ctx.lineTo(cx + sz, cy);
    ctx.moveTo(cx, cy - sz);
    ctx.lineTo(cx, cy + sz);
    ctx.stroke();
    ctx.restore();

    this.nameText.draw(ctx);
    this.lvlText.draw(ctx);
    this.costText.draw(ctx);
    this.statText.draw(ctx);
  }
}
