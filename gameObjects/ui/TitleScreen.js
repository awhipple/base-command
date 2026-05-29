import UIWindow from "../../engine/gfx/ui/window/index.js";
import Upgrade from "./Upgrade.js";
import { UIComponent } from "../../engine/gfx/ui/window/UIComponent.js";
import { BoundingRect } from "../../engine/GameMath.js";
import Item from "../Item.js";
import Banner from "./Banner.js";
import Button from "../../engine/gfx/ui/window/components/Button.js";
import { roundedRectPath } from "./canvas.js";

class PrimaryButton extends Button {
  drawComponent() {
    if ( this.rect.w === 0 ) {
      this.rect.w = this.text.getWidth(this.ctx) + this.padding * 2 + 30;
      this.rect.x = this.center ? this.canvas.width / 2 - this.rect.w / 2 : 0;
    }
    var ctx = this.ctx;
    ctx.save();
    var bg = ctx.createLinearGradient(0, this.rect.y, 0, this.rect.y + this.rect.h);
    if ( this.hover ) {
      bg.addColorStop(0, "#1f6a36");
      bg.addColorStop(1, "#0c3a1d");
    } else {
      bg.addColorStop(0, "#12421f");
      bg.addColorStop(1, "#061c0d");
    }
    roundedRectPath(ctx, this.rect.x, this.rect.y, this.rect.w, this.rect.h, 14);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.shadowColor = this.borderColor;
    ctx.shadowBlur = this.hover ? 14 : 6;
    ctx.lineWidth = 2;
    ctx.strokeStyle = this.borderColor;
    ctx.stroke();
    ctx.restore();
    this.text.draw(ctx);
  }
}

function makeUpgradeUI(engine, name, stat) {
  return {
    type: Upgrade,
    text: {
      button: "+",
      name: name,
      lvl: () => "lvl " + stat.lvl,
      cost: () => "Cost: " + stat.cost(stat.lvl),
      stat: () => stat.val + " -> " + stat.next(stat.lvl),
    },
    callback: () => {
      if ( engine.globals.cash >= stat.cost(stat.lvl) ) {
        stat.val = stat.next(stat.lvl);
        engine.globals.cash -= stat.cost(stat.lvl);
        stat.lvl++;
        engine.trigger("saveRequested");
      }
    },
    left: 130,
    fontColor: "#0f0",
  };
}

export default class TitleScreen extends UIWindow {
  constructor(engine) {
    var stats = engine.globals.stats;
    var levels = engine.globals.levels;
    var rewardText = () => {
      var rewardText = "Reward: ";
      if ( levels.current.reward ) {
        rewardText += "   ";
        if ( levels.current.reward && (levels.current.qty ?? 0) === 0 && (levels.current.chance ?? 100) !== 100) {
          rewardText += "(" + levels.current.chance + "%)";
        }
        rewardText += " + ";
      }
      rewardText += "$" + levels.current.cash;
      return rewardText;
    }
    super(engine, {
      x: 0, y: 0,
      w: engine.window.width, h: engine.window.height,
    }, [
      {
        type: "spacer",
        height: 20,
      },
      {
        type: Banner,
        text: "Base Command",
        fontColor: "#7ee787",
        center: true,
      },
      {
        type: "spacer",
        height: 80,
      },
      {
        type: "title",
        text: () => "$" + engine.globals.cash,
        fontSize: 35,
        fontColor: "#ffd84d",
        center: true,
      },
      {
        type: "spacer",
        height: 20,
      },
      makeUpgradeUI(engine, "Power", stats.power),
      makeUpgradeUI(engine, "Speed", stats.speed),
      {
        type: "spacer",
        height: 60,
      },
      {
        type: LevelSelect,
        levels: levels,
        text: {
          level: () => "Level " + (levels.selected),
          enemies: () => "Enemies: " + (levels.current.enemies),
          reward: rewardText,
        }
      },
      {
        type: "spacer",
        height: 1,
      },
      {
        type: PrimaryButton,
        text: {
          button: "Start",
        },
        fontColor: "#eaffea",
        borderColor: "#7ee787",
        center: true,
        callback: () => {
          engine.trigger("startGame");
        },
      },
    ], {
      bgColor: "#000",
    })

    this.gearRect = new BoundingRect(engine.window.width - 50, 10, 40, 40);
  }

  draw(ctx) {
    super.draw(ctx);
    var gx = this.gearRect.x + this.gearRect.w / 2;
    var gy = this.gearRect.y + this.gearRect.h / 2;
    ctx.save();
    ctx.fillStyle = this.gearHover ? "#cfd6e2" : "#5a6b8a";
    ctx.font = "26px Lucida Console, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⚙", gx, gy + 1);
    ctx.restore();
  }

  onMouseMove(event) {
    this.gearHover = !this.hide && this.gearRect.contains(event.pos);
    if ( this.gearHover ) {
      this.engine.cursor = "pointer";
    }
    super.onMouseMove(event);
  }

  onMouseClick(event) {
    if ( !this.hide && this.gearRect.contains(event.pos) ) {
      this.engine.trigger("openSettings");
      return false;
    }
    super.onMouseClick(event);
  }
}

class LevelSelect extends UIComponent {
  height = 90;

  initialize() {
    super.initialize();

    this.iconRect = new BoundingRect(160, 42, 44, 44);

    this.levelText = this.options.textObj.level;
    this.levelText.x = this.suggestedWidth/2;
    this.levelText.center = true;
    this.levelText.fontColor = "white";
    this.levelText.fontSize = 20;

    // spread is half the gap between the two arrows (they sit at center ±spread).
    // 155 keeps the left arrow's right edge (~148) clear of the level icon at
    // x=160; the right arrow stays symmetric with room to spare (canvas 600 →
    // suggestedWidth 550, center 275).
    var arrowW = 56, arrowH = 56, arrowY = 20, spread = 155;
    this.leftArrowRect = new BoundingRect(
      this.suggestedWidth/2 - spread - arrowW/2, arrowY, arrowW, arrowH,
    );
    this.rightArrowRect = new BoundingRect(
      this.suggestedWidth/2 + spread - arrowW/2, arrowY, arrowW, arrowH,
    );

    this.enemiesText = this.options.textObj.enemies;
    this.enemiesText.x = 220;
    this.enemiesText.y = 40;
    this.enemiesText.fontColor = "white";
    this.enemiesText.fontSize = 15;
    
    this.rewardText = this.options.textObj.reward;
    this.rewardText.x = 220;
    this.rewardText.y = 70;
    this.rewardText.fontColor = "white";
    this.rewardText.fontSize = 15;

    this.levels = this.options.levels;
    this.rewardRect = new BoundingRect(290, 65, 25, 25);
  }

  onMouseMove(event) {
    this.leftHover = this.leftArrowRect.contains(event.pos);
    this.rightHover = this.rightArrowRect.contains(event.pos);
    this.hover = this.leftHover || this.rightHover;
  }

  onMouseClick() {
    if ( this.leftHover ) {
      this.engine.globals.levels.selected--;
    }
    if ( this.rightHover ) {
      this.engine.globals.levels.selected++;
    }
  }

  update() {
    if ( this.hover ) {
      this.engine.cursor = "pointer";
    }
  }

  hide() {
    this.hover = false;
  }

  _drawChevron(rect, dir, hover) {
    var ctx = this.ctx;
    var x = rect.x, y = rect.y, w = rect.w, h = rect.h;

    ctx.save();
    roundedRectPath(ctx, x, y, w, h, 14);

    var grad = ctx.createLinearGradient(0, y, 0, y + h);
    if ( hover ) {
      grad.addColorStop(0, "#1c2a44");
      grad.addColorStop(1, "#0a1226");
    } else {
      grad.addColorStop(0, "#121a2c");
      grad.addColorStop(1, "#070b17");
    }
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = hover ? "#7ee787" : "#3a4a6a";
    if ( hover ) {
      ctx.shadowColor = "#7ee787";
      ctx.shadowBlur = 12;
    }
    ctx.stroke();

    ctx.shadowBlur = 0;
    var cx = x + w/2, cy = y + h/2, size = 12;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = hover ? "#eaffea" : "#cfd6e2";
    ctx.beginPath();
    if ( dir === "left" ) {
      ctx.moveTo(cx + size/2, cy - size);
      ctx.lineTo(cx - size/2, cy);
      ctx.lineTo(cx + size/2, cy + size);
    } else {
      ctx.moveTo(cx - size/2, cy - size);
      ctx.lineTo(cx + size/2, cy);
      ctx.lineTo(cx - size/2, cy + size);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawComponent() {
    this.engine.globals.levels.current.icon.draw(this.ctx, this.iconRect);

    this.levelText.draw(this.ctx);
    this._drawChevron(this.leftArrowRect, "left", this.leftHover);
    this._drawChevron(this.rightArrowRect, "right", this.rightHover);

    this.enemiesText.draw(this.ctx);
    this.rewardText.draw(this.ctx);

    if ( this.levels.selectedReward ) {
      this.levels.selectedReward.draw(this.ctx, this.rewardRect);
      this.rewardRect.draw(this.ctx, Item.list[this.levels.current.reward].borderColor);
    }
  }
}