import GameEngine from "./engine/GameEngine.js";
import Base from "./gameObjects/Base.js";
import Spawner from "./gameObjects/Spawner.js";
import GameUI from "./gameObjects/ui/GameUI.js";
import TitleScreen from "./gameObjects/ui/TitleScreen.js";
import stats from "./gameObjects/Stats.js";
import Levels from "./gameObjects/Levels.js";
import { constrain } from "./engine/GameMath.js";
import InventoryMenu from "./gameObjects/ui/InventoryMenu.js";
import Inventory from "./gameObjects/Inventory.js";
import Cursor from "./gameObjects/Cursor.js";
import Reward from "./gameObjects/Reward.js";
import Circle from "./engine/gfx/shapes/Circle.js";
import Item from "./gameObjects/Item.js";
import Text from "./engine/gfx/Text.js";
import ToolTip from "./gameObjects/ui/ToolTip.js";
import Lightning from "./engine/gfx/effects/Lightning.js";
import Image from "./engine/gfx/Image.js";
import { whiteCircle, blueCircle } from "./gameObjects/effects/ParticleSprites.js";

export default class Game {
  constructor(options = {}) {
    this.engine = new GameEngine({
      width: 600,
      height: 800,
      bgColor: "#000",
      ...options
    });

    // Debug
    window.engine = this.engine;
    // this.engine.setProd();
  }

  start() {
    this.engine.images.preload([
      "base", "dragon-green",
      "white-gems", "blue-gems", "yellow-gems", "purple-gems"
    ]);
    this.engine.sounds.preload([
      "shot", "spark", "explosion", "chime", "zap", "fireball",
      "tsuwami_generic-fighting-game-music.mp3"
    ]);
    this.engine.sounds.alias("music", "tsuwami_generic-fighting-game-music");

    ["white", "blue", "yellow"].forEach(color => {
      this.engine.images.save(this.generateCircleImage(20, color), color + "-circle");
      this.engine.images.save(this.generateTriangleImage(15, color), color + "-triangle");
      this.engine.images.save(this.generateRapidIcon(color), color + "-rapid-icon");
    });

    [ 
      [whiteCircle, "white-part-circle"],
      [blueCircle, "blue-part-circle"],
    ].forEach(pSprite => {
      this.engine.register(pSprite[0]);
      this.engine.images.save(pSprite[0].img, pSprite[1]);
    });
    
    [
      ["lightning-icon", "yellow", "orange"],
      ["zap-icon", "blue", "lightBlue"]
    ].forEach(icon => {
      var light = new Lightning(this.engine, {
        x1: 20, y1: 20,
        x2: 80, y2: 80,
        innerCol: icon[1], outerCol: icon[2],
        spawnParticles: false,
      });

      var lightIcon = document.createElement("canvas");
      lightIcon.width = lightIcon.height = 100;
      var lightCtx = lightIcon.getContext("2d");

      light.update();
      light.draw(lightCtx);
      this.engine.images.save(lightIcon, icon[0]);
    });
    
    this.engine.globals.cash = this.engine.prod ? 0 : 50000;
    this.engine.globals.stats = stats;
    this.engine.globals.levels = new Levels(this.engine);

    this.engine.load().then(() => {
      if ( this.engine.prod ) {
        this.engine.on("firstInteraction", () => this.engine.sounds.play("music", {loop: true, volume: 0.6}));
      }

      this.engine.images.save(this.generateColoredImage(this.engine.images.get("dragon-green")), "dragon-flash");

      this.engine.images.get('white-gems').cut(50);
      this.engine.images.save(this.engine.images.get('white-gems')[1], "white-gem");
      
      this.engine.images.get('blue-gems').cut(50);
      this.engine.images.save(this.engine.images.get('blue-gems')[3], "blue-gem");
      
      this.engine.images.get('yellow-gems').cut(50);
      this.engine.images.save(this.engine.images.get('yellow-gems')[4], "yellow-gem");
      
      this.engine.images.get('purple-gems').cut(50);

      this.inventory = this.engine.globals.inventory = new Inventory(engine);
      Item.NONE.engine = this.engine;
      
      this.engine.register(this.engine.globals.base = new Base(engine), "base");
      
      this.engine.register(this.engine.globals.spawner = new Spawner(
        this.engine, 
      ));

      this.menu = new TitleScreen(this.engine);
      this.engine.register(this.menu);

      this.engine.register(this.engine.globals.cursor = new Cursor(this.engine));

      this.inventoryMenu = new InventoryMenu(this.engine, this.inventory);
      if ( this.engine.dev ) {
        this.engine.register(this.inventoryMenu);
        this.engine.onKeyDown(evt => {
          if ( evt.key === "m" ) {
            this.engine.sounds.play("music", { loop: true });
          }
        });
      }

      this.engine.register(this.engine.globals.toolTip = new ToolTip(this.engine));

      this.invSlide = this.engine.prod ? 20 : -20;

      this.engine.register(new GameUI(this.engine));

      this.engine.on("enemyCollide", () => {
        this.menu.hide = false;
        this.inventoryMenu.hide = false;
        this.engine.unregister("enemy");
        this.engine.unregister("projectile");
        this.engine.globals.base.on = false;
        this.engine.globals.spawner.reset();
      });

      this.engine.on("startGame", () => {
        this.menu.hide = true;
        this.inventoryMenu.hide = true;
        this.engine.globals.base.on = true;
        this.engine.globals.spawner.start();
        this.engine.register(this.inventoryMenu);      
      });

      this.engine.on("levelWin", () => {
        this.menu.hide = false;
        this.inventoryMenu.hide = false;
        this.engine.unregister("projectile");

        if ( this.inventory.count("whiteGem") === 2 && this.engine.prod && !this.tutorialStarted) {
          this._startMergeTutorial();
          this.tutorialStarted = true;
        }
      });

      this.engine.on("closeInventory", () => {
        this.invSlide = 20;
        this.invHide = true;
      });

      this.engine.on("openInventory", () => {
        this.invSlide = -20;
      });

      this.engine.on("toggleInventory", () => {
        this.invSlide = -this.invSlide;
        this.invHide = this.invSlide > 0;
      })

      this.engine.on("displayReward", (item) => {
        this.engine.register(new Reward(this.engine, item));
      });

      this.engine.onUpdate(() => {
        this.inventoryMenu.originX = constrain(this.inventoryMenu.originX + this.invSlide, 0, this.engine.window.width);
        if ( this.invHide && this.inventoryMenu.originX === this.engine.window.width ) {
          this.inventoryMenu.hideComponents();
          this.invHide = false;
        }
      });

      if ( this.engine.dev ) {
        // this.engine.globals.stats.power.val = 100;
        // this.engine.globals.stats.speed.val = 5;
        // this.engine.globals.levels.selected = 6;
        // this.engine.globals.levels.list[5].enemies = 0;
        // this.engine.trigger("startGame");
      }
    });
  }

  generateCircleImage(radius, color = "white") {
    var img = document.createElement("canvas");
    img.width = img.height = radius*2;
    var ctx = img.getContext("2d");

    Circle.draw(ctx, radius, radius, radius, {
      color: color,
    });

    return img;
  }

  generateTriangleImage(size, color = "white") {
    var img = document.createElement("canvas");
    img.width = img.height = size;
    var ctx = img.getContext("2d");

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(size, size/2);
    ctx.lineTo(0, size);
    ctx.lineTo(0, 0);
    ctx.closePath();

    ctx.lineWidth = 1;
    ctx.strokeStyle = color;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.fill();

    return img;
  }

  generateRapidIcon(color = "white") {
    var img = document.createElement("canvas");
    img.width = img.height = 100;
    var ctx = img.getContext("2d");

    ctx.beginPath();
    [{x: 30, y: 16}, {x: 70, y: 56}].forEach(pos => {
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(pos.x + 12, pos.y + 24);
      ctx.lineTo(pos.x - 12, pos.y + 24);
      ctx.lineTo(pos.x, pos.y);
      ctx.closePath();
      ctx.lineWidth = 1;
      ctx.strokeStyle = color;
      ctx.stroke();
  
      ctx.fillStyle = color;
      ctx.fill();
    });

    return img;
  }

  generateColoredImage(img, color = "white") {
    var can = document.createElement("canvas");
    can.width = img.width;
    can.height = img.height;
    var ctx = can.getContext("2d");

    img.draw(ctx, 0, 0);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, can.width, can.height);

    return new Image(can);
  }

  _startMergeTutorial() {
    var text;
    this.engine.register(text = new Text("Open inventory ^", 300, 500, {
      fontColor: "red",
      fontSize: 30,
      z: 500,
    }));
    this.engine.on("toggleInventory", () => {
      text.str = "^ Merge gems";
      text.x = 156;
      text.y = 180;
      this.engine.on("itemsMerged", () => {
        text.str = "Equip weapon ->";
        text.x = 0;
        text.y = 580;
        this.engine.on("itemEquipped", () => {
          this.engine.unregister(text);
        })
      });
    });
  }
}