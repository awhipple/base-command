export default class GameUI {
  z = 5;

  constructor(engine) {
    this.engine = engine;
  }

  draw(ctx) {
    var engine = this.engine;
    var levels = engine.globals.levels;
    var spawner = engine.globals.spawner;
    var cash = engine.globals.cash;
    var w = engine.window.width;

    ctx.save();
    ctx.font = "bold 28px Lucida Console, Menlo, monospace";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.shadowColor = "rgba(126, 231, 135, 0.55)";
    ctx.shadowBlur = 10;
    ctx.fillStyle = "#7ee787";
    ctx.fillText("$" + cash, 14, 10);
    ctx.shadowBlur = 0;

    if ( levels ) {
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