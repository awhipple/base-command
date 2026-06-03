export function roundedRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// A translucent "glass" panel: a tinted pane you can see the starfield through,
// sold as glass by a soft upper-left specular bloom, two static diagonal sheen
// streaks (light glancing off the surface), and a lit top/edge rim. Drawn on the
// MAIN ctx behind a window's contents. `opts`:
//   tint   — body colour+alpha (lower alpha = more starfield shows through)
//   radius — corner rounding (0 = square, for full-screen panels)
//   sheen  — peak alpha of the diagonal glare streaks
//   rim    — alpha of the bright top edge
export function drawGlass(ctx, x, y, w, h, opts = {}) {
  var tint   = opts.tint   ?? "rgba(12,17,34,0.58)";
  var radius = opts.radius ?? 0;
  var sheen  = opts.sheen  ?? 0.10;
  var rim    = opts.rim    ?? 0.22;

  ctx.save();
  if ( radius > 0 ) roundedRectPath(ctx, x, y, w, h, radius);
  else { ctx.beginPath(); ctx.rect(x, y, w, h); }
  ctx.clip();

  // Body tint — the glass itself (starfield reads through it).
  ctx.fillStyle = tint;
  ctx.fillRect(x, y, w, h);

  // Vertical depth: a touch of cool light up top, shadow pooling at the bottom.
  var vg = ctx.createLinearGradient(0, y, 0, y + h);
  vg.addColorStop(0,   "rgba(70,92,150,0.16)");
  vg.addColorStop(0.4, "rgba(0,0,0,0)");
  vg.addColorStop(1,   "rgba(0,0,0,0.30)");
  ctx.fillStyle = vg;
  ctx.fillRect(x, y, w, h);

  // Everything below is light ADDED to the surface — reflections, not paint.
  ctx.globalCompositeOperation = "lighter";

  // Soft specular bloom in the upper-left, like a window lighting the pane.
  var bloom = ctx.createRadialGradient(
    x + w * 0.24, y + h * 0.10, 0,
    x + w * 0.24, y + h * 0.10, Math.max(w, h) * 0.55);
  bloom.addColorStop(0, "rgba(150,185,255,0.10)");
  bloom.addColorStop(1, "rgba(150,185,255,0)");
  ctx.fillStyle = bloom;
  ctx.fillRect(x, y, w, h);

  // Two static diagonal sheen streaks sweeping across the glass.
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(-0.42);
  var span = (w + h) * 1.4;
  var band = (cx, bw, a) => {
    var lg = ctx.createLinearGradient(cx - bw, 0, cx + bw, 0);
    lg.addColorStop(0,   "rgba(255,255,255,0)");
    lg.addColorStop(0.5, "rgba(210,230,255," + a + ")");
    lg.addColorStop(1,   "rgba(255,255,255,0)");
    ctx.fillStyle = lg;
    ctx.fillRect(cx - bw, -span / 2, bw * 2, span);
  };
  band(-w * 0.20, w * 0.085, sheen);
  band( w * 0.02, w * 0.040, sheen * 0.6);

  ctx.restore();   // drops clip, transform, and the "lighter" mode

  // Lit rim — faint all the way round, brighter along the top edge.
  ctx.save();
  ctx.lineWidth = 1;
  if ( radius > 0 ) roundedRectPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, radius);
  else { ctx.beginPath(); ctx.rect(x + 0.5, y + 0.5, w - 1, h - 1); }
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + Math.max(radius, 1), y + 1);
  ctx.lineTo(x + w - Math.max(radius, 1), y + 1);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(200,225,255," + rim + ")";
  ctx.stroke();
  ctx.restore();
}

// A vertical brushed-metal bar centred on `cx`, full height [top, top+h]. Used
// to cap the seam where the title and inventory glass panels meet as they slide
// past each other — a chrome "frame edge" with a specular highlight and a few
// domed rivets so it reads as a Space-Age metal rail joining the two screens.
export function drawMetalBar(ctx, cx, top, h, w = 18) {
  var x = cx - w / 2;
  ctx.save();

  // Contact shadow on the glass either side — seats the bar + buries the seam.
  var sh = ctx.createLinearGradient(x - 12, 0, x + w + 12, 0);
  sh.addColorStop(0,   "rgba(0,0,0,0)");
  sh.addColorStop(0.5, "rgba(0,0,0,0.40)");
  sh.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = sh;
  ctx.fillRect(x - 12, top, w + 24, h);

  // Brushed-steel body: a cross-bar gradient that reads as a rounded metal rail.
  var g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0.00, "#21252b");
  g.addColorStop(0.14, "#5c656f");
  g.addColorStop(0.38, "#c2cbd3");
  g.addColorStop(0.50, "#f4f8fb");   // hot specular line
  g.addColorStop(0.60, "#aeb8c1");
  g.addColorStop(0.84, "#525a63");
  g.addColorStop(1.00, "#191c21");
  ctx.fillStyle = g;
  ctx.fillRect(x, top, w, h);

  // Crisp edge lines.
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.30)";
  ctx.beginPath(); ctx.moveTo(x + 1.5, top); ctx.lineTo(x + 1.5, top + h); ctx.stroke();
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath(); ctx.moveTo(x + w - 0.5, top); ctx.lineTo(x + w - 0.5, top + h); ctx.stroke();

  // Domed rivets down the rail.
  var rr = w * 0.30;
  var n = 5;
  for ( var i = 0; i < n; i++ ) {
    var ry = top + h * (i + 0.5) / n;
    var rg = ctx.createRadialGradient(cx - rr * 0.35, ry - rr * 0.35, rr * 0.1, cx, ry, rr);
    rg.addColorStop(0,   "#f1f5f8");
    rg.addColorStop(0.55, "#9aa4ae");
    rg.addColorStop(1,   "#33383f");
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(cx, ry, rr, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath(); ctx.arc(cx, ry, rr, 0, Math.PI * 2); ctx.stroke();
  }

  ctx.restore();
}

// A small padlock glyph centred at (cx, cy), drawn `color`-tinted. `s` is the
// overall icon size (~30 in a slot). Used to mark a locked synth/equip slot;
// `opts.hover` (a matching key is hovering it) brightens the body + adds a glow.
// Shared by the synth machines (blue) and the equipment locks (green).
export function drawLock(ctx, cx, cy, s, color, opts = {}) {
  var hover = opts.hover;
  var bodyW = s * 0.62, bodyH = s * 0.5;
  var bodyX = cx - bodyW / 2, bodyY = cy - bodyH * 0.12;   // body just below centre
  var shR = bodyW * 0.34;                                  // shackle radius
  ctx.save();
  ctx.lineCap = "round";
  // Shackle — top semicircle resting on the body's top edge.
  if ( hover ) { ctx.shadowColor = color; ctx.shadowBlur = 12; }
  ctx.lineWidth = Math.max(2, s * 0.1);
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(cx, bodyY, shR, Math.PI, 2 * Math.PI);
  ctx.stroke();
  ctx.shadowBlur = 0;
  // Body — rounded, vertical gradient to dark.
  roundedRectPath(ctx, bodyX, bodyY, bodyW, bodyH, s * 0.1);
  var g = ctx.createLinearGradient(bodyX, bodyY, bodyX, bodyY + bodyH);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = hover ? "#ffffff" : "rgba(0,0,0,0.55)";
  ctx.stroke();
  // Keyhole.
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.beginPath();
  ctx.arc(cx, bodyY + bodyH * 0.42, s * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(cx - s * 0.028, bodyY + bodyH * 0.42, s * 0.056, bodyH * 0.38);
  ctx.restore();
}
