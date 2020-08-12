import Particle from "../../engine/gfx/shapes/Particle.js";

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