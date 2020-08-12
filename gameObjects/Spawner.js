import Enemy from "./Enemy.js";
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
        this.nextSpawn += this.engine.globals.levels.current.spawnRate;

        this.engine.register(new Enemy(
          this.engine, 
          Math.random()*(this.engine.window.width+200)-100, -20,
          this.engine.globals.levels.current.enemyHp,
          this.engine.globals.levels.current.enemyType), 
        "enemy");
      }
    }

    this.enemiesLeft = this.enemies + Object.keys(this.engine.gameObjects.enemy ?? {}).length;
    if ( this.enemiesLeft === 0 && !this.rewardAnim) {
      var boss = this.engine.globals.levels.current.boss;
      if ( boss && this.spawnBoss ) {
        this.engine.register(new Boss(this.engine, 2200, boss), "enemy");
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
      this.rewardAnim.alpha = Math.min(this.rewardAnim.alpha + 0.01, 1);
      this.rewardAnim.rad += this.rewardAnim.speed * 0.02;
      this.rewardAnim.dist-=this.rewardAnim.speed;
      this.rewardAnim.speed += 0.07;

      if ( this.rewardAnim.dist < 0 ) {
        this.reset();
        this.rewardAnim = null;
        new Enemy(this.engine, this.engine.window.width/2, this.engine.window.height/2, this.engine.globals.levels.current.cash)._createCash();
        this.engine.globals.levels.rollForReward();
        setTimeout(() => this.engine.trigger("levelWin"), 2500);
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
      showFor: 2,
    });

    this.rewardAnim = {
      dist: 350,
      speed: 1,
      rad: 0,
      count: 5,
      alpha: 0,
      colors: ["red", "green", "yellow", "blue", "purple"],
    }
  }
}