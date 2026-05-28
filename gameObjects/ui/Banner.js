import Title from "../../engine/gfx/ui/window/components/Title.js";

export default class Banner extends Title {
  drawComponent() {
    var ctx = this.ctx;
    var w = this.canvas.width;
    var h = this.canvas.height;
    var color = this.text.fontColor;

    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = color;
    ctx.fillRect(0, h * 0.35, w, h * 0.3);
    ctx.restore();

    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    this.text.draw(ctx);
    ctx.restore();

    var textW = this.text.getWidth(ctx);
    var cx = this.options.center ? w / 2 : this.text.x + textW / 2;
    var lineY = h - 3;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - textW / 2 - 12, lineY);
    ctx.lineTo(cx + textW / 2 + 12, lineY);
    ctx.stroke();
    ctx.restore();
  }
}
