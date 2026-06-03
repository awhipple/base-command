import GameEngine from "./engine/GameEngine.js";
import Base from "./gameObjects/Base.js";
import Helper from "./gameObjects/Helper.js";
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
import ToolTip from "./gameObjects/ui/ToolTip.js";
import Lightning from "./engine/gfx/effects/Lightning.js";
import Image from "./engine/gfx/Image.js";
import { whiteCircle, blueCircle } from "./gameObjects/effects/ParticleSprites.js";
import SettingsScreen from "./gameObjects/ui/SettingsScreen.js";
import * as SaveStore from "./gameObjects/SaveStore.js";

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
      "white-gems", "red-gems", "blue-gems", "yellow-gems", "purple-gems"
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

    // Hourglass icons (one per tier), frame tinted to read the tier at a glance.
    ["#c98a3a", "#cfd6df", "#f0c060", "#7dd3fc", "#e879f9", "#ff6b6b", "#7ee787"].forEach((col, i) => {
      this.engine.images.save(this.generateHourglassIcon(col), "hourglass-" + (i + 1));
    });

    [
      [whiteCircle, "white-part-circle"],
      [blueCircle, "blue-part-circle"],
    ].forEach(pSprite => {
      this.engine.register(pSprite[0]);
      this.engine.images.save(pSprite[0].img, pSprite[1]);
    });

    // Coloured projectile bodies (shot tint comes from the effect gem) — tint
    // the white one. White stays the default (no effect gem) shot body; blue
    // already has its own nicer sprite (blueCircle) above.
    ["red", "yellow"].forEach(color => {
      this.engine.images.save(
        this.generateColoredImage(this.engine.images.get("white-part-circle"), color),
        color + "-part-circle"
      );
    });

    this.engine.globals.stats = stats;
    this.engine.globals.levels = new Levels(this.engine);

    this.engine.load().then(() => {
      if ( this.engine.prod ) {
        this.engine.on("firstInteraction", () => this.engine.sounds.play("music", {loop: true, volume: 0.6}));
      }

      this.engine.images.save(this.generateColoredImage(this.engine.images.get("dragon-green")), "dragon-flash");

      // One colour-tinted base sprite shared by BOTH helper turrets, so they
      // read as helpers (distinct from the main base) but identical to each
      // other. Used in-game + on the inventory screen.
      this.engine.images.save(this.generateTintedImage(this.engine.images.get("base"), "#35c9d6"), "base-helper");

      // Each gem sheet is 10 tiles (50px) = 10 tiers, ascending in complexity.
      // Save every tile as "<color>-gem-<tier>" (tier 1..10) for the tier system.
      ["white", "red", "blue", "yellow"].forEach(color => {
        var sheet = this.engine.images.get(color + "-gems");
        sheet.cut(50);
        for ( var t = 0; t < sheet.length; t++ ) {
          this.engine.images.save(sheet[t], color + "-gem-" + (t + 1));
        }
      });

      this.inventory = this.engine.globals.inventory = new Inventory(engine);
      Item.NONE.engine = this.engine;

      this._restoreSave();
      this._installAutosave();

      this.engine.register(this.engine.globals.base = new Base(engine), "base");

      // Two side helper turrets flanking the base (left + right equip slots).
      var w = this.engine.window.width, h = this.engine.window.height;
      this.engine.register(new Helper(this.engine, "left", 70, h - 10), "helper");
      this.engine.register(new Helper(this.engine, "right", w - 70, h - 10), "helper");

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

      this.settingsScreen = new SettingsScreen(this.engine, {
        onReset: () => this._resetSave(),
        dev: this.engine.dev,
        onCheat: () => {
          this.inventory.cheat();
          // Close settings and slide the inventory open so you see the new gems.
          this.settingsScreen.hide = true;
          this.menu.hide = false;
          this.inventoryMenu.hide = false;
          this.invHide = false;
          this.engine.trigger("openInventory");
        },
      });
      this.engine.register(this.settingsScreen);

      this.engine.on("openSettings", () => {
        this._priorMenuHide = this.menu.hide;
        this._priorInvHide = this.inventoryMenu.hide;
        this.menu.hide = true;
        this.inventoryMenu.hide = true;
        this.settingsScreen.hide = false;
      });
      this.engine.on("closeSettings", () => {
        this.settingsScreen.hide = true;
        this.menu.hide = this._priorMenuHide ?? false;
        this.inventoryMenu.hide = this._priorInvHide ?? true;
      });

      this.invSlide = this.engine.prod ? 20 : -20;

      this.engine.register(new GameUI(this.engine));

      this.engine.on("enemyCollide", () => this._exitLevel());

      this.engine.on("startGame", () => {
        this.menu.hide = true;
        this.inventoryMenu.hide = true;
        this.engine.globals.base.on = true;
        this.engine.globals.spawner.start();
        this.engine.register(this.inventoryMenu);
      });

      // Escape bails out of an in-progress level back to the menu (quick way to
      // test a gem/weapon then exit).
      this.engine.onKeyDown(evt => {
        if ( evt.key === "Escape" && this.engine.globals.base.on ) this._exitLevel();
      });

      this.engine.on("levelWin", () => {
        this.menu.hide = false;
        this.inventoryMenu.hide = false;
        this.engine.unregister("projectile");
        this.engine.trigger("saveRequested");
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
        if ( this.invSlide < 0 ) {
          this.engine.trigger("openInventory");
        }
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

  // A little hourglass: tinted frame/caps + sand (top + settled bottom + stream).
  generateHourglassIcon(frame = "#f0c060") {
    var c = document.createElement("canvas");
    c.width = c.height = 100;
    var ctx = c.getContext("2d");

    // Sand fills first (so the frame strokes over it).
    ctx.fillStyle = "#ffd86b";
    ctx.beginPath(); ctx.moveTo(34, 22); ctx.lineTo(66, 22); ctx.lineTo(50, 46); ctx.closePath(); ctx.fill(); // top pile
    ctx.beginPath(); ctx.moveTo(36, 78); ctx.lineTo(64, 78); ctx.lineTo(50, 60); ctx.closePath(); ctx.fill(); // bottom pile
    ctx.fillRect(48, 46, 4, 14); // falling stream

    // Glass: two triangles meeting at the neck.
    ctx.strokeStyle = frame;
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(28, 20); ctx.lineTo(72, 20); ctx.lineTo(50, 50); ctx.closePath();
    ctx.moveTo(28, 80); ctx.lineTo(72, 80); ctx.lineTo(50, 50); ctx.closePath();
    ctx.stroke();

    // Top + bottom caps.
    ctx.lineWidth = 7; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(24, 18); ctx.lineTo(76, 18); ctx.moveTo(24, 82); ctx.lineTo(76, 82); ctx.stroke();

    return c;
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

  // Like generateColoredImage but keeps the original art, laying a translucent
  // colour wash over only the opaque pixels (source-atop) — a subtle tint.
  generateTintedImage(img, color, alpha = 0.5) {
    var can = document.createElement("canvas");
    can.width = img.width;
    can.height = img.height;
    var ctx = can.getContext("2d");

    img.draw(ctx, 0, 0);
    ctx.globalCompositeOperation = "source-atop";
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, can.width, can.height);

    return new Image(can);
  }

  // Tear down the current level and return to the menu (death or Escape).
  _exitLevel() {
    this.menu.hide = false;
    this.inventoryMenu.hide = false;
    this.engine.unregister("enemy");
    this.engine.unregister("projectile");
    this.engine.globals.base.on = false;
    this.engine.globals.spawner.reset();
    this.engine.trigger("saveRequested");
  }

  _snapshot() {
    return {
      stats: {
        power: { lvl: stats.power.lvl, val: stats.power.val },
        speed: { lvl: stats.speed.lvl, val: stats.speed.val },
      },
      items: this.inventory.items.map(i => i?.name ?? null),
      equipment: {
        primary: this.inventory.equipment.primary?.name ?? null,
        effect: this.inventory.equipment.effect?.name ?? null,
        left: this.inventory.equipment.left?.name ?? null,
        leftEffect: this.inventory.equipment.leftEffect?.name ?? null,
        right: this.inventory.equipment.right?.name ?? null,
        rightEffect: this.inventory.equipment.rightEffect?.name ?? null,
      },
      // Synthesizer state: loaded fuel gem + sub-fuel bar + burst reservoir.
      machines: this.inventory.machines,
      // One-time starter-hourglass bonus already consumed?
      firstHourglassBonusUsed: this.inventory.firstHourglassBonusUsed,
    };
  }

  _restoreSave() {
    var saved = SaveStore.load();
    if ( !saved ) return;

    if ( saved.stats ) {
      ["power", "speed"].forEach(k => {
        if ( saved.stats[k] ) {
          if ( typeof saved.stats[k].lvl === "number" ) stats[k].lvl = saved.stats[k].lvl;
          if ( typeof saved.stats[k].val === "number" ) stats[k].val = saved.stats[k].val;
        }
      });
    }
    if ( Array.isArray(saved.items) ) {
      this.inventory.items = saved.items.map(name => {
        return (name && Item.list[name]) ? new Item(this.engine, name) : null;
      });
    }
    if ( saved.machines ) {
      for ( var key in this.inventory.machines ) {
        if ( saved.machines[key] ) {
          Object.assign(this.inventory.machines[key], saved.machines[key]);
        }
      }
    }
    if ( typeof saved.firstHourglassBonusUsed === "boolean" ) {
      this.inventory.firstHourglassBonusUsed = saved.firstHourglassBonusUsed;
    }
    if ( saved.equipment ) {
      ["primary", "effect", "left", "leftEffect", "right", "rightEffect"].forEach(slot => {
        var name = saved.equipment[slot];
        if ( name && Item.list[name] ) {
          this.inventory.equipment[slot] = new Item(this.engine, name);
        }
      });
    }
  }

  _installAutosave() {
    if ( this._autosaveInstalled ) return;
    this._autosaveInstalled = true;
    this.engine.on("saveRequested", () => SaveStore.save(this._snapshot()));
    this._beforeUnload = () => SaveStore.save(this._snapshot());
    window.addEventListener("beforeunload", this._beforeUnload);
  }

  _resetSave() {
    SaveStore.clear();
    if ( this._beforeUnload ) {
      window.removeEventListener("beforeunload", this._beforeUnload);
      this._beforeUnload = null;
    }
    window.location.reload();
  }

}