// A synthesized "enemy pop" — replaces the old spark.ogg sample, which read as
// loud / harsh / interrupty when deaths overlapped. Self-contained WebAudio
// (same approach as CrackleBed) so we can shape it by ear. It's a short, soft
// two-layer hit: a downward "bloop" tone for the body + a tiny lowpassed-noise
// "poof" for debris, with a touch of per-play pitch jitter so a wave of kills
// doesn't sound mechanical (the identical repeated sample was the main offender).
//
// play(volume) takes an already-master-scaled 0..1 volume (AudioLibrary folds in
// the SFX slider before calling). One-shot; overlaps are free in WebAudio.
export default class DeathSound {
  constructor() {
    this.ctx = null;
  }

  _ensure() {
    if ( this.ctx ) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if ( !AC ) return false;
    try {
      this.ctx = new AC();
    } catch ( e ) {
      return false;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(this.ctx.destination);
    return true;
  }

  // brown=true integrates the noise → far more low-end energy (a deep rumble)
  // vs. flat white noise (a bright hiss).
  _noiseBuffer(seconds, brown) {
    var n = Math.floor(this.ctx.sampleRate * seconds);
    var buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    var d = buf.getChannelData(0);
    var last = 0;
    for ( var i = 0; i < n; i++ ) {
      var w = Math.random() * 2 - 1;
      if ( brown ) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.2;
      } else {
        d[i] = w;
      }
    }
    return buf;
  }

  play(volume = 1) {
    if ( volume <= 0 || !this._ensure() ) return;
    if ( this.ctx.state === "suspended" ) this.ctx.resume();

    var ctx = this.ctx, t = ctx.currentTime;
    // ±15% pitch jitter per death so repeats don't sound like one stuttering sample.
    var p = 1 + (Math.random() * 0.3 - 0.15);

    // Body: a deep downward "boom" (sine). Kept low and dropped fast so it lands
    // as sub-thump weight, NOT an audible pitched note (that ring was the
    // "trash-can bonk"). Lower gain than before so the rumble leads, not the tone.
    var osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(130 * p, t);
    osc.frequency.exponentialRampToValueAtTime(28 * p, t + 0.35);
    var og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.linearRampToValueAtTime(0.45 * volume, t + 0.012);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    osc.connect(og);
    og.connect(this.master);
    osc.start(t);
    osc.stop(t + 1.25);

    // Blast: BROWN noise (deep rumble, not bright hiss) through a low lowpass —
    // a short bright crack on the attack settling into a long, deep rolling
    // rumble tail. This is the body of the "explosion" now.
    var noise = ctx.createBufferSource();
    noise.buffer = this._noiseBuffer(1.6, true);
    var lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(2600 * p, t);
    lp.frequency.exponentialRampToValueAtTime(110, t + 0.9);
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.linearRampToValueAtTime(0.6 * volume, t + 0.01);      // crack
    ng.gain.exponentialRampToValueAtTime(0.18 * volume, t + 0.3);  // settle...
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);         // ...into a long deep rumble
    noise.connect(lp);
    lp.connect(ng);
    ng.connect(this.master);
    noise.start(t);
    noise.stop(t + 1.6);
  }
}
