import Enemy from "./Enemy.js";
import Strafer from "./Strafer.js";
import Image from "../engine/gfx/Image.js";
import Item from "./Item.js";

export default class Levels {
  constructor(engine) {
    this.engine = engine;
    // Levels no longer drop gems OR money — gems come only from synthesis, and
    // money is out of the loop. The ONLY level reward is an HOURGLASS (which
    // boosts synth growth), so the game is an idle plant you speed up by playing.
    // `reward` is the hourglass tier; `chance:100` = always drops, and it's
    // repeatable (replay a level for more). Higher levels give bigger hourglasses.
    // The ramp is a ROUGH first pass; the last (purple) level is unbeatable.
    this.list = [
      {
        // Beatable from a cold start: the no-gem basic shot does 1 dmg, so
        // 2-hp enemies die in 2 hits. Just a few, slow — something to do before
        // your first synthesized gem.
        enemies: 3,
        spawnRate: 1.6,
        enemyHp: 2,
        reward: "hourglass", chance: 100,
      },
      {
        enemies: 8,
        spawnRate: 1.2,
        enemyHp: 8,
        reward: "hourglass2", chance: 100,
      },
      {
        enemies: 10,
        spawnRate: 1.0,
        enemyHp: 10,              // lower than a grunt — the blink-dodge is the difficulty
        phaser: true,            // green enemies that ghost + slide aside each time they're hit
        enemyType: "green",
        reward: "hourglass3", chance: 100,
      },
      {
        enemies: 12,
        spawnRate: 0.9,
        enemyHp: 32,
        straferChance: 45,        // ~45% of spawns are fast diving Strafers
        straferHp: 22,            // a bit squishier than a grunt (they're evasive)
        reward: "hourglass4", chance: 100,
      },
      {
        enemies: 14,
        enemyType: "red",
        spawnRate: 0.8,
        enemyHp: 55,
        reward: "hourglass5", chance: 100,
      },
      {
        icon: engine.images.get("dragon-green"),
        enemies: 16,
        spawnRate: 0.9,
        enemyHp: 80,
        boss: "green",
        bossHp: 1000,
        reward: "hourglass6", chance: 100,
      },
      {
        icon: engine.images.get("dragon-purple"),
        enemies: 25,
        spawnRate: 0.75,
        enemyHp: 999,
        boss: "purple",
        reward: "hourglass7", chance: 100,
      },
    ];

    this.selected = 1;
  }

  rollForReward() {
    var chance = (this.current.qty ?? 0) > 0 ? 100 : (this.current.chance ?? 0);
    if ( this.current.reward && Math.random() * 100 < chance) {
      var item = new Item(this.engine, this.current.reward);
      this.engine.globals.inventory.add(item);
      this.engine.trigger("displayReward", item);
      
      if ( (this.current.qty ?? 0) > 0 ) {
        this.current.qty--;
        if ( this.current.qty === 0 && !this.current.chance ) {
          delete this.current.reward;
        }
      }
    }
  }

  get selectedReward() {
    if ( this.current.reward ) {
      if( !this.current.rewardIcon ) {
        this.current.rewardIcon = (new Item(this.engine, this.current.reward)).icon;
      }
    } else {
      this.current.rewardIcon = null;
    }
    return this.current.rewardIcon;
  }

  get selected() {
    return this._selected + 1;
  }

  set selected(val) {
    val = val - 1;
    if ( val >= 0 && val <= this.list.length - 1 ) {
      var changed = this._selected !== val;
      this._selected = val;
      this.current = this.list[val];
      // Persist the choice so a reload reopens on the same level. (No-op during
      // construction/restore — the autosave listener isn't installed yet.)
      if ( changed ) this.engine.trigger("saveRequested");
      if ( !this.current.icon ) {
        var icon = document.createElement("canvas");
        icon.width = 100;
        icon.height = 100;
        // Strafer-flavoured levels show the diving dart (nose-up) as their icon.
        if ( this.current.straferChance ) {
          var s = new Strafer(this.engine, 0, 0, this.current.straferHp ?? this.current.enemyHp, "orange");
          s.x = 50; s.y = 50; s.angle = -Math.PI / 2;
          s.draw(icon.getContext("2d"), {noHp: true});
        } else {
          (new Enemy(this.engine, 50, 50, this.current.enemyHp, this.current.enemyType)).draw(icon.getContext("2d"), {noHp: true});
        }
        this.current.icon = new Image(icon);
      }
    }
  }
}