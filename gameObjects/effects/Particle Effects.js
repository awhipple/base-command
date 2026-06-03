import Particle from "../../engine/gfx/shapes/Particle.js";

// AOE blast for the explosive (yellow) weapon. Three layered particle types: a
// white core flash that grows, a ring of coloured sparks spraying out to the
// blast radius, and lingering glow. Returns the particles — register the array
// with the engine (engine.register sets their engine; they self-clean on lifeSpan).
const BLAST_RGB = {
  white:  { r: 255, g: 255, b: 255 },
  red:    { r: 255, g: 70,  b: 50  },
  blue:   { r: 90,  g: 170, b: 255 },
  yellow: { r: 255, g: 210, b: 40  },
};

function hexToRgb(hex) {
  var h = (hex || "#ffffff").replace("#", "");
  if ( h.length === 3 ) h = h.split("").map(c => c + c).join("");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

// A quick debris burst when an enemy dies — a small ring of coloured shards
// spraying outward + a soft flash, in the enemy's colour. Register the array.
export function deathBurst(x, y, color = "#ffffff") {
  var rgb = hexToRgb(color);
  var parts = [];
  var n = 12;
  for ( var i = 0; i < n; i++ ) {
    var a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    var d = 22 + Math.random() * 45;
    parts.push(new Particle(null, {
      start: { x, y, radius: 3 + Math.random() * 4, ...rgb, alpha: 1 },
      end:   { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, radius: 0.5, alpha: 0 },
      lifeSpan: 0.3 + Math.random() * 0.3,
    }));
  }
  parts.push(new Particle(null, {
    start: { x, y, radius: 12, ...rgb, alpha: 0.55 },
    end:   { x, y, radius: 42, alpha: 0 },
    lifeSpan: 0.25,
  }));
  return parts;
}
// A small hit spark at the point a shot lands — for every non-AOE impact
// (projectile collision or laser endpoint). Much smaller/quicker than a
// death burst: a core pop + a few sparks flicking outward, all in the shot's
// colour. `style` lets each weapon read a little differently:
//   "laser"  — tighter, faster, sharper flick (hit-scan beam)
//   "bullet" — rounder pop with a touch more spread (default)
const IMPACT_STYLE = {
  bullet: { core: 7,  coreGrow: 20, coreLife: 0.16, n: 6, spread: 24, sparkLife: 0.26, sparkR: 3 },
  laser:  { core: 6,  coreGrow: 16, coreLife: 0.12, n: 5, spread: 18, sparkLife: 0.18, sparkR: 2.4 },
};
export function impactSpark(x, y, color = "white", style = "bullet") {
  var rgb = BLAST_RGB[color] ?? hexToRgb(color);
  var s = IMPACT_STYLE[style] ?? IMPACT_STYLE.bullet;
  var parts = [];

  // Core flash — a quick bright pop right at the contact point, in the shot's
  // colour (a red shot pops red, not white).
  parts.push(new Particle(null, {
    start: { x, y, radius: s.core, ...rgb, alpha: 1 },
    end:   { x, y, radius: s.coreGrow, alpha: 0 },
    lifeSpan: s.coreLife,
  }));
  // A few coloured sparks flicking outward.
  for ( var i = 0; i < s.n; i++ ) {
    var a = (i / s.n) * Math.PI * 2 + Math.random() * 0.8;
    var d = s.spread * (0.5 + Math.random() * 0.7);
    parts.push(new Particle(null, {
      start: { x, y, radius: s.sparkR, ...rgb, alpha: 1 },
      end:   { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, radius: 0.5, alpha: 0 },
      lifeSpan: s.sparkLife * (0.7 + Math.random() * 0.6),
    }));
  }
  return parts;
}
// The explosive (red gem) blast. Reads as a real FIRE explosion — a hot
// yellow-orange core, an orange fireball bursting out, red-orange embers spraying
// to the rim, and lingering smoky glow. Deliberately NOT white (and not flat red):
// `color` is ignored — explosions are fire regardless of the shot's tint.
export function aoeBlast(x, y, radius = 90, color = "yellow") {
  var HOT   = { r: 255, g: 232, b: 150 };   // yellow-hot core (not white)
  var FIRE  = { r: 255, g: 140, b: 40  };   // orange fireball body
  var EMBER = { r: 255, g: 80,  b: 25  };   // red-orange sparks
  var parts = [];

  // Core flash — a hot yellow-orange burst snapping outward, cooling to orange.
  for ( var i = 0; i < 4; i++ ) {
    parts.push(new Particle(null, {
      start: { x, y, radius: 12, ...HOT, alpha: 1 },
      end:   { x, y, radius: radius * 0.85, ...FIRE, alpha: 0 },
      lifeSpan: 0.22,
    }));
  }
  // Fireball body — orange puffs billowing a short way out, cooling to ember.
  for ( var i = 0; i < 10; i++ ) {
    var a = Math.random() * Math.PI * 2, d = Math.random() * radius * 0.5;
    parts.push(new Particle(null, {
      start: { x, y, radius: 16, ...FIRE, alpha: 0.95 },
      end:   { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, radius: 6, ...EMBER, alpha: 0 },
      lifeSpan: 0.3 + Math.random() * 0.15,
    }));
  }
  // Shockwave embers — sparks spraying to the blast edge, hot → red-orange.
  var n = 18;
  for ( var i = 0; i < n; i++ ) {
    var a = (i / n) * Math.PI * 2 + Math.random() * 0.35;
    parts.push(new Particle(null, {
      start: { x, y, radius: 7, ...HOT, alpha: 1 },
      end:   { x: x + Math.cos(a) * radius, y: y + Math.sin(a) * radius, radius: 2, ...EMBER, alpha: 0 },
      lifeSpan: 0.35 + Math.random() * 0.15,
    }));
  }
  // Lingering smoke — slower, growing, fading from orange to dark.
  for ( var i = 0; i < 8; i++ ) {
    var a = Math.random() * Math.PI * 2, d = Math.random() * radius * 0.6;
    parts.push(new Particle(null, {
      start: { x, y, radius: 14, ...FIRE, alpha: 0.45 },
      end:   { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, radius: 34, r: 90, g: 40, b: 20, alpha: 0 },
      lifeSpan: 0.6 + Math.random() * 0.3,
    }));
  }
  return parts;
}

export function explosion(x, y, options = {}) {
  var particles = [];
  var size = options.size ?? 1;

  for ( var i = 0; i < (options.count ?? 10); i++ ) {
    var rad = Math.random() * Math.PI * 2;
    var dist = Math.random() * 75 * size;
    var g = Math.random() * 150 + 20;
    particles.push(new Particle(null, {
      start: {
        x, y,
        radius:  3 * size,
        r: 255, g,
        alpha: 1,
      },
      end: {
        x: x + Math.cos(rad)*dist*5, y: y + Math.sin(rad)*dist*5,
        alpha: 0,
      },
      lifeSpan: 1,
    }));
    particles.push(new Particle(null, {
      start: {
        x, y,
        radius: Math.random() * 40 + 10,
        r: 255, g: 255, b: 255,
        alpha: 0.2,
      },
      end: {
        x: x + Math.cos(rad)*dist, y: y + Math.sin(rad)*dist,
        alpha: 0,
      },
      lifeSpan: options.smokeLife ?? 1,
    }));
    particles.push(new Particle(null, {
      start: {
        x, y,
        radius: (Math.random() * 40 + 10) * size,
        r: 255, g, b: 0,
        alpha: 1,
      },
      end: {
        x: x + Math.cos(rad)*dist, y: y + Math.sin(rad)*dist,
        alpha: 0,
        g: 150, b: 150,
      },
      lifeSpan: 0.5,
    }));
  }

  return particles;
}