import { BoundingRect } from "../../engine/GameMath.js";
import Starfield from "../effects/Starfield.js";

// ─────────────────────────────────────────────────────────────────────────────
// Victory / credits screen — a Star-Wars-style perspective crawl that plays the
// FIRST time you clear the last level. Subsequent clears just hand out the
// tier-7 energy cell (the credits flag is persisted in the save — see Game.js).
//
// HOW THE CRAWL WORKS (pseudo-3D, no WebGL):
//   1. _buildCrawl() renders the whole credits text once onto a tall offscreen
//      canvas (`this.crawl`), `crawlW` wide × `crawlH` tall.
//   2. Each frame we slice the SCREEN below a horizon line into thin horizontal
//      bands and, for each band, look up which slice of the offscreen text lands
//      there under a perspective projection, then drawImage that slice scaled.
//      Near the bottom = big + full width (close to the viewer); up by the
//      horizon = tiny + pinched + faded (far away). `phase` scrolls the text up
//      into the distance over time. A drifting multi-depth starfield behind it
//      gives the parallax.
//
// Tunables are the ALL-CAPS fields below — Aaron tests live, so they're easy to
// nudge without touching the math.
// ─────────────────────────────────────────────────────────────────────────────
export default class CreditsScreen {
  z = 400;            // above everything (settings is 200)
  hide = true;

  // ── Tunables ──────────────────────────────────────────────────────────────
  HORIZON   = 0.17;   // vanishing-point height as a fraction of screen height
  FOCAL     = 340;    // perspective curvature (bigger = flatter / less pinch)
  STRIP     = 2;      // screen px per perspective band (smaller = smoother, costlier)
  SPEED     = 31;     // crawl scroll speed, source-px / second
  PHASE0    = -60;    // start phase (negative = brief empty lead-in at the bottom)
  FADE_HI   = 0.60;   // band scale at/above which text is fully opaque
  FADE_LO   = 0.22;   // band scale at/below which text has faded to nothing
  HINT_DELAY = 3.5;   // seconds before the "tap to skip" hint fades in
  // Depth past the last line before auto-finishing. The line reaches full
  // transparency around ~1160; 900 ends as it's fading to a faint wisp (the 0.5s
  // fade-to-black covers the rest) instead of lingering on near-invisible text +
  // empty stars. Raise to end later, lower to end sooner.
  FINISH_PAD = 900;

  constructor(engine, opts = {}) {
    this.engine = engine;
    this._onDone = opts.onDone;

    this.crawlW = engine.window.width;          // text drawn full-width at the bottom
    this._buildCrawl();

    // Full-canvas hit target so a tap anywhere skips, and nothing leaks through
    // to the game/menu beneath.
    this.screenRect = new BoundingRect(0, 0, engine.window.width, engine.window.height);

    // Same starfield the levels use — credits paints its own black first (the
    // game is still behind it), then draws these stars on top.
    this.starfield = new Starfield(engine);
    this._resetState();
  }

  _resetState() {
    this.phase = this.PHASE0;
    this._t = 0;
    this._finishing = false;
    this._exitFade = 0;
  }

  // Start (or restart) the crawl. The FIRST-time victory crawl is played
  // un-skippable (show(false)) so it's watched once through; replays from
  // Settings → Credits pass the default (skippable).
  show(skippable = true) {
    this._resetState();
    this._skippable = skippable;
    this.hide = false;
    this.engine.sounds.playMusic("credits");   // boss/main theme crossfades to the credits theme
  }

  // ── Star-Wars crawl content ────────────────────────────────────────────────
  // Edit freely — this is the "workshop" part. Yellow = the crawl body.
  static SCRIPT = [
    { kind: "title",    text: "KALROS" },
    { kind: "subtitle", text: "EPISODE VII" },
    { kind: "subtitle", text: "THE LAST DRAGON" },
    { kind: "gap", h: 56 },

    { kind: "para", text:
      "Peace has returned to the galaxy. For seven long levels, dragons fell " +
      "from the sky with the grim determination of creatures who had clearly " +
      "not read the room — and one small, stubborn base shot down every last " +
      "one of them." },

    { kind: "para", text:
      "History will remember the heroes: two flanking turrets who never once " +
      "took a lunch break, a reactor core that never asked for a raise, and a " +
      "Commander with frankly concerning reflexes and an apparently unlimited " +
      "supply of hand-synthesized gems. Together they held the line, mostly by " +
      "refusing to move." },

    { kind: "para", text:
      "The last dragon — a purple monstrosity roughly the size of a small moon " +
      "— went down in a tasteful shower of gems, and the galaxy, against all " +
      "reasonable odds, was saved." },

    { kind: "gap", h: 70 },
    { kind: "credit", label: "Game Designer & Creator", name: "AARON WHIPPLE" },
    { kind: "gap", h: 38 },
    { kind: "credit", label: "Collaborator", name: "CLAUDE" },
    { kind: "gap", h: 70 },
    { kind: "para", text: "Thank you for playing.", center: true },
    { kind: "gap", h: 40 },
  ];

  _buildCrawl() {
    var W = this.crawlW;
    var margin = 44;
    var maxW = W - margin * 2;
    var FONT = "'Helvetica Neue', Arial, sans-serif";
    var YELLOW = "#ffd21e";
    var YELLOW_DIM = "#e7c54a";

    // Per-kind text styling.
    var styleFor = (kind) => ({
      title:    { size: 62, weight: "bold",   color: YELLOW,     lh: 66, gapAfter: 6 },
      subtitle: { size: 26, weight: "bold",   color: YELLOW_DIM, lh: 34, gapAfter: 2 },
      para:     { size: 30, weight: "normal", color: YELLOW,     lh: 42, gapAfter: 30 },
      credLabel:{ size: 21, weight: "normal", color: YELLOW_DIM, lh: 28, gapAfter: 4 },
      credName: { size: 36, weight: "bold",   color: YELLOW,     lh: 44, gapAfter: 0 },
    }[kind]);

    var mc = document.createElement("canvas").getContext("2d");
    var fontStr = (s) => s.weight + " " + s.size + "px " + FONT;

    var wrap = (text, s) => {
      mc.font = fontStr(s);
      var words = text.split(" ");
      var lines = [], cur = "";
      for (var i = 0; i < words.length; i++) {
        var test = cur ? cur + " " + words[i] : words[i];
        if (mc.measureText(test).width > maxW && cur) { lines.push(cur); cur = words[i]; }
        else cur = test;
      }
      if (cur) lines.push(cur);
      return lines;
    };

    // Layout pass → flat list of {str, style, y}, tracking total height.
    var items = [];
    var y = 0;
    var add = (str, s) => { items.push({ str: str, s: s, y: y }); y += s.lh; };

    CreditsScreen.SCRIPT.forEach(b => {
      if (b.kind === "gap") { y += b.h; return; }
      if (b.kind === "title")    { add(b.text, styleFor("title")); return; }
      if (b.kind === "subtitle") { add(b.text, styleFor("subtitle")); return; }
      if (b.kind === "credit") {
        var ls = styleFor("credLabel"), ns = styleFor("credName");
        add(b.label, ls); y += ls.gapAfter;
        add(b.name, ns);
        return;
      }
      // paragraph
      var ps = styleFor("para");
      wrap(b.text, ps).forEach(line => add(line, ps));
      y += ps.gapAfter;
    });

    var topPad = 30, botPad = 30;
    var H = Math.ceil(y + topPad + botPad);

    var c = document.createElement("canvas");
    c.width = W; c.height = H;
    var ctx = c.getContext("2d");
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    items.forEach(it => {
      ctx.font = fontStr(it.s);
      ctx.fillStyle = it.s.color;
      ctx.fillText(it.str, W / 2, it.y + topPad);
    });

    this.crawl = c;
    this.crawlH = H;
    // Source row of the last visible glyph block — used to know when the crawl
    // has fully receded so we can auto-finish.
    var last = items[items.length - 1];
    this.contentBottom = last ? last.y + last.s.lh + topPad : H;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  _finish() {
    if (this._finishing) return;
    this._finishing = true;
    this.engine.sounds.fadeOutMusic({ fade: 1.5 });   // credits music fades as the crawl ends
  }

  update() {
    if (this.hide) return;
    var dt = 1 / 60;
    this._t += dt;
    this.starfield.update();

    if (this._finishing) {
      this._exitFade = Math.min(1, this._exitFade + dt / 0.5);   // ~0.5s fade out
      if (this._exitFade >= 1) {
        this.hide = true;
        this._onDone && this._onDone();
      }
      return;
    }

    this.phase += this.SPEED * dt;

    // Auto-finish once the last line has receded well past the fade-out depth.
    if (this.phase - this.contentBottom > this.FINISH_PAD) this._finish();
  }

  draw(ctx) {
    if (this.hide) return;
    var engine = this.engine;
    var sw = engine.window.width, H = engine.window.height;

    ctx.save();

    // Space backdrop (paint over the game, then the shared starfield).
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, sw, H);
    this.starfield.draw(ctx);

    // Perspective crawl.
    this._drawCrawl(ctx, sw, H);

    // "tap to skip" hint, fading in after a beat — only when skipping is allowed
    // (suppressed on the first-time, un-skippable crawl).
    if (!this._finishing && this._skippable) {
      var hintA = Math.max(0, Math.min(1, (this._t - this.HINT_DELAY) / 1.2)) * 0.5;
      if (hintA > 0) {
        ctx.globalAlpha = hintA;
        ctx.fillStyle = "#cfe3ff";
        ctx.font = "16px 'Helvetica Neue', Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText("tap to skip", sw / 2, H - 22);
        ctx.globalAlpha = 1;
      }
    }

    // Exit fade to black, then the menu shows underneath.
    if (this._finishing && this._exitFade > 0) {
      ctx.globalAlpha = this._exitFade;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, sw, H);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  _drawCrawl(ctx, sw, H) {
    var vpY = H * this.HORIZON;
    var groundH = H - vpY;
    var focal = this.FOCAL;
    var cx = sw / 2;
    var W = this.crawlW, imgH = this.crawlH;
    var STRIP = this.STRIP;

    // Walk screen bands from the bottom (near) up toward the horizon (far),
    // stopping once the text has faded out.
    for (var y = H; y > vpY; y -= STRIP) {
      var yTop = y - STRIP;
      var sBot = (y - vpY) / groundH;          // band-bottom scale (0..1, big near bottom)
      var sTop = (yTop - vpY) / groundH;
      if (sTop <= 0) break;
      var sMid = (sBot + sTop) / 2;
      if (sMid < this.FADE_LO) break;           // everything above here is faded out

      // scale → perspective depth → source row in the crawl image.
      var dBot = focal * (1 - sBot) / sBot;
      var dTop = focal * (1 - sTop) / sTop;
      var rTop = this.phase - dTop;             // smaller (further up the image)
      var rBot = this.phase - dBot;
      if (rTop < 0 || rBot > imgH) continue;    // band maps outside the text image

      var alpha = this._fade(sMid);
      if (alpha <= 0) continue;
      var wMid = W * sMid;
      ctx.globalAlpha = alpha;
      ctx.drawImage(this.crawl, 0, rTop, W, rBot - rTop, cx - wMid / 2, yTop, wMid, y - yTop);
    }
    ctx.globalAlpha = 1;
  }

  _fade(s) {
    if (s >= this.FADE_HI) return 1;
    if (s <= this.FADE_LO) return 0;
    return (s - this.FADE_LO) / (this.FADE_HI - this.FADE_LO);
  }

  // ── Input: tap / click anywhere skips to the end ────────────────────────────
  onMouseClick() {
    if (this.hide) return true;
    // First-time victory crawl: not skippable. Swallow the tap (so it can't leak
    // to the menu beneath) but keep playing — it auto-finishes on its own.
    if (!this._skippable) return false;
    // Ignore the very first moment so a leftover gameplay tap doesn't skip it.
    if (this._t < 0.6) return false;
    this._finish();
    return false;          // swallow the event (don't fall through to the game)
  }
}
