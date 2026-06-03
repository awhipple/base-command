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
export function aoeBlast(x, y, radius = 90, color = "yellow") {
  var rgb = BLAST_RGB[color] ?? BLAST_RGB.yellow;
  var parts = [];

  // Core flash — a few big white particles snapping outward then gone.
  for ( var i = 0; i < 4; i++ ) {
    parts.push(new Particle(null, {
      start: { x, y, radius: 12, r: 255, g: 255, b: 255, alpha: 1 },
      end:   { x, y, radius: radius * 0.9, alpha: 0 },
      lifeSpan: 0.22,
    }));
  }
  // Shockwave ring — coloured sparks spraying to the blast edge.
  var n = 18;
  for ( var i = 0; i < n; i++ ) {
    var a = (i / n) * Math.PI * 2 + Math.random() * 0.35;
    parts.push(new Particle(null, {
      start: { x, y, radius: 8, ...rgb, alpha: 1 },
      end:   { x: x + Math.cos(a) * radius, y: y + Math.sin(a) * radius, radius: 2, alpha: 0 },
      lifeSpan: 0.35 + Math.random() * 0.15,
    }));
  }
  // Lingering glow — slower, growing, fading smoke in the blast colour.
  for ( var i = 0; i < 8; i++ ) {
    var a = Math.random() * Math.PI * 2, d = Math.random() * radius * 0.6;
    parts.push(new Particle(null, {
      start: { x, y, radius: 14, ...rgb, alpha: 0.5 },
      end:   { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, radius: 34, alpha: 0 },
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