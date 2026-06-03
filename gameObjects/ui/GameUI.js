export default class GameUI {
  z = 5;

  constructor(engine) {
    this.engine = engine;
  }

  draw(ctx) {
    var engine = this.engine;
    var levels = engine.globals.levels;
    var spawner = engine.globals.spawner;
    var w = engine.window.width;

    ctx.save();
    ctx.textBaseline = "top";
    // Only show the level/enemy HUD while actually in a level (spawner running) —
    // at the title it just clutters the corner next to the settings cog. (The
    // title screen shows the selected level + enemy count in its own panel.)
    if ( levels && spawner && spawner.on ) {
      ctx.font = "bold 16px Lucida Console, Menlo, monospace";
      ctx.textAlign = "right";
      ctx.fillStyle = "#9aa7c2";
      ctx.fillText("LVL " + levels.selected, w - 14, 14);
    }
    if ( spawner && spawner.on && (spawner.enemiesLeft ?? 0) > 0 ) {
      ctx.font = "bold 16px Lucida Console, Menlo, monospace";
      ctx.textAlign = "right";
      ctx.fillStyle = "#ffb74d";
      ctx.fillText("ENEMIES " + spawner.enemiesLeft, w - 14, 36);
    }
    ctx.restore();
  }
}