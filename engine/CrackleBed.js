// A synthesized "smouldering fire" sound: a low filtered-noise bed plus sparse
// random crackle pops. Self-contained WebAudio (independent of AudioLibrary) so
// we can shape the texture. start()/stop() are idempotent; it suspends itself
// when the tab is hidden so it never plays in the background.
export default class CrackleBed {
  constructor() {
    this.ctx = null;
    this.playing = false;
    this._timer = null;
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

    // Master gain (ramped on start/stop). Everything is kept deliberately quiet.
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);

    // Smouldering bed: looping brown noise through a low-pass = soft rumble/hiss.
    this.bed = this.ctx.createBufferSource();
    this.bed.buffer = this._noiseBuffer(2, true);
    this.bed.loop = true;
    var lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 440;
    lp.Q.value = 0.6;
    var bedGain = this.ctx.createGain();
    bedGain.gain.value = 0.22;
    this.bed.connect(lp);
    lp.connect(bedGain);
    bedGain.connect(this.master);
    this.bed.start();

    // Suspend when hidden so it can't keep playing in the background.
    document.addEventListener("visibilitychange", () => {
      if ( !this.ctx ) return;
      if ( document.hidden ) {
        this.ctx.suspend();
      } else if ( this.playing ) {
        this.ctx.resume();
      }
    });
    return true;
  }

  // Brown noise stays low/rumbly; white noise (brown=false) is brighter, used for pops.
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

  // One crackle: a brief band-passed noise burst with a fast decay envelope.
  _pop() {
    var t = this.ctx.currentTime;
    var src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.06, false);
    var bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 700 + Math.random() * 1700;   // lower/softer (less bright)
    bp.Q.value = 5 + Math.random() * 6;
    var g = this.ctx.createGain();
    var peak = 0.02 + Math.random() * 0.05;             // muted pops
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.05);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 0.14);
  }

  start() {
    if ( !this._ensure() ) return;
    if ( this.ctx.state === "suspended" ) this.ctx.resume();
    if ( this.playing ) return;
    this.playing = true;
    var t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0.6, t + 0.1);   // overall low; bed/pop gains are the real volume
    this._schedule();
  }

  _schedule() {
    if ( !this.playing ) return;
    this._pop();
    this._timer = setTimeout(() => this._schedule(), 35 + Math.random() * 130);
  }

  stop() {
    if ( !this.playing ) return;
    this.playing = false;
    clearTimeout(this._timer);
    this._timer = null;
    if ( this.ctx ) {
      var t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(0, t + 0.18);   // gentle fade out
    }
  }
}
