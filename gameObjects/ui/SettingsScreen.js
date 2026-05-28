import UIWindow from "../../engine/gfx/ui/window/index.js";
import Button from "../../engine/gfx/ui/window/components/Button.js";
import Banner from "./Banner.js";

class DangerButton extends Button {
  drawComponent() {
    var armed = this.options.armedFn && this.options.armedFn();
    this.text.setText(armed ? "Confirm reset" : "Reset save data");
    if ( this.rect.w === 0 ) {
      this.rect.w = this.text.getWidth(this.ctx) + this.padding * 2 + 30;
      this.rect.x = this.center ? this.canvas.width / 2 - this.rect.w / 2 : 0;
    }
    var ctx = this.ctx;
    var base = armed ? "#5a1010" : "#3a0c0c";
    var top = this.hover ? (armed ? "#a02020" : "#5a1818") : base;
    var bot = armed ? "#220404" : "#1a0606";

    ctx.save();
    var bg = ctx.createLinearGradient(0, this.rect.y, 0, this.rect.y + this.rect.h);
    bg.addColorStop(0, top);
    bg.addColorStop(1, bot);
    ctx.fillStyle = bg;
    ctx.fillRect(this.rect.x, this.rect.y, this.rect.w, this.rect.h);
    ctx.shadowColor = armed ? "#ff6464" : "#a44";
    ctx.shadowBlur = this.hover ? 14 : 6;
    ctx.lineWidth = 2;
    ctx.strokeStyle = armed ? "#ff6464" : "#a44";
    ctx.strokeRect(this.rect.x, this.rect.y, this.rect.w, this.rect.h);
    ctx.restore();
    this.text.draw(ctx);
  }
}

export default class SettingsScreen extends UIWindow {
  constructor(engine, opts = {}) {
    var w = Math.min(480, engine.window.width - 40);
    var h = 360;
    var armed = { state: false };

    super(engine, {
      x: engine.window.width / 2 - w / 2,
      y: engine.window.height / 2 - h / 2,
      w: w, h: h,
    }, [
      { type: "spacer", height: 10 },
      {
        type: Banner,
        text: "Settings",
        fontSize: 36,
        fontColor: "#9aa7c2",
        center: true,
      },
      { type: "spacer", height: 30 },
      {
        type: DangerButton,
        text: { button: "Reset save data" },
        fontColor: "#ffd6d6",
        center: true,
        armedFn: () => armed.state,
        callback: () => {
          if ( armed.state ) {
            opts.onReset?.();
          } else {
            armed.state = true;
            setTimeout(() => { armed.state = false; }, 4000);
          }
        },
      },
      { type: "spacer", height: 20 },
      {
        type: "button",
        text: { button: "Close" },
        fontColor: "#cfd6e2",
        borderColor: "#3a4a6a",
        center: true,
        callback: () => engine.trigger("closeSettings"),
      },
    ], {
      bgColor: "#0a0f1a",
      borderColor: "#2a3a5a",
      outerPadding: 6,
      z: 200,
    });

    this.hide = true;
  }

  draw(ctx) {
    if ( this.hide ) return;

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, this.engine.window.width, this.engine.window.height);
    ctx.restore();

    super.draw(ctx);
  }

  onMouseClick(event) {
    if ( this.hide ) return;
    super.onMouseClick(event);
  }

  onMouseMove(event) {
    if ( this.hide ) return;
    super.onMouseMove(event);
  }

  onMouseUp(event) {
    if ( this.hide ) return;
    super.onMouseUp(event);
  }
}
