// Parallax starfield — a calm field of twinkling stars on three depth layers
// that drift slowly downward (near layers faster, for parallax). Pulled out of
// the victory crawl so the levels and the credits share one look.
//
// Two ways to use it:
//   • As a registered background object: `engine.register(new Starfield(engine))`.
//     Its z is far behind everything, so the engine's black fill + these stars
//     become the backdrop for whatever draws on top.
//   • As a plain helper another screen drives itself (see CreditsScreen, which
//     paints its own black first, then calls update()/draw()).
export default class Starfield {
  z = -1000;   // behind every gameplay/UI object

  constructor(engine, opts = {}) {
    this.engine = engine;
    this.w = engine.window.width;
    this.h = engine.window.height;
    this.count = opts.count ?? 150;
    this._t = 0;
    this._initStars();
  }

  _initStars() {
    this.stars = [];
    for (var i = 0; i < this.count; i++) {
      var layer = i % 3;                        // 0 far … 2 near
      this.stars.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        r: 0.5 + layer * 0.55 + Math.random() * 0.4,
        base: 0.28 + Math.random() * 0.55,
        tw: Math.random() * Math.PI * 2,         // twinkle phase
        tws: 0.5 + Math.random() * 1.6,          // twinkle speed
        drift: 3 + layer * 7,                    // px/s downward — near layer faster
      });
    }
  }

  update() {
    var dt = 1 / 60;
    this._t += dt;
    for (var i = 0; i < this.stars.length; i++) {
      var st = this.stars[i];
      st.y += st.drift * dt;
      if (st.y > this.h) st.y -= this.h;
    }
  }

  draw(ctx) {
    var t = this._t;
    for (var i = 0; i < this.stars.length; i++) {
      var st = this.stars[i];
      var a = st.base * (0.6 + 0.4 * Math.sin(st.tw + t * st.tws));
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
