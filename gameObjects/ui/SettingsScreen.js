import UIWindow from "../../engine/gfx/ui/window/index.js";
import Button from "../../engine/gfx/ui/window/components/Button.js";
import Banner from "./Banner.js";
import { BoundingRect } from "../../engine/GameMath.js";
import { UIComponent } from "../../engine/gfx/ui/window/UIComponent.js";
import Text from "../../engine/gfx/Text.js";

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

// A horizontal volume slider with an icon (music note / speaker). Click or drag
// anywhere on the track to set 0..1 — onChange fires live while dragging, onCommit
// once on release. Value is re-read from getValue() each frame so it always
// reflects the live master volume.
class Slider extends UIComponent {
  constructor(engine, options = {}) {
    super(engine);
    this.options = options;
    this.glyph = options.glyph;                 // "music" | "sfx"
    this.accent = options.accent ?? "#7dd3fc";
    this.height = 50;
  }

  initialize() {
    super.initialize();
    var left = 60, right = 70;                  // room for the icon + the % readout
    this.track = new BoundingRect(left, this.height / 2 - 5, this.suggestedWidth - left - right, 10);
    this.value = this.options.getValue ? this.options.getValue() : 1;
  }

  _setFromX(x) {
    this.value = Math.max(0, Math.min(1, (x - this.track.x) / this.track.w));
    this.options.onChange && this.options.onChange(this.value);
  }

  _onTrack(pos) {
    return pos.y >= 0 && pos.y <= this.height &&
           pos.x >= this.track.x - 14 && pos.x <= this.track.x + this.track.w + 16;
  }

  onMouseClick(event) {
    if ( this._onTrack(event.pos) ) { this.dragging = true; this._setFromX(event.pos.x); }
  }

  onMouseMove(event) {
    if ( this.dragging ) this._setFromX(event.pos.x);
  }

  onMouseUp() {
    if ( this.dragging ) {
      this.dragging = false;
      this.options.onCommit && this.options.onCommit(this.value);
    }
  }

  hide() { this.dragging = false; }

  update() {
    if ( this.dragging ) this.engine.cursor = "pointer";
  }

  drawComponent() {
    var ctx = this.ctx, t = this.track;
    if ( !this.dragging && this.options.getValue ) this.value = this.options.getValue();
    var muted = this.value <= 0.001;

    this._drawGlyph(ctx, 16, this.height / 2, muted);

    ctx.fillStyle = "#1d2740";
    this._round(ctx, t.x, t.y, t.w, t.h, 5); ctx.fill();
    ctx.fillStyle = muted ? "#475068" : this.accent;
    this._round(ctx, t.x, t.y, t.w * this.value, t.h, 5); ctx.fill();

    var hx = t.x + t.w * this.value, hy = t.y + t.h / 2;
    ctx.fillStyle = "#eaf6ff";
    ctx.beginPath(); ctx.arc(hx, hy, 9, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = muted ? "#475068" : this.accent; ctx.stroke();

    Text.draw(ctx, Math.round(this.value * 100) + "%", t.x + t.w + 36, hy - 1,
      { fontSize: 14, fontColor: "#9aa7c2", center: true });
  }

  _round(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if ( w <= 0 ) return;
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Little vector glyph: an eighth note (music) or a speaker + waves / mute-X (sfx).
  _drawGlyph(ctx, cx, cy, muted) {
    var col = muted ? "#5f6b82" : "#cfe0ff";
    ctx.save();
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    if ( this.glyph === "music" ) {
      ctx.beginPath();
      ctx.ellipse(cx - 4, cy + 7, 5, 3.6, -0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 0.8, cy + 6); ctx.lineTo(cx + 0.8, cy - 9); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 0.8, cy - 9);
      ctx.quadraticCurveTo(cx + 9, cy - 7, cx + 6, cy - 1); ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(cx - 9, cy - 3.5);
      ctx.lineTo(cx - 4, cy - 3.5);
      ctx.lineTo(cx + 1, cy - 8);
      ctx.lineTo(cx + 1, cy + 8);
      ctx.lineTo(cx - 4, cy + 3.5);
      ctx.lineTo(cx - 9, cy + 3.5);
      ctx.closePath(); ctx.fill();
      if ( muted ) {
        ctx.beginPath();
        ctx.moveTo(cx + 5, cy - 5); ctx.lineTo(cx + 12, cy + 5);
        ctx.moveTo(cx + 12, cy - 5); ctx.lineTo(cx + 5, cy + 5); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(cx + 3, cy, 5, -0.8, 0.8); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx + 3, cy, 9, -0.7, 0.7); ctx.stroke();
      }
    }
    ctx.restore();
  }
}

export default class SettingsScreen extends UIWindow {
  constructor(engine, opts = {}) {
    var w = Math.min(480, engine.window.width - 40);
    var armed = { state: false };
    var unlocked = { state: false };   // flips the Unlock-all label to "Unlocked"
    var tutSkipped = { state: false }; // flips the Skip-tutorial label to "Tutorial skipped"

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
        { type: "spacer", height: 14 },
        // Audio: Music + Sound-effects volume sliders (drag the handle; 0 = mute).
        {
          type: Slider,
          glyph: "music",
          accent: "#7dd3fc",
          getValue: () => opts.musicVol ? opts.musicVol() : 1,
          onChange: (v) => opts.onMusicVol && opts.onMusicVol(v),
          onCommit: () => opts.onAudioCommit && opts.onAudioCommit(),
        },
        {
          type: Slider,
          glyph: "sfx",
          accent: "#7ee787",
          getValue: () => opts.sfxVol ? opts.sfxVol() : 1,
          onChange: (v) => opts.onSfxVol && opts.onSfxVol(v),
          // Test blip on release so you hear the new SFX level.
          onCommit: () => { opts.onAudioCommit && opts.onAudioCommit(); engine.sounds.play("zap"); },
        },
        { type: "spacer", height: 18 },
        // Skip the onboarding coach for good (dev AND prod). Flips its own label to
        // "Tutorial skipped" once used, like the Unlock-all cheat.
        {
          type: LabelButton,
          text: { button: "Skip tutorial" },
          labelFn: () => tutSkipped.state ? "Tutorial skipped" : "Skip tutorial",
          fontColor: "#dfe6f2",
          borderColor: "#5a6b8a",
          fontSize: 20,
          center: true,
          callback: () => { tutSkipped.state = true; opts.onSkipTutorial?.(); },
        },
        { type: "spacer", height: 14 },
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

      // Replay the victory crawl — unlocked by beating the last level, but
      // always available in dev mode (so the crawl is easy to test).
      if ( showCredits || opts.dev ) {
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
      (opts.dev ? 714 : 510) + ((showCredits || opts.dev) ? 64 : 0);   // +150 for the two audio sliders

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
