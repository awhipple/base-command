import Enemy from "./Enemy.js";
import Image from "../engine/gfx/Image.js";
import Item from "./Item.js";

export default class Levels {
  constructor(engine) {
    this.engine = engine;
    this.list = [
      {
        enemies: 4,
        spawnRate: 3,
        enemyHp: 2,
        reward: "whiteGem",
        qty: 2,
      },
      {
        enemies: 6,
        spawnRate: 0.5,
        enemyHp: 6,
        reward: "whiteGem",
        chance: 50,
      },
      {
        enemies: 10,
        spawnRate: 0.5,
        enemyHp: 15,
        reward: "whiteGem",
        chance: 100,
      },
      {
        enemies: 15,
        spawnRate: 0.5,
        enemyHp: 25,
        reward: "blueGem",
        chance: 50,
      },
      {
        enemies: 15,
        enemyType: "red",
        spawnRate: 0.5,
        enemyHp: 20,
        reward: "blueGem",
        chance: 100,
      },
      {
        icon: engine.images.get("dragon-green"),
        enemies: 20,
        spawnRate: 1,
        enemyHp: 75,
        boss: "green",
        reward: "greenGem",
        chance: 100,
      },
      {
        icon: engine.images.get("dragon-purple"),
        enemies: 25,
        spawnRate: 0.75,
        enemyHp: 999,
        boss: "purple",
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
      this._selected = val;
      this.current = this.list[val];
      this.current.cash = this.current.cash ?? this.current.enemies * this.current.enemyHp * (this.current.enemyType === "red" ? 2 : 1);
      if ( !this.current.icon ) {
        var icon = document.createElement("canvas");
        icon.width = 100;
        icon.height = 100;
        (new Enemy(this.engine, 50, 50, this.current.enemyHp, this.current.enemyType)).draw(icon.getContext("2d"), {noHp: true});
        this.current.icon = new Image(icon);
      }
    }
  }
}