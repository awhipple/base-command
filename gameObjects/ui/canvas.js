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
