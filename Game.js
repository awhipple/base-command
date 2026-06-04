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
import Item, { ENERGY_TIER_COLORS, HOURGLASS_MAX_TIER } from "./gameObjects/Item.js";
import ToolTip from "./gameObjects/ui/ToolTip.js";
import Lightning from "./engine/gfx/effects/Lightning.js";
import Image from "./engine/gfx/Image.js";
import { whiteCircle, blueCircle } from "./gameObjects/effects/ParticleSprites.js";
import SettingsScreen from "./gameObjects/ui/SettingsScreen.js";
import CreditsScreen from "./gameObjects/ui/CreditsScreen.js";
import Starfield from "./gameObjects/effects/Starfield.js";
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
      "dragon-green",
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

    // Fuel "energy cell" icons (one per tier). Each tier climbs the rarity/heat
    // ramp + grows + gains lit charge segments, so bigger = visibly stronger.
    for ( var t = 1; t <= HOURGLASS_MAX_TIER; t++ ) {
      this.engine.images.save(this.generateEnergyCellIcon(t, HOURGLASS_MAX_TIER), "hourglass-" + t);
    }

    // Slot-unlock key icons: BLUE opens synth machines, GREEN opens equip slots.
    this.engine.images.save(this.generateKeyIcon("blue"),  "key-blue");
    this.engine.images.save(this.generateKeyIcon("green"), "key-green");

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

      // Drifting starfield behind everything — the level backdrop (z = -1000).
      // The title screen paints over it with its own opaque black, so it only
      // shows once you're in a level (and the credits crawl reuses the look).
      this.engine.register(new Starfield(this.engine));

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

      // Close settings + slide the inventory open so a cheat's spoils are visible.
      var revealInventory = () => {
        this.settingsScreen.hide = true;
        this.menu.hide = false;
        this.inventoryMenu.hide = false;
        this.invHide = false;
        this.engine.trigger("openInventory");
      };
      this.settingsScreen = new SettingsScreen(this.engine, {
        onReset: () => this._resetSave(),
        dev: this.engine.dev,
        onCheatEnergy: () => { this.inventory.cheat();     revealInventory(); },
        onCheatGems:   () => { this.inventory.cheatGems(); revealInventory(); },
        onUnlockAll:   () => {
          this.inventory.unlockAll();                  // open every lock + drop keys
          this.engine.globals.levels.disableKeyRewards();   // stop keys dropping
          // Stay on the Settings screen (unlike the other cheats) so you can then
          // hit Cheat: Energy / Gems; the button flips to "Unlocked" on its own.
        },
        // The "Credits" button is unlocked once the last level has been beaten.
        showCredits: () => !!this.creditsSeen,
        onCredits: () => {
          this.settingsScreen.hide = true;   // dismiss the modal...
          this.creditsScreen.show();          // ...and replay the crawl (onDone reopens the menu)
        },
      });
      this.engine.register(this.settingsScreen);

      // First-clear-only victory crawl (the `creditsSeen` flag is persisted).
      // onDone returns the player to the title screen the way a normal level
      // win does.
      this.creditsScreen = new CreditsScreen(this.engine, {
        onDone: () => {
          this.menu.hide = false;
          this.inventoryMenu.hide = false;
        },
      });
      this.engine.register(this.creditsScreen);

      this.engine.on("openSettings", () => {
        this._priorMenuHide = this.menu.hide;
        this._priorInvHide = this.inventoryMenu.hide;
        this.menu.hide = true;
        this.inventoryMenu.hide = true;
        this.settingsScreen.rebuild();   // pick up a freshly-unlocked Credits button
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
        this.engine.unregister("projectile");

        // Beating the LAST level for the FIRST time rolls the victory crawl
        // instead of dropping straight back to the menu. Every later clear just
        // hands out the tier-7 energy cell (already done by rollForReward), so
        // the menu reveal is the normal path.
        var levels = this.engine.globals.levels;
        var isFinalLevel = levels.selected >= levels.list.length;
        if ( isFinalLevel && !this.creditsSeen ) {
          this.creditsSeen = true;
          this.creditsScreen.show(false);   // first-time victory crawl: UN-skippable; onDone re-opens the menu
        } else {
          this.menu.hide = false;
          this.inventoryMenu.hide = false;
        }
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

        // Both menus are translucent glass now, so they can't sit on top of each
        // other. Instead the title slides out to the LEFT exactly as the
        // inventory slides in from the RIGHT — you flip between the two panels
        // rather than seeing one through the other. (inv originX: width=closed,
        // 0=open → title originX: 0=centred, -width=fully off-left.)
        this.menu.originX = this.inventoryMenu.originX - this.engine.window.width;

        // The title screen is a glass pane over the starfield — hide the idle
        // base + flanking turrets while NOT in a level so the menu floats over
        // clean space (they reappear the moment a level starts). Keyed off the
        // base's own in-level flag, not "title menu hidden": a modal that force-
        // hides the title (Settings, the Credits crawl) would otherwise read as
        // "in a level" and reveal the shooter behind the settings overlay.
        var inLevel = this.engine.globals.base.on;
        this.engine.globals.base.hide = !inLevel;
        this.engine.getObjects("helper").forEach(hl => hl.hide = !inLevel);
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

  // A small glowing key glyph (bow ring + shaft + teeth) in the unlock colour:
  // blue = synth keys, green = equipment keys. Matches the energy-cell glow look.
  generateKeyIcon(color) {
    var S = Item.ICON_SIZE;
    var cv = document.createElement("canvas");
    cv.width = cv.height = S;
    var ctx = cv.getContext("2d");
    var tones = color === "blue"
      ? { glow: "#1f5cf0", core: "#5b93ff", hot: "#d4e6ff" }
      : { glow: "#10a64f", core: "#3fe389", hot: "#d8ffe9" };
    var cx = S * 0.46;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = tones.glow;
    ctx.shadowBlur = 7;
    ctx.strokeStyle = tones.core;
    // Bow (ring) near the top.
    var ringY = S * 0.3, ringR = S * 0.16;
    ctx.lineWidth = S * 0.1;
    ctx.beginPath();
    ctx.arc(cx, ringY, ringR, 0, Math.PI * 2);
    ctx.stroke();
    // Shaft down from the ring.
    ctx.beginPath();
    ctx.moveTo(cx, ringY + ringR);
    ctx.lineTo(cx, S * 0.85);
    ctx.stroke();
    // Two teeth on the right of the lower shaft.
    ctx.lineWidth = S * 0.085;
    [0.66, 0.78].forEach(fy => {
      ctx.beginPath();
      ctx.moveTo(cx, S * fy);
      ctx.lineTo(cx + S * 0.17, S * fy);
      ctx.stroke();
    });
    ctx.shadowBlur = 0;
    // Hot highlight inside the bow.
    ctx.fillStyle = tones.hot;
    ctx.beginPath();
    ctx.arc(cx - ringR * 0.35, ringY - ringR * 0.35, S * 0.04, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return cv;
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

  // A sci-fi "energy cell" of fuel — a glowing plasma core inside a containment
  // ring with charge segments. Higher tier = bigger + hotter colour
  // (ENERGY_TIER_COLORS) + more lit segments + more crackle, so a stronger cell
  // reads instantly. Replaces the old hourglass art (fuel is no longer a speed-up).
  generateEnergyCellIcon(tier = 1, maxTier = 7) {
    var c = document.createElement("canvas");
    c.width = c.height = 100;
    var ctx = c.getContext("2d");

    var pal = ENERGY_TIER_COLORS[tier - 1] || ENERGY_TIER_COLORS[0];
    var f = maxTier > 1 ? (tier - 1) / (maxTier - 1) : 0;   // 0..1 up the ramp
    var cx = 50, cy = 50;
    var coreR = 13 + f * 19;          // T1 small droplet → T7 big orb
    var ringR = coreR + 10;

    // "#rrggbb" → "rgba(r,g,b,a)" so we can layer translucent glows.
    var rgba = (hex, a) => {
      var h = hex.replace("#", "");
      if ( h.length === 3 ) h = h.split("").map(x => x + x).join("");
      var n = parseInt(h, 16);
      return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
    };

    // 1) Outer bloom — the cell emits light, brighter the higher the tier.
    var bloom = ctx.createRadialGradient(cx, cy, coreR * 0.3, cx, cy, ringR + 14);
    bloom.addColorStop(0, rgba(pal.core, 0.45 + 0.3 * f));
    bloom.addColorStop(0.55, rgba(pal.glow, 0.22));
    bloom.addColorStop(1, rgba(pal.glow, 0));
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, 100, 100);

    // 2) Containment ring + charge segments: maxTier slots, the first `tier` lit.
    //    A radial fuel gauge — more lit segments = more fuel.
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#2b3550";
    ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, Math.PI * 2); ctx.stroke();
    ctx.lineCap = "round";
    for ( var i = 0; i < maxTier; i++ ) {
      var ang = -Math.PI / 2 + i * (Math.PI * 2 / maxTier);
      var lit = i < tier;
      var ax = Math.cos(ang), ay = Math.sin(ang);
      ctx.lineWidth = lit ? 4 : 3;
      ctx.strokeStyle = lit ? pal.core : "#39435c";
      if ( lit ) { ctx.shadowColor = pal.core; ctx.shadowBlur = 6; }
      ctx.beginPath();
      ctx.moveTo(cx + ax * (ringR - 3), cy + ay * (ringR - 3));
      ctx.lineTo(cx + ax * (ringR + 5), cy + ay * (ringR + 5));
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // 3) Plasma core — hot centre → core → glow edge.
    var core = ctx.createRadialGradient(cx - coreR * 0.3, cy - coreR * 0.35, coreR * 0.1, cx, cy, coreR);
    core.addColorStop(0, pal.hot);
    core.addColorStop(0.5, pal.core);
    core.addColorStop(1, pal.glow);
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = rgba(pal.hot, 0.85);
    ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, Math.PI * 2); ctx.stroke();

    // 4) Contained energy filaments — bright arcs across the core, more per tier.
    var arcs = 1 + Math.round(f * 3);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = rgba(pal.hot, 0.5);
    for ( var k = 0; k < arcs; k++ ) {
      var a0 = k * 1.7;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a0) * coreR * 0.25, cy + Math.sin(a0) * coreR * 0.25,
              coreR * 0.7, a0, a0 + Math.PI * 1.1);
      ctx.stroke();
    }

    // glossy specular highlight (top-left)
    ctx.fillStyle = rgba("#ffffff", 0.8);
    ctx.beginPath();
    ctx.ellipse(cx - coreR * 0.32, cy - coreR * 0.4, coreR * 0.26, coreR * 0.15, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // 5) Orbiting charge sparks — a few bright motes at higher tiers.
    var sparks = Math.max(0, tier - 2);
    for ( var s = 0; s < sparks; s++ ) {
      var sa = s * 2.39996;                          // golden angle → scattered
      var sr = coreR + 3 + (s % 2) * 3;
      var sx = cx + Math.cos(sa) * sr, sy = cy + Math.sin(sa) * sr;
      ctx.fillStyle = rgba(pal.hot, 0.95);
      ctx.shadowColor = pal.core; ctx.shadowBlur = 5;
      ctx.beginPath(); ctx.arc(sx, sy, 2, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }

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
      // Slot-unlock progression: which slots are still locked + which levels have
      // already handed out their one-time key.
      locks: { ...this.inventory.locks },
      keysAwarded: this.engine.globals.levels.keysAwarded,
      // Which level the player last had selected (1-based) — reselect on reload.
      selectedLevel: this.engine.globals.levels.selected,
      // Victory crawl is a one-time thing — once seen, later final-level clears
      // skip straight to the reward.
      creditsSeen: !!this.creditsSeen,
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
    if ( saved.locks ) {
      for ( var lk in this.inventory.locks ) {
        if ( typeof saved.locks[lk] === "boolean" ) this.inventory.locks[lk] = saved.locks[lk];
      }
    }
    if ( saved.keysAwarded && typeof saved.keysAwarded === "object" ) {
      this.engine.globals.levels.keysAwarded = saved.keysAwarded;
    }
    if ( typeof saved.selectedLevel === "number" ) {
      this.engine.globals.levels.selected = saved.selectedLevel;
    }
    if ( typeof saved.creditsSeen === "boolean" ) {
      this.creditsSeen = saved.creditsSeen;
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
    // Dev: wipe to a fresh state IN PLACE and STAY in the Settings modal — no
    // reload, no slide. From there you can Close into a clean game with no items,
    // or hit a Cheat button (which closes the modal + slides into the inventory).
    if ( this.engine.dev ) {
      this.inventory.reset();     // wipes items + re-locks every slot
      stats.power.lvl = stats.power.val = 1;
      stats.speed.lvl = stats.speed.val = 1;
      this.engine.globals.levels.selected = 1;
      this.engine.globals.levels.keysAwarded = {};   // keys drop again from scratch
      this.creditsSeen = false;   // let the victory crawl play again after a wipe
      this.engine.trigger("saveRequested");
      return;
    }
    // Prod: reload to a clean title screen (no cheat buttons exist there).
    if ( this._beforeUnload ) {
      window.removeEventListener("beforeunload", this._beforeUnload);
      this._beforeUnload = null;
    }
    window.location.reload();
  }

}