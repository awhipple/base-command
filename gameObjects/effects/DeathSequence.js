import GameObject from "../../engine/objects/GameObject.js";
import Particle from "../../engine/gfx/shapes/Particle.js";
import { ENEMY_PALETTE } from "../Enemy.js";

// The player's death cinematic: a "singularity collapse" played in place of an
// instant snap back to the title. The base ignites, a black hole forms over it,
// and everything on screen — the base, the flanking turrets, every enemy — is
// dragged spiralling into the event horizon. The hole swells, collapses to a
// point, and detonates in a white shockwave; THEN the caller's onDone returns
// to the menu.
//
// Built entirely on the existing linear `Particle` (start→end interp): the
// swirl is faked by giving each infalling particle an END angle rotated from
// its START angle, so a stream of them reads as a curved accretion arm. The
// black-hole core + accretion disk are drawn directly in draw() with additive
// radial gradients. Particles flush ON TOP of everything (GameWindow), but they
// fade to alpha 0 right as they reach the centre, so they vanish into the
// horizon instead of painting over the black core.
//
// z sits above the playfield/HUD (both z=5); the title menu is hidden in-level.
export default class DeathSequence extends GameObject {
  z = 850;

  // Timeline (seconds)
  static IGNITE    = 0.45;   // bright seed before the horizon opens
  static GROW_END  = 1.85;   // horizon finished easing open (still gently breathing)
  static COLLAPSE  = 2.03;   // horizon has whipped shut to a point → detonate
  static DONE      = 2.55;   // afterglow gone → hand back to the menu
  static MAXR      = 74;     // peak event-horizon radius

  constructor(engine, x, y, { enemies = [], onDone } = {}) {
    super(engine, { x, y, radius: 1 });
    this.cx = x;
    this.cy = y;
    this.onDone = onDone;

    this.t = 0;
    this.coreR = 0;       // event-horizon radius (grows, then collapses)
    this.ringPhase = 0;   // accretion-disk spin
    this.seed = 0;        // ignition-point brightness
    this.vignette = 0;    // space darkening toward the hole
    this.flash = 0;       // detonation full-screen flash
    this.spin = Math.random() < 0.5 ? 1 : -1;   // disk handedness

    this.base = engine.globals.base;

    // Take ownership of the live enemies: freeze each (on=false stops its AI +
    // collisions, draw still runs) and record a spiral so we can drag its real
    // sprite into the hole, then shatter it at the horizon. Spin matches the
    // disk; closer enemies fall in quicker; a small stagger keeps it from a
    // single synchronized lurch.
    var maxDim = Math.max(engine.window.width, engine.window.height);
    this.captives = [];
    enemies.forEach(e => {
      // Guard per-enemy: a single odd object must not abort the whole death
      // (which would throw out of the constructor and lock the game).
      try {
        e.on = false;
        e.captured = true;   // hide its HP readout while it's pulled in
        var a0 = Math.atan2(e.y - y, e.x - x);
        var d0 = Math.hypot(e.x - x, e.y - y);
        this.captives.push({
          e, a0, d0,
          col: hexToRgb((ENEMY_PALETTE[e.type] || ENEMY_PALETTE.white).glow),
          swirl: (1.4 + Math.random() * 1.8) * this.spin,
          t0: 0.18 + Math.random() * 0.22,
          dur: 0.7 + (d0 / maxDim) * 0.7,
          done: false,
        });
      } catch ( err ) {
        console.error("DeathSequence: skipping an enemy at capture:", err);
        try { engine.unregister(e); } catch ( ee ) {}
      }
    });
  }

  update() {
    // Hard guarantee: this cinematic must NEVER be able to lock the game. If
    // anything in here throws, the engine's update loop would die every frame
    // (draw keeps running → enemies frozen mid-spin, no return to the title).
    // So on ANY error we log it and bail straight back to the menu via onDone.
    try {
      this._update();
    } catch ( err ) {
      console.error("DeathSequence: bailing to title after error:", err);
      if ( !this.done ) {
        this.done = true;
        try { this.engine.unregister(this); } catch ( e ) {}
        this.onDone?.();
      }
    }
  }

  _update() {
    var dt = 1 / 60;
    var W = this.engine.window.width, H = this.engine.window.height;
    var prev = this.t;
    this.t += dt;
    var t = this.t;

    // Disk whirls faster as the hole dies (organic "spinning up" into collapse).
    this.ringPhase += (t > DeathSequence.GROW_END ? 0.42 : 0.16) * this.spin;
    this.flash *= 0.86;

    // --- core size envelope: eased open → live breathing → quick eased collapse.
    // No flat static hold: it rushes open (ease-out), keeps a subtle breath, then
    // whips shut fast (ease-in, accelerating to a point).
    var R = DeathSequence.MAXR;
    if ( t < DeathSequence.IGNITE ) {
      this.coreR = 0;
    } else if ( t < DeathSequence.GROW_END ) {
      var f = (t - DeathSequence.IGNITE) / (DeathSequence.GROW_END - DeathSequence.IGNITE);
      var eased = 1 - Math.pow(1 - f, 3);                 // ease-out: opens fast, settles
      this.coreR = R * eased * (1 + 0.05 * Math.sin(t * 7));   // never perfectly static
    } else if ( t < DeathSequence.COLLAPSE ) {
      var g = (t - DeathSequence.GROW_END) / (DeathSequence.COLLAPSE - DeathSequence.GROW_END);
      this.coreR = R * (1 - g * g * g);                   // ease-in: whips shut to a point
    } else {
      this.coreR = 0;
    }

    // Ignition seed brightens fast, then yields to the horizon.
    this.seed = t < 0.5 ? Math.min(1, t / 0.18) : Math.max(0, this.seed - 0.06);
    // Space darkens as it's consumed, then releases at the detonation.
    this.vignette = t < DeathSequence.COLLAPSE
      ? Math.min(0.82, (t / DeathSequence.GROW_END) * 0.82)
      : Math.max(0, this.vignette - 0.08);

    if ( prev < 0.02 ) this.engine.sounds.play("zap", { volume: 0.4 });

    // --- continuous spiral infall from all around the screen ---
    if ( t >= 0.2 && t < 1.95 ) {
      var rate = t < DeathSequence.IGNITE ? 4 : 9;   // particles per frame
      for ( var i = 0; i < rate; i++ ) {
        var a = Math.random() * Math.PI * 2;
        var d = 120 + Math.random() * Math.max(W, H) * 0.55;
        this._pull(this.cx + Math.cos(a) * d, this.cy + Math.sin(a) * d);
      }
    }

    // Drag the live enemies in — their real sprites spiral into the hole.
    this._updateCaptives(t);

    // Once the horizon is wide enough to cover the base, dissolve it (and the
    // flanking turrets) into the hole and hide the now-empty sprites.
    if ( !this._dissolved && t >= 0.55 ) {
      this._dissolved = true;
      this._dissolveBase();
      if ( this.base ) this.base.hide = true;
      this.engine.getObjects("helper").forEach(h => h.hide = true);
    }

    if ( !this._detonated && t >= DeathSequence.COLLAPSE ) {
      this._detonated = true;
      this._detonate(W, H);
    }

    if ( !this.done && t >= DeathSequence.DONE ) {
      this.done = true;
      this.engine.unregister(this);
      this.onDone?.();
    }
  }

  // Spawn one infalling particle from (sx, sy) that spirals into the centre and
  // fades to nothing as it arrives.
  _pull(sx, sy, opts = {}) {
    var cx = this.cx, cy = this.cy;
    var a = Math.atan2(sy - cy, sx - cx);
    var d = Math.hypot(sx - cx, sy - cy);
    var swirl = (opts.swirl ?? (1.1 + Math.random() * 1.6)) * this.spin;
    var endR = opts.endR ?? (3 + Math.random() * 7);
    var endA = a + swirl;
    var life = opts.life ?? Math.max(0.32, Math.min(1.0, d / 255)) * (0.85 + Math.random() * 0.3);
    var c = opts.color ?? this._accretionColor();
    var e = opts.endColor ?? { r: 235, g: 243, b: 255 };
    this.engine.register(new Particle(this.engine, {
      start: { x: sx, y: sy, radius: opts.r ?? (1.8 + Math.random() * 2.6), r: c.r, g: c.g, b: c.b, alpha: opts.alpha ?? 1 },
      end:   { x: cx + Math.cos(endA) * endR, y: cy + Math.sin(endA) * endR, radius: 0.5, r: e.r, g: e.g, b: e.b, alpha: 0 },
      lifeSpan: life,
      // Gravity: drift slowly at the rim, then get whipped into the centre.
      ease: opts.ease ?? "inCubic",
    }));
  }

  // Accretion tint: mostly blue-white, some pure white, a little hot orange.
  _accretionColor() {
    var roll = Math.random();
    if ( roll < 0.5 ) return { r: 140, g: 200, b: 255 };
    if ( roll < 0.8 ) return { r: 255, g: 255, b: 255 };
    return { r: 255, g: 150, b: 50 };
  }

  _dissolveBase() {
    for ( var i = 0; i < 46; i++ ) {
      var sx = this.cx + (Math.random() - 0.5) * 150;
      var sy = this.cy - Math.random() * 120;   // the turret rises above the core
      this._pull(sx, sy, {
        color: Math.random() < 0.5 ? { r: 200, g: 220, b: 255 } : { r: 255, g: 240, b: 200 },
        life: 0.5 + Math.random() * 0.6,
        r: 2 + Math.random() * 3,
      });
    }
  }

  // Drive each frozen enemy along an accelerating spiral into the hole, trailing
  // a glowing wake, then shatter it into infalling particles at the horizon.
  _updateCaptives(t) {
    for ( var i = 0; i < this.captives.length; i++ ) {
      var c = this.captives[i];
      if ( c.done ) continue;
      var lt = t - c.t0;
      if ( lt <= 0 ) continue;                       // staggered start
      // Isolate each enemy: a throw from one (odd subclass, bad state) must not
      // abort the rest of the infall — drop it from the hole and move on.
      try {
        var p = Math.min(1, lt / c.dur);
        var ep = p * p;                              // ease-in: accelerate inward
        var dist = c.d0 * (1 - ep);
        var ang = c.a0 + c.swirl * ep;               // sweeps tighter as it falls in
        c.e.x = this.cx + Math.cos(ang) * dist;
        c.e.y = this.cy + Math.sin(ang) * dist;

        // Glowing wake streaming into the hole behind it.
        if ( Math.random() < 0.7 ) {
          this._pull(c.e.x, c.e.y, {
            color: c.col, endColor: c.col,
            life: 0.3 + Math.random() * 0.25, r: 2 + Math.random() * 2.4,
            swirl: c.swirl * 0.5,
          });
        }

        if ( p >= 1 || dist <= this.coreR ) {
          c.done = true;
          this._shatter(c);
          this.engine.unregister(c.e);
        }
      } catch ( err ) {
        console.error("DeathSequence: dropping a captive after error:", err);
        c.done = true;
        try { this.engine.unregister(c.e); } catch ( e ) {}
      }
    }
  }

  // The enemy breaks apart at the event horizon — a tight burst of its own
  // colour, immediately sucked the last few pixels into the singularity.
  _shatter(c) {
    if ( Math.random() < 0.6 ) this.engine.sounds.play("spark", { volume: 0.2 });
    for ( var i = 0; i < 12; i++ ) {
      var a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 22;
      this._pull(c.e.x + Math.cos(a) * d, c.e.y + Math.sin(a) * d, {
        color: c.col, endColor: c.col,
        life: 0.25 + Math.random() * 0.25, r: 2 + Math.random() * 2.5,
        swirl: c.swirl * 0.6,
      });
    }
  }

  _detonate(W, H) {
    this.engine.sounds.play("fireball", { volume: 0.9 });
    this.flash = 0.9;

    // Outward shockwave ring — the singularity violently releasing.
    var n = 54;
    for ( var i = 0; i < n; i++ ) {
      var a = (i / n) * Math.PI * 2 + Math.random() * 0.1;
      var d = 180 + Math.random() * Math.max(W, H) * 0.7;
      var c = Math.random() < 0.6 ? { r: 180, g: 220, b: 255 } : { r: 255, g: 255, b: 255 };
      this.engine.register(new Particle(this.engine, {
        start: { x: this.cx, y: this.cy, radius: 4 + Math.random() * 5, r: c.r, g: c.g, b: c.b, alpha: 1 },
        end:   { x: this.cx + Math.cos(a) * d, y: this.cy + Math.sin(a) * d, radius: 0.5, r: 120, g: 150, b: 255, alpha: 0 },
        lifeSpan: 0.4 + Math.random() * 0.3,
        ease: "outCubic",   // blasts out hard, then decelerates
      }));
    }
    // A few slow puffs that swell and darken.
    for ( var j = 0; j < 10; j++ ) {
      var pa = Math.random() * Math.PI * 2, pd = Math.random() * 120;
      this.engine.register(new Particle(this.engine, {
        start: { x: this.cx, y: this.cy, radius: 20, r: 120, g: 160, b: 255, alpha: 0.5 },
        end:   { x: this.cx + Math.cos(pa) * pd, y: this.cy + Math.sin(pa) * pd, radius: 60, r: 20, g: 20, b: 60, alpha: 0 },
        lifeSpan: 0.7 + Math.random() * 0.4,
        ease: "outQuad",   // puffs swell out then ease to a stop
      }));
    }
  }

  draw(ctx) {
    var W = this.engine.window.width, H = this.engine.window.height;
    var cx = this.cx, cy = this.cy;

    // Darken space toward the hole.
    if ( this.vignette > 0.01 ) {
      ctx.save();
      var vg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H));
      vg.addColorStop(0, "rgba(0,0,0," + this.vignette + ")");
      vg.addColorStop(0.5, "rgba(0,0,0," + (this.vignette * 0.5) + ")");
      vg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // Ignition seed — the point of light before the horizon opens.
    if ( this.seed > 0.01 && this.coreR < 6 ) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      var sr = 10 + this.seed * 26;
      var sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, sr);
      sg.addColorStop(0, "rgba(255,255,255," + this.seed + ")");
      sg.addColorStop(0.4, "rgba(190,220,255," + (this.seed * 0.7) + ")");
      sg.addColorStop(1, "rgba(120,170,255,0)");
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(cx, cy, sr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // The black hole: additive accretion glow + spinning hot spots, then a pure
    // black event horizon punched on top.
    if ( this.coreR > 0.5 ) {
      var r = this.coreR;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      var ring = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, r * 2.4);
      ring.addColorStop(0, "rgba(80,150,255,0)");
      ring.addColorStop(0.35, "rgba(120,200,255,0.85)");
      ring.addColorStop(0.55, "rgba(255,255,255,0.9)");
      ring.addColorStop(0.75, "rgba(255,150,60,0.5)");
      ring.addColorStop(1, "rgba(255,90,40,0)");
      ctx.fillStyle = ring;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 2.4, 0, Math.PI * 2);
      ctx.fill();

      for ( var k = 0; k < 2; k++ ) {
        var ha = this.ringPhase + k * Math.PI;
        var hx = cx + Math.cos(ha) * r * 1.25, hy = cy + Math.sin(ha) * r * 1.25;
        var hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.7);
        hg.addColorStop(0, "rgba(255,240,210,0.9)");
        hg.addColorStop(1, "rgba(255,160,60,0)");
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(hx, hy, r * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      ctx.save();
      var core = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.05);
      core.addColorStop(0, "rgba(0,0,0,1)");
      core.addColorStop(0.85, "rgba(0,0,0,1)");
      core.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Detonation flash.
    if ( this.flash > 0.02 ) {
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255," + Math.min(1, this.flash) + ")";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }
}

function hexToRgb(hex) {
  var h = (hex || "#ffffff").replace("#", "");
  if ( h.length === 3 ) h = h.split("").map(c => c + c).join("");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
