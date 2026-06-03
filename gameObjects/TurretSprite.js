// Hand-rolled procedural player turret — drawn fresh each frame on the canvas
// (same technique as Game.js#generateEnergyCellIcon), so the gun's APERTURE can
// morph with the equipped weapon and animate (muzzle flash, reactor pulse).
//
// Shape language: a FIXED armored hull (doesn't rotate) + a ROTATING gun
// assembly with three apertures whose positions match where shots actually
// spawn in Item.shoot:
//   • laser   — slim CENTER barrel ending in a focusing lens emitter
//   • ball    — wide CENTER cannon bore with a charging orb (≠ laser)
//   • stinger — two thin SIDE barrels at ±TURRET.side(), flashing side-to-side
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
  drawGun(ctx, scale, reach, sideOff, weapon, ap, m, flash, flashSide, phase);
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

// The rotating gun: barrels along local +x, muzzles at x≈reach. All three
// apertures are always present; the active one lights up and the rest recede.
function drawGun(ctx, scale, reach, sideOff, weapon, ap, m, flash, flashSide, phase) {
  var root = 16 * scale;                         // barrels start just past the collar
  var isStinger = weapon === "stinger";
  var isLaser = weapon === "laser";
  var isBall = weapon === "ball";

  // ── Side barrels (stinger). Lit + extended when stinger is equipped, else
  //    short, dim, recessed. Drawn at ±sideOff to match the shot spawn. ──────
  var sideActive = isStinger ? 1 : 0.32;
  var sideLen = reach * (isStinger ? 0.96 : 0.62);
  [-1, 1].forEach(function (s) {
    ctx.save();
    ctx.globalAlpha = sideActive;
    var hw = 5 * scale;
    metalBarrel(ctx, root, sideLen, s * sideOff, hw, m);
    var mx = sideLen, my = s * sideOff;
    if ( isStinger ) {
      glowDot(ctx, mx, my, hw * 1.5, ap, 0.9);
    } else {
      ctx.fillStyle = m.black;
      ctx.beginPath(); ctx.arc(mx, my, hw * 0.7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  });
  // Stinger muzzle flash on the side that just fired.
  if ( isStinger && flash > 0.02 && flashSide !== 0 ) {
    muzzleFlash(ctx, reach * 0.96, flashSide * sideOff, 9 * scale, ap, flash);
  }

  // ── Center barrel (laser OR ball — same mount, different muzzle). ─────────
  var centerActive = isStinger ? 0.45 : 1;
  ctx.save();
  ctx.globalAlpha = centerActive;
  if ( isBall ) {
    // Heavy cannon: wide bore, charging orb in the mouth.
    var bw = 12 * scale;
    metalBarrel(ctx, root, reach - 4 * scale, 0, bw, m);
    ctx.fillStyle = m.dark;
    ctx.beginPath(); ctx.arc(reach - 4 * scale, 0, bw * 1.15, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2.5 * scale; ctx.strokeStyle = m.hi;
    ctx.beginPath(); ctx.arc(reach - 4 * scale, 0, bw * 1.15, 0, Math.PI * 2); ctx.stroke();
    var charge = 0.6 + 0.4 * Math.sin(phase * 4);
    glowDot(ctx, reach - 4 * scale, 0, bw * (0.7 + 0.15 * charge), ap, 0.9 * charge);
  } else {
    // Slim barrel for laser/basic; laser ends in a focusing lens emitter.
    var lw = isLaser ? 7 * scale : 5.5 * scale;
    metalBarrel(ctx, root, reach - (isLaser ? 8 * scale : 3 * scale), 0, lw, m);
    if ( isLaser ) {
      [13, 9.5].forEach(function (rr, i) {
        ctx.lineWidth = (i === 0 ? 2.5 : 1.5) * scale;
        ctx.strokeStyle = i === 0 ? m.hi : rgba(ap.glow, 0.9);
        ctx.beginPath(); ctx.arc(reach - 6 * scale, 0, rr * scale, 0, Math.PI * 2); ctx.stroke();
      });
      var lpulse = 0.7 + 0.3 * Math.sin(phase * 5);
      ctx.strokeStyle = rgba(ap.glow, 0.5 * lpulse);
      ctx.lineWidth = 2 * scale; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(root + 4 * scale, 0); ctx.lineTo(reach - 8 * scale, 0); ctx.stroke();
      glowDot(ctx, reach - 6 * scale, 0, 6.5 * scale, ap, 0.95 * lpulse);
    } else {
      glowDot(ctx, reach - 3 * scale, 0, 4 * scale, ap, 0.5);
    }
  }
  ctx.restore();

  // Center muzzle flash (laser/ball/basic fire from centre).
  if ( !isStinger && flash > 0.02 ) {
    muzzleFlash(ctx, reach - (isBall ? 4 * scale : 6 * scale), 0, (isBall ? 16 : 13) * scale, ap, flash);
  }

  // ── Mantlet hub covering the barrel roots (drawn last so barrels emerge from
  //    under it), with an EFFECT-colour status light on top. ─────────────────
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
