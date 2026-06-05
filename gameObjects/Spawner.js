import Enemy from "./Enemy.js";
import Strafer from "./Strafer.js";
import Phaser from "./Phaser.js";
import Boss from "./Boss.js";

// Ombre-glow palette for the victory swirl. Each spinning ribbon circle is drawn
// as a little LIT sphere — bright highlight → saturated body → deep rim — with a
// coloured bloom, so it matches the plasma/energy-cell look of the rest of the
// game instead of reading as a flat disc. Keyed by the colour names in rewardAnim.
const SWIRL_OMBRE = {
  red:    { light: "#ffb0a3", base: "#ff4332", deep: "#8f1206" },
  green:  { light: "#9bffb8", base: "#2ee36a", deep: "#0c7a32" },
  yellow: { light: "#fff3a8", base: "#ffd23d", deep: "#a87600" },
  blue:   { light: "#acd6ff", base: "#4a9bff", deep: "#16459e" },
  purple: { light: "#dcb0ff", base: "#a64dff", deep: "#561aa6" },
};

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
          // A level can specify a single `enemyType` OR an `enemyMix` array
          // (random pick per spawn) for a varied wave of circle grunts.
          var type = lvl.enemyMix
            ? lvl.enemyMix[Math.floor(Math.random() * lvl.enemyMix.length)]
            : lvl.enemyType;
          // Green grunts ARE the blink-dodge "phaser" variant (its level-3
          // identity), so green keeps its dodge in a mixed wave; white/red are plain.
          var EnemyClass = (type === "green") ? Phaser : Enemy;
          this.engine.register(new EnemyClass(
            this.engine,
            Math.random()*(this.engine.window.width+200)-100, -20,
            lvl.enemyHp,
            type),
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
        this.engine.trigger("bossSpawned");   // swap the main theme for the boss theme
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
    if ( !this.rewardAnim ) return;
    var a = this.rewardAnim;
    var cx = this.engine.window.width / 2, cy = this.engine.window.height / 2;
    var r = 15;

    ctx.save();
    ctx.globalAlpha = a.alpha;   // the whole swirl fades in as it spirals
    for ( var i = 0; i < a.count; i++ ) {
      var ang = a.rad + i * (2 * Math.PI / a.count);
      var x = cx + Math.cos(ang) * a.dist;
      var y = cy + Math.sin(ang) * a.dist;
      var pal = SWIRL_OMBRE[a.colors[i]] || SWIRL_OMBRE.blue;

      // Coloured bloom so the orb emits light (matches the energy-cell glow).
      ctx.shadowColor = pal.base;
      ctx.shadowBlur = 22;

      // Ombre body: highlight offset up-left → saturated core → deep rim, so each
      // circle reads as a lit sphere rather than a flat fill.
      var grad = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.12, x, y, r);
      grad.addColorStop(0, pal.light);
      grad.addColorStop(0.5, pal.base);
      grad.addColorStop(1, pal.deep);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Small specular dab for a glossy pop (no extra bloom — kill the shadow first).
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(x - r * 0.32, y - r * 0.32, r * 0.26, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fill();
    }
    ctx.restore();
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