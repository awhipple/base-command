// Hand-rolled procedural player turret — drawn fresh each frame on the canvas
// (same technique as Game.js#generateEnergyCellIcon), so the gun's APERTURE can
// morph with the equipped weapon and animate (muzzle flash, reactor pulse).
//
// Shape language: a FIXED armored hull (doesn't rotate) + a ROTATING gun. Each
// weapon loads a visibly DIFFERENT themed aperture (only the equipped weapon's
// barrels draw, so the silhouette changes with your loadout), with muzzles where
// shots actually spawn in Item.shoot:
//   • laser   — a Tesla emitter: coil-banded CENTER barrel + a focusing lens
//               flanked by electrode prongs that crackle with arcs (no recoil)
//   • ball    — a heavy machined siege cannon: milled divots + reinforcement
//               bands + muzzle brake over a dark bore; big recoil kick per shot
//   • stinger — twin machine-gun SIDE barrels at ±TURRET.side() sharing a solid
//               breech block they recoil back into (alternating) like an autocannon
//   • basic   — one modest, dim center barrel (no gem)
//
// COLOUR comes from the EFFECT gem, NOT the weapon type: the weapon type is the
// SHAPE, the effect is the COLOUR. With no effect gem everything glows white
// ("uncharged"); a yellow/red/blue effect tints the lens, ball orb, stinger
// tips, reactor core and muzzle flash to match the shot it fires.
//
// GEOMETRY is shared with the firing code via TURRET below, so the drawn muzzle
// is exactly where the projectile spawns at any scale (player = 1, helper =
// Helper.TURRET_SCALE). drawTurret() is stateless — Base/Helper pass position,
// aim, weapon shape, effect colour, scale, an optional tint (helpers = cyan
// minis), and a decaying muzzle `flash`.

// Single source of truth for the turret's firing geometry, by scale. Base and
// Helper compute their firePos + stinger spread from these so shots leave the
// drawn barrels; drawTurret() draws the muzzles at the same points.
export const TURRET = {
  reach: (scale = 1) => 120 * scale,   // muzzle distance from the hull centre
  side:  (scale = 1) => 13 * scale,    // stinger lateral offset (each side)
};

// Aperture palette keyed by the EFFECT colour (white = no effect):
// {glow}=body/beam tone, {hot}=white-hot centre, {deep}=shadowed bore.
const COLOR_AP = {
  white:  { glow: "#cdd9e8", hot: "#ffffff", deep: "#5b6a7e" },
  yellow: { glow: "#ffd24a", hot: "#fff6d2", deep: "#8a6406" },
  red:    { glow: "#ff5a3c", hot: "#ffe0d2", deep: "#7a2412" },
  blue:   { glow: "#4f9bff", hot: "#dbe9ff", deep: "#143a7a" },
};

// Brushed-metal hull tones (lit from top-left). Helpers lerp these toward their
// tint so they read as the same machine in team colour.
const METAL = { hi: "#8aa0c0", light: "#5b6a82", mid: "#39455c", dark: "#1c2433", black: "#0e1320" };
const HULL_R = 66;   // hull radius at scale 1 (bigger body -> shorter-looking barrel)

// Map an equipped Item -> aperture SHAPE key. Colour is the source of truth
// (blue = stinger, yellow = laser, red = ball); the projectile flags are a
// fallback for the no-colour basic shot.
export function weaponTypeOf(item) {
  if ( !item ) return "basic";
  var c = item.color;
  if ( c === "yellow" || item.projectile?.laser ) return "laser";
  if ( c === "blue"   || item.projectile?.alternate ) return "stinger";
  if ( c === "red" ) return "ball";
  return "basic";
}

// The COLOUR an effect gem (in the effect slot) paints the turret + its shots.
// No effect gem -> "white" (uncharged).
export function effectColorOf(gem) {
  return gem?.color ?? "white";
}

// "#rrggbb" -> "rgba(r,g,b,a)" so we can layer translucent glows.
function rgba(hex, a) {
  var h = hex.replace("#", "");
  if ( h.length === 3 ) h = h.split("").map(x => x + x).join("");
  var n = parseInt(h, 16);
  return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
}

// Blend two hex colours (t=0 -> a, t=1 -> b). Washes hull metal toward a tint.
function lerpHex(a, b, t) {
  var pa = parseInt(a.replace("#", ""), 16), pb = parseInt(b.replace("#", ""), 16);
  var r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  var g = Math.round(((pa >> 8) & 255)  * (1 - t) + ((pb >> 8) & 255)  * t);
  var bl = Math.round((pa & 255)        * (1 - t) + (pb & 255)         * t);
  return "rgb(" + r + "," + g + "," + bl + ")";
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawTurret(ctx, o) {
  var x = o.x, y = o.y, aim = o.aim;
  var scale = o.scale ?? 1;
  var reach = o.reach ?? TURRET.reach(scale);   // muzzle distance = shot spawn distance
  var sideOff = TURRET.side(scale);             // stinger barrel offset = shot offset
  var weapon = o.weapon || "basic";
  var ap = COLOR_AP[o.effectColor] || COLOR_AP.white;
  var flash = o.flash ?? 0;
  var flashSide = o.flashSide ?? 0;
  var phase = o.phase ?? 0;
  var charge = o.charge ?? 0;                    // 0..1 laser pre-fire arc charge
  var tint = o.tint || null;

  // Metal palette, optionally washed toward the helper tint.
  var m = tint
    ? { hi: lerpHex(METAL.hi, tint, 0.35), light: lerpHex(METAL.light, tint, 0.4),
        mid: lerpHex(METAL.mid, tint, 0.4), dark: lerpHex(METAL.dark, tint, 0.3), black: METAL.black }
    : METAL;

  ctx.save();
  ctx.translate(x, y);

  drawHull(ctx, scale, m, ap, phase);

  ctx.save();
  ctx.rotate(aim);                              // local +x axis = aim direction
  drawGun(ctx, scale, reach, sideOff, weapon, ap, m, flash, flashSide, phase, charge);
  ctx.restore();

  ctx.restore();
}

// The fixed armored mount the gun sits on. Bottom half sits offscreen (the base
// is anchored at the bottom edge), so detail concentrates on the top dome.
function drawHull(ctx, scale, m, ap, phase) {
  var R = HULL_R * scale;

  // Soft ground shadow.
  ctx.fillStyle = rgba("#000000", 0.35);
  ctx.beginPath();
  ctx.ellipse(0, R * 0.18, R * 1.05, R * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Armored body — radial metal, lit top-left.
  var body = ctx.createRadialGradient(-R * 0.32, -R * 0.4, R * 0.12, 0, 0, R);
  body.addColorStop(0, m.light);
  body.addColorStop(0.6, m.mid);
  body.addColorStop(1, m.dark);
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();

  // Radial panel seams.
  ctx.strokeStyle = rgba("#0b0f18", 0.5);
  ctx.lineWidth = 1.5 * scale;
  for ( var p = 0; p < 6; p++ ) {
    var pa = -Math.PI / 2 + p * (Math.PI * 2 / 6);
    ctx.beginPath();
    ctx.moveTo(Math.cos(pa) * R * 0.45, Math.sin(pa) * R * 0.45);
    ctx.lineTo(Math.cos(pa) * R * 0.97, Math.sin(pa) * R * 0.97);
    ctx.stroke();
  }

  // Heavy rim + a bright highlight along the top edge.
  ctx.lineWidth = 3 * scale; ctx.strokeStyle = m.black;
  ctx.beginPath(); ctx.arc(0, 0, R - scale, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2 * scale; ctx.strokeStyle = rgba(m.hi, 0.7);
  ctx.beginPath(); ctx.arc(0, 0, R - 2 * scale, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();

  // Hull bolts.
  for ( var b = 0; b < 8; b++ ) {
    var ba = -Math.PI / 2 + b * (Math.PI * 2 / 8);
    var bx = Math.cos(ba) * R * 0.8, by = Math.sin(ba) * R * 0.8;
    ctx.fillStyle = m.dark;
    ctx.beginPath(); ctx.arc(bx, by, 3 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgba(m.hi, 0.8);
    ctx.beginPath(); ctx.arc(bx - 0.6 * scale, by - 0.6 * scale, 1.4 * scale, 0, Math.PI * 2); ctx.fill();
  }

  // Inner collar the gun rotates within.
  var collar = ctx.createRadialGradient(0, 0, R * 0.1, 0, 0, R * 0.52);
  collar.addColorStop(0, m.black);
  collar.addColorStop(1, m.dark);
  ctx.fillStyle = collar;
  ctx.beginPath(); ctx.arc(0, 0, R * 0.52, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 1.5 * scale; ctx.strokeStyle = m.black;
  ctx.beginPath(); ctx.arc(0, 0, R * 0.52, 0, Math.PI * 2); ctx.stroke();

  // Reactor core — glows the equipped EFFECT colour (white = none), gently
  // pulsing, so the element loaded reads even from the hull alone.
  var pulse = 0.7 + 0.3 * Math.sin(phase * 3);
  var coreR = R * 0.34;
  var core = ctx.createRadialGradient(0, 0, coreR * 0.12, 0, 0, coreR);
  core.addColorStop(0, rgba(ap.hot, 0.95 * pulse));
  core.addColorStop(0.5, rgba(ap.glow, 0.8 * pulse));
  core.addColorStop(1, rgba(ap.glow, 0));
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(0, 0, coreR, 0, Math.PI * 2); ctx.fill();
}

// The rotating gun. Each weapon loads a visibly DIFFERENT aperture onto the
// mount — only the equipped weapon's barrels are drawn (so the silhouette
// changes with your loadout), themed to its role and tinted by the effect
// colour. Then a common mantlet hub covers the barrel roots.
function drawGun(ctx, scale, reach, sideOff, weapon, ap, m, flash, flashSide, phase, charge) {
  if ( weapon === "laser" )        drawLaserGun(ctx, scale, reach, ap, m, flash, phase, charge);
  else if ( weapon === "ball" )    drawBallGun(ctx, scale, reach, ap, m, flash, phase);
  else if ( weapon === "stinger" ) drawStingerGun(ctx, scale, reach, sideOff, ap, m, flash, flashSide, phase);
  else                             drawBasicGun(ctx, scale, reach, ap, m, flash, phase);
  drawHub(ctx, scale, ap, m);
}

// LASER — a Tesla emitter. A coil-wrapped barrel ends in a focusing lens flanked
// by two electrode prongs; arcs crackle across the fork. The crackle CHARGES UP
// over the gun's pre-fire wind-up (`charge` 0..1) and discharges into the shot,
// so it fires once per shot at the weapon's actual rate. No recoil — it's a beam.
function drawLaserGun(ctx, scale, reach, ap, m, flash, phase, charge) {
  var root = 16 * scale, lw = 6 * scale, tip = reach - 10 * scale;
  metalBarrel(ctx, root, tip, 0, lw, m);

  // Coil bands wrapped around the barrel (rings), faintly energised.
  for ( var i = 0; i < 4; i++ ) {
    var bx = root + (tip - root) * (0.22 + i * 0.2);
    ctx.lineWidth = 2.2 * scale; ctx.strokeStyle = rgba(ap.glow, 0.45);
    ctx.beginPath(); ctx.ellipse(bx, 0, 2 * scale, lw + 2 * scale, 0, 0, Math.PI * 2); ctx.stroke();
  }
  // Charge running up the bore.
  var pulse = 0.6 + 0.4 * Math.sin(phase * 5);
  ctx.strokeStyle = rgba(ap.glow, 0.55 * pulse); ctx.lineWidth = 2 * scale; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(root + 4 * scale, 0); ctx.lineTo(tip, 0); ctx.stroke();

  // Two electrode prongs (a tuning fork) reaching past the lens, ball-topped.
  var pBase = tip, pTip = reach + 6 * scale, spread = 11 * scale;
  [-1, 1].forEach(function (s) {
    ctx.strokeStyle = m.light; ctx.lineWidth = 3 * scale; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pBase, s * lw * 0.5);
    ctx.lineTo(pBase + 6 * scale, s * spread);
    ctx.lineTo(pTip, s * spread);
    ctx.stroke();
    ctx.fillStyle = m.hi;
    ctx.beginPath(); ctx.arc(pTip, s * spread, 2.6 * scale, 0, Math.PI * 2); ctx.fill();
    glowDot(ctx, pTip, s * spread, 4.5 * scale, ap, 0.9);
  });

  // Focusing lens: concentric rings + hot core.
  var lensX = reach - 4 * scale;
  [12, 8.5].forEach(function (rr, i) {
    ctx.lineWidth = (i === 0 ? 2.5 : 1.5) * scale;
    ctx.strokeStyle = i === 0 ? m.hi : rgba(ap.glow, 0.9);
    ctx.beginPath(); ctx.arc(lensX, 0, rr * scale, 0, Math.PI * 2); ctx.stroke();
  });
  glowDot(ctx, lensX, 0, 7 * scale, ap, 0.95 * pulse);

  // Tesla arcs across the prong mouth. `charge` (0..1) ramps over the gun's
  // pre-fire wind-up and discharges into the muzzle flash, so the crackle
  // builds right before each shot AT THE WEAPON'S FIRE RATE (faster gems zap
  // more often) instead of on a free-running timer. A faint idle shimmer keeps
  // the emitter alive between shots.
  var flick = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(phase * 26));    // rapid electric flicker
  var shimmer = Math.sin(phase * 9) > 0.6 ? 0.18 : 0.05;          // faint idle life
  var inten = Math.max(flash, shimmer, charge * flick);
  if ( inten > 0.08 ) {
    teslaArc(ctx, pTip, -spread, pTip, spread, ap, scale, inten, phase * 17);
    teslaArc(ctx, lensX, 0, pTip, (charge > 0.25 || flash > 0.1 ? 1 : -1) * spread, ap, scale, inten * 0.8, phase * 13 + 2);
  }
  if ( flash > 0.02 ) muzzleFlash(ctx, lensX, 0, 15 * scale, ap, flash);
}

// BALL — a heavy machined siege cannon. Wide barrel milled with longitudinal
// divots + reinforcement bands, a muzzle brake around a dark bore holding a
// charging round. Recoils hard on each shot.
function drawBallGun(ctx, scale, reach, ap, m, flash, phase) {
  var recoil = flash * 11 * scale;               // heavy kick straight back
  var root = 16 * scale - recoil, bw = 14 * scale;
  var muzzle = reach - 4 * scale - recoil;

  metalBarrel(ctx, root, muzzle, 0, bw, m);

  // Milled longitudinal divots: a dark recessed channel with a lit upper edge.
  [-1, 0, 1].forEach(function (g) {
    var gy = g * bw * 0.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = rgba("#05080f", 0.7); ctx.lineWidth = 3 * scale;
    ctx.beginPath(); ctx.moveTo(root + 7 * scale, gy); ctx.lineTo(muzzle - 8 * scale, gy); ctx.stroke();
    ctx.strokeStyle = rgba(m.hi, 0.4); ctx.lineWidth = 1 * scale;
    ctx.beginPath(); ctx.moveTo(root + 7 * scale, gy - 1.6 * scale); ctx.lineTo(muzzle - 8 * scale, gy - 1.6 * scale); ctx.stroke();
  });
  // Reinforcement bands (raised rings crossing the barrel).
  [0.32, 0.6].forEach(function (f) {
    var bx = root + (muzzle - root) * f;
    ctx.fillStyle = m.mid;
    roundRect(ctx, bx - 3 * scale, -(bw + 2 * scale), 6 * scale, (bw + 2 * scale) * 2, 2 * scale); ctx.fill();
    ctx.lineWidth = 1 * scale; ctx.strokeStyle = m.black; ctx.stroke();
  });

  // Muzzle brake ring + dark bore + charging round.
  ctx.fillStyle = m.dark;
  ctx.beginPath(); ctx.arc(muzzle, 0, bw * 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 3 * scale; ctx.strokeStyle = m.hi;
  ctx.beginPath(); ctx.arc(muzzle, 0, bw * 1.2, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = m.black;
  ctx.beginPath(); ctx.arc(muzzle, 0, bw * 0.72, 0, Math.PI * 2); ctx.fill();
  var charge = 0.55 + 0.45 * Math.sin(phase * 4);
  glowDot(ctx, muzzle, 0, bw * 0.7 * charge + 3 * scale, ap, 0.85 * charge);

  if ( flash > 0.02 ) muzzleFlash(ctx, muzzle, 0, 19 * scale, ap, flash);
}

// STINGER — twin machine-gun barrels at ±sideOff that share a solid rectangular
// BREECH BLOCK (distinct from the round hub): it turns with the gun and stays put
// while each barrel recoils back INTO it (they alternate), like an autocannon.
// Reads as one sturdy receiver instead of two thin barrels off the centrepiece.
function drawStingerGun(ctx, scale, reach, sideOff, ap, m, flash, flashSide, phase) {
  var hw = 5 * scale;                                 // a touch beefier than before
  var blkBack = 6 * scale, blkFront = 52 * scale;     // breech block extent (fixed)
  var recoilOf = function (s) { return (s === flashSide ? flash : 0) * 11 * scale; };

  // 1) Barrels (each recoils independently). Drawn first so the block covers
  //    their rear ends — as a barrel recoils, its exposed length slides into it.
  [-1, 1].forEach(function (s) {
    var recoil = recoilOf(s), firing = (s === flashSide);
    var root = 12 * scale - recoil, muzzle = reach * 0.98 - recoil;
    metalBarrel(ctx, root, muzzle, s * sideOff, hw, m);
    // Barrel detailing FIXED to the barrel (root-relative) so it rides with the
    // recoil: a dark base collar near the rear that slides back UNDER the breech
    // block as the barrel retracts (and re-emerges as it returns), plus two
    // cooling vents ahead of it. The block (drawn next) covers whatever slides in.
    [ { off: 46, w: 4 }, { off: 70, w: 2.8 }, { off: 92, w: 2.8 } ].forEach(function (nz) {
      var nx = root + nz.off * scale;
      ctx.fillStyle = rgba("#05080f", 0.82);
      roundRect(ctx, nx - nz.w / 2 * scale, s * sideOff - hw * 0.6, nz.w * scale, hw * 1.2, 1 * scale); ctx.fill();
    });
    // Muzzle ring + tip glow (brighter on the firing barrel).
    ctx.fillStyle = m.dark;
    ctx.beginPath(); ctx.arc(muzzle, s * sideOff, hw * 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1.5 * scale; ctx.strokeStyle = m.hi;
    ctx.beginPath(); ctx.arc(muzzle, s * sideOff, hw * 1.1, 0, Math.PI * 2); ctx.stroke();
    glowDot(ctx, muzzle, s * sideOff, hw * 1.4, ap, firing ? 1 : 0.55);
  });

  // 2) The shared breech block both barrels slide into (drawn over their roots).
  var halfH = sideOff + hw + 5 * scale;
  var g = ctx.createLinearGradient(0, -halfH, 0, halfH);
  g.addColorStop(0, m.hi); g.addColorStop(0.45, m.light); g.addColorStop(0.55, m.mid); g.addColorStop(1, m.dark);
  ctx.fillStyle = g;
  roundRect(ctx, blkBack, -halfH, blkFront - blkBack, halfH * 2, 5 * scale); ctx.fill();
  ctx.lineWidth = 2 * scale; ctx.strokeStyle = m.black; ctx.stroke();
  // Front-face seam + corner rivets. (No fixed barrel ports — the barrels slide
  // under the block's front edge, each with its own base collar moving in/out.)
  ctx.strokeStyle = rgba("#05080f", 0.45); ctx.lineWidth = 1.5 * scale;
  ctx.beginPath(); ctx.moveTo(blkFront - 7 * scale, -halfH + 5 * scale); ctx.lineTo(blkFront - 7 * scale, halfH - 5 * scale); ctx.stroke();
  [-1, 1].forEach(function (s) {
    ctx.fillStyle = rgba(m.hi, 0.7);
    ctx.beginPath(); ctx.arc(blkBack + 6 * scale, s * (halfH - 5 * scale), 1.6 * scale, 0, Math.PI * 2); ctx.fill();
  });

  // 3) Muzzle flash on the firing barrel (on top of everything).
  if ( flash > 0.02 && flashSide !== 0 ) {
    muzzleFlash(ctx, reach * 0.98 - recoilOf(flashSide), flashSide * sideOff, 9 * scale, ap, flash);
  }
}

// BASIC — a single plain barrel (no gem loaded). Dim, uncharged.
function drawBasicGun(ctx, scale, reach, ap, m, flash, phase) {
  var root = 16 * scale, lw = 5.5 * scale, muzzle = reach - 3 * scale;
  metalBarrel(ctx, root, muzzle, 0, lw, m);
  glowDot(ctx, muzzle, 0, 4 * scale, ap, 0.5);
  if ( flash > 0.02 ) muzzleFlash(ctx, muzzle, 0, 11 * scale, ap, flash);
}

// The mantlet hub over the barrel roots (drawn last so barrels emerge from under
// it / recoil back into it), with an EFFECT-colour status light.
function drawHub(ctx, scale, ap, m) {
  var hubR = 22 * scale;
  var hub = ctx.createRadialGradient(-hubR * 0.3, -hubR * 0.3, hubR * 0.1, 0, 0, hubR);
  hub.addColorStop(0, m.light);
  hub.addColorStop(0.7, m.mid);
  hub.addColorStop(1, m.dark);
  ctx.fillStyle = hub;
  ctx.beginPath(); ctx.arc(0, 0, hubR, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 2 * scale; ctx.strokeStyle = m.black;
  ctx.beginPath(); ctx.arc(0, 0, hubR, 0, Math.PI * 2); ctx.stroke();
  glowDot(ctx, hubR * 0.5, 0, 3 * scale, ap, 0.9);
}

// A jagged electric arc between two points (Tesla crackle). Deterministic wiggle
// driven by `seed` so it animates without per-frame randomness.
function teslaArc(ctx, x1, y1, x2, y2, ap, scale, intensity, seed) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = rgba(ap.hot, 0.85 * intensity);
  ctx.lineWidth = 1.3 * scale; ctx.lineCap = "round";
  var nx = -(y2 - y1), ny = (x2 - x1), nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
  ctx.beginPath(); ctx.moveTo(x1, y1);
  for ( var i = 1; i < 4; i++ ) {
    var t = i / 4, jx = x1 + (x2 - x1) * t, jy = y1 + (y2 - y1) * t;
    var off = Math.sin(seed + i * 2.3) * 3.2 * scale * (i % 2 ? 1 : -1);
    ctx.lineTo(jx + nx * off, jy + ny * off);
  }
  ctx.lineTo(x2, y2); ctx.stroke();
  ctx.restore();
}

// A shaded metal tube from x0..x1 centred on y=cy, half-width hw.
function metalBarrel(ctx, x0, x1, cy, hw, m) {
  var g = ctx.createLinearGradient(0, cy - hw, 0, cy + hw);
  g.addColorStop(0, m.dark);
  g.addColorStop(0.22, m.mid);
  g.addColorStop(0.45, m.hi);
  g.addColorStop(0.62, m.light);
  g.addColorStop(1, m.dark);
  ctx.fillStyle = g;
  roundRect(ctx, x0, cy - hw, x1 - x0, hw * 2, hw * 0.7);
  ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = rgba("#0b0f18", 0.6);
  ctx.stroke();
}

// A soft coloured glow disc (additive) — lens cores, charge orbs, status lights.
function glowDot(ctx, x, y, r, ap, a) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  var g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
  g.addColorStop(0, rgba(ap.hot, a));
  g.addColorStop(0.5, rgba(ap.glow, a * 0.8));
  g.addColorStop(1, rgba(ap.glow, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// A bright firing burst at a muzzle, intensity = flash (0..1, decays in update).
function muzzleFlash(ctx, x, y, r, ap, flash) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  var rr = r * (0.8 + 0.9 * flash);
  var g = ctx.createRadialGradient(x, y, 0, x, y, rr);
  g.addColorStop(0, rgba(ap.hot, flash));
  g.addColorStop(0.4, rgba(ap.glow, flash * 0.7));
  g.addColorStop(1, rgba(ap.glow, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = rgba(ap.hot, flash * 0.8);
  ctx.lineWidth = 2;
  [0, 1, 2, 3].forEach(function (i) {
    var a = i * Math.PI / 2 + 0.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * rr * 1.3, y + Math.sin(a) * rr * 1.3);
    ctx.stroke();
  });
  ctx.restore();
}
