import Enemy from "./Enemy.js";
import Strafer from "./Strafer.js";
import Phaser from "./Phaser.js";
import Circle from "../engine/gfx/shapes/Circle.js";
import Boss from "./Boss.js";

export default class Spawner {
  on = false;
  spawnRate = 1;
  nextSpawn = this.spawnRate;

  constructor(engine) {
    this.engine = engine;
  }

  start() {
    this.on = true;
    this.enemiesLeft = this.enemies = this.engine.globals.levels.current.enemies;
    this.spawnBoss = true;
  }

  reset() {
    this.nextSpawn = this.spawnRate;
    this.on = false;
  }

  update() {
    if ( this.on ) {
      this.nextSpawn -= 1/60;
      if ( this.enemies > 0 && this.nextSpawn < 0 ) {
        this.enemies--;
        var lvl = this.engine.globals.levels.current;
        this.nextSpawn += lvl.spawnRate;

        // A fraction of spawns (level.straferChance %) come in as fast diving
        // Strafers instead of straight-falling grunts.
        if ( lvl.straferChance && Math.random()*100 < lvl.straferChance ) {
          this.engine.register(new Strafer(
            this.engine, 0, 0, lvl.straferHp ?? lvl.enemyHp, "orange"),
          "enemy");
        } else if ( lvl.phaser ) {
          // Green blink-dodge enemies: ghost + slide aside each time they're hit.
          this.engine.register(new Phaser(
            this.engine,
            Math.random()*(this.engine.window.width+200)-100, -20,
            lvl.enemyHp,
            lvl.enemyType ?? "green"),
          "enemy");
        } else {
          this.engine.register(new Enemy(
            this.engine,
            Math.random()*(this.engine.window.width+200)-100, -20,
            lvl.enemyHp,
            lvl.enemyType),
          "enemy");
        }
      }
    }

    this.enemiesLeft = this.enemies + Object.keys(this.engine.gameObjects.enemy ?? {}).length;
    if ( this.enemiesLeft === 0 && !this.rewardAnim) {
      var boss = this.engine.globals.levels.current.boss;
      if ( boss && this.spawnBoss ) {
        this.engine.register(new Boss(this.engine, this.engine.globals.levels.current.bossHp ?? 2200, boss), "enemy");
        this.spawnBoss = false;
        this.delayReward = 5;
      } else {
        this.engine.globals.base.on = false;
        
        this.delayReward = this.delayReward ?? 0;
        this.delayReward -= 1/60;
        if ( this.delayReward <= 0 ) {
          this._victory();
        }
      }
    }

    if ( this.rewardAnim ) {
      this.rewardAnim.alpha = Math.min(this.rewardAnim.alpha + 0.02, 1);
      this.rewardAnim.rad += this.rewardAnim.speed * 0.02;
      this.rewardAnim.dist-=this.rewardAnim.speed;
      this.rewardAnim.speed += 0.22;   // snappier spiral-in

      if ( this.rewardAnim.dist < 0 ) {
        this.reset();
        this.rewardAnim = null;
        // No cash drop — the level reward is the hourglass handed out by
        // rollForReward() (money is out of the loop now).
        this.engine.globals.levels.rollForReward();
        setTimeout(() => this.engine.trigger("levelWin"), 600);   // quick return to menu
      }
    }
  }

  draw(ctx) {
    if ( this.rewardAnim ) {
      for ( var i = 0; i < this.rewardAnim.count; i++) {
        Circle.draw(
          ctx, 
          this.engine.window.width/2 + Math.cos(this.rewardAnim.rad + i*(2*Math.PI/this.rewardAnim.count))*this.rewardAnim.dist,
          this.engine.window.height/2 + Math.sin(this.rewardAnim.rad + i*(2*Math.PI/this.rewardAnim.count))*this.rewardAnim.dist,
          15,
          {
            color: this.rewardAnim.colors[i],
            alpha: this.rewardAnim.alpha,
          }
        );
      }
    }
  }

  _victory() {
    this.engine.sounds.play("chime");
    this.engine.flash.show("Victory!", {
      y: 280,
      color: "#0f0",
      showFor: 1.2,
    });

    this.rewardAnim = {
      dist: 240,
      speed: 1.5,
      rad: 0,
      count: 5,
      alpha: 0,
      colors: ["red", "green", "yellow", "blue", "purple"],
    }
  }
}