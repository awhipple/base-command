import UIWindow from "../../engine/gfx/ui/window/index.js";
import Button from "../../engine/gfx/ui/window/components/Button.js";
import Banner from "./Banner.js";
import { BoundingRect } from "../../engine/GameMath.js";

// A button whose label is re-read each draw from options.labelFn — lets the
// "Unlock all" cheat flip its own text to "Unlocked" after it's used.
class LabelButton extends Button {
  drawComponent() {
    if ( this.options.labelFn ) this.text.setText(this.options.labelFn());
    super.drawComponent();
  }
}

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
    var armed = { state: false };
    var unlocked = { state: false };   // flips the Unlock-all label to "Unlocked"

    // The "Credits" replay button only exists once the victory crawl has been
    // unlocked (level 7 beaten — opts.showCredits returns the persisted flag).
    // That flag can flip mid-session, so the component list + window height are
    // built by these factories and re-run by rebuild() each time Settings opens.
    var buildUI = (showCredits) => {
      var components = [
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
          fontSize: 20,
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
      ];

      // Replay the victory crawl (unlocked by beating the last level).
      if ( showCredits ) {
        components.push({ type: "spacer", height: 16 });
        components.push({
          type: "button",
          text: { button: "Credits" },
          fontColor: "#ffe98a",
          borderColor: "#ffd21e",
          fontSize: 20,
          center: true,
          callback: () => opts.onCredits?.(),
        });
      }

      // Dev-only cheat buttons (repeatable): a row of energy cells, or one of
      // every gem colour+tier.
      if ( opts.dev ) {
        components.push({ type: "spacer", height: 16 });
        components.push({
          type: "button",
          text: { button: "Cheat: Energy" },
          fontColor: "#eaffea",
          borderColor: "#7ee787",
          fontSize: 20,
          center: true,
          callback: () => opts.onCheatEnergy?.(),
        });
        components.push({ type: "spacer", height: 10 });
        components.push({
          type: "button",
          text: { button: "Cheat: Gems" },
          fontColor: "#eafaff",
          borderColor: "#7dd3fc",
          fontSize: 20,
          center: true,
          callback: () => opts.onCheatGems?.(),
        });
        // Open every locked slot, drop all keys, and stop keys ever dropping.
        // Stays on the Settings screen (so you can then hit another cheat) and
        // flips its own label to "Unlocked" once used.
        components.push({ type: "spacer", height: 10 });
        components.push({
          type: LabelButton,
          text: { button: "Unlock all" },
          labelFn: () => unlocked.state ? "Unlocked" : "Unlock all",
          fontColor: "#fff0c2",
          borderColor: "#f0c060",
          fontSize: 20,
          center: true,
          callback: () => { unlocked.state = true; opts.onUnlockAll?.(); },
        });
      }

      components.push({ type: "spacer", height: 20 });
      components.push({
        type: "button",
        text: { button: "Close" },
        fontColor: "#cfd6e2",
        borderColor: "#3a4a6a",
        fontSize: 20,
        center: true,
        callback: () => engine.trigger("closeSettings"),
      });

      return components;
    };

    var heightFor = (showCredits) =>
      (opts.dev ? 564 : 360) + (showCredits ? 64 : 0);

    var showCredits0 = !!opts.showCredits?.();

    super(engine, {
      x: engine.window.width / 2 - w / 2,
      y: engine.window.height / 2 - heightFor(showCredits0) / 2,
      w: w, h: heightFor(showCredits0),
    }, buildUI(showCredits0), {
      bgColor: "#0a0f1a",
      borderColor: "#2a3a5a",
      outerPadding: 6,
      z: 200,
    });

    this._buildUI = buildUI;
    this._heightFor = heightFor;
    this._showCredits = opts.showCredits;
    this._w = w;
    this.hide = true;
  }

  // Re-lay-out the window for the current unlock state (the Credits button may
  // have just appeared). Cheap + called only when Settings is opened.
  rebuild() {
    var show = !!this._showCredits?.();
    var h = this._heightFor(show);
    this.rect = new BoundingRect(
      this.engine.window.width / 2 - this._w / 2,
      this.engine.window.height / 2 - h / 2,
      this._w, h
    );
    this.updateScreenRect();
    this.ui = this._buildUI(show);
    this._generateComponents();   // recomputes innerRect, canvas, hit map
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
