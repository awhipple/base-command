import UIWindow from "../../engine/gfx/ui/window/index.js";
import Upgrade from "./Upgrade.js";
import { UIComponent } from "../../engine/gfx/ui/window/UIComponent.js";
import { BoundingRect } from "../../engine/GameMath.js";
import Text from "../../engine/gfx/Text.js";
import Item from "../Item.js";
import Banner from "./Banner.js";
import Button from "../../engine/gfx/ui/window/components/Button.js";

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
    ctx.fillStyle = bg;
    ctx.fillRect(this.rect.x, this.rect.y, this.rect.w, this.rect.h);
    ctx.shadowColor = this.borderColor;
    ctx.shadowBlur = this.hover ? 14 : 6;
    ctx.lineWidth = 2;
    ctx.strokeStyle = this.borderColor;
    ctx.strokeRect(this.rect.x, this.rect.y, this.rect.w, this.rect.h);
    ctx.restore();
    this.text.draw(ctx);
  }
}

function upgradeStat(stat, globals) {
  return () => {
    if ( globals.cash >= stat.cost(stat.lvl) ) {
      stat.val = stat.next(stat.lvl);
      globals.cash -= stat.cost(stat.lvl);
      stat.lvl++;
    }
  }
}

function makeUpgradeUI(name, stat, globals) {
  return {
    type: Upgrade,
    text: {
      button: "+",
      name: name,
      lvl: () => "lvl " + stat.lvl,
      cost: () => "Cost: " + stat.cost(stat.lvl),
      stat: () => stat.val + " -> " + stat.next(stat.lvl),
    },
    callback: upgradeStat(stat, globals),
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
      makeUpgradeUI("Power", stats.power, engine.globals),
      makeUpgradeUI("Speed", stats.speed, engine.globals),
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

    var boxSize = 20;
    this.leftArrowRect = new BoundingRect(this.suggestedWidth/2-boxSize/2-60, 0, boxSize, boxSize);
    this.leftArrow = new Text("<", this.leftArrowRect.x, -9, {fontColor: "white", fontSize: 30});
    this.rightArrowRect = new BoundingRect(this.suggestedWidth/2-boxSize/2+60, 0, boxSize, boxSize);
    this.rightArrow = new Text(">", this.rightArrowRect.x, -9, {fontColor: "white", fontSize: 30});

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

  drawComponent() {
    this.engine.globals.levels.current.icon.draw(this.ctx, this.iconRect);

    this.levelText.draw(this.ctx);
    this.leftArrow.draw(this.ctx);
    this.rightArrow.draw(this.ctx);

    this.enemiesText.draw(this.ctx);
    this.rewardText.draw(this.ctx);

    if ( this.levels.selectedReward ) {
      this.levels.selectedReward.draw(this.ctx, this.rewardRect);
      this.rewardRect.draw(this.ctx, Item.list[this.levels.current.reward].borderColor);
    }
  }
}