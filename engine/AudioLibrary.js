export default class AudioLibrary {
  sounds = {};
  synths = {};           // name -> fn(volume): procedurally-synthesized one-shots
  musicVolume = 1;       // 0..1 master for the looping music track
  sfxVolume = 1;         // 0..1 master applied to every one-shot sound
  currentMusic = null;   // { name, audio } — the single looping track in play

  constructor(root = "./sounds/") {
    this.root = root;
  }

  // Register a synthesized sound (WebAudio) under a name. play(name) then routes
  // to it instead of loading a file, and folds in the SFX master volume just like
  // a sample — so synth one-shots respect the slider for free.
  registerSynth(name, fn) {
    this.synths[name] = fn;
  }

  get(name) {
    return this.sounds[name] || this._loadSound(name);
  }

  alias(name, original) {
    this.sounds[name] = this.get(original);
  }

  play(name, options = {}) {
    var volume = (options.volume ?? 1) * this.sfxVolume;
    if ( this.synths[name] ) { this.synths[name](volume); return; }
    if ( options.loop ) { this.get(name).play(options); return; }   // legacy loop path
    this.get(name).play({ ...options, volume: volume });
  }

  // ── Music: one looping track at a time, master-volume + crossfades ──────────
  // Switches tracks with a short crossfade; requesting the track already playing
  // just retargets it to the current musicVolume (no restart). A missing file
  // fails silently. Loudness follows musicVolume (0 in dev by default).
  playMusic(name, options = {}) {
    var fade = options.fade ?? 0.8;
    var audio = this.get(name).musicElement();
    if ( this.currentMusic && this.currentMusic.audio === audio ) {
      this._fade(audio, this.musicVolume, 0.12);
      return;
    }
    var old = this.currentMusic;
    this.currentMusic = { name: name, audio: audio };
    try { audio.currentTime = 0; } catch (e) {}
    audio.volume = 0;
    var p = audio.play();
    if ( p && p.catch ) p.catch(() => {});   // ignore autoplay / not-yet-loaded rejections
    this._fade(audio, this.musicVolume, fade);
    if ( old && old.audio !== audio ) {
      this._fade(old.audio, 0, fade, () => { try { old.audio.pause(); } catch (e) {} });
    }
  }

  // Fade the current track down and stop it (e.g. when the credits crawl ends).
  fadeOutMusic(options = {}) {
    var fade = options.fade ?? 1;
    var cur = this.currentMusic;
    this.currentMusic = null;
    if ( cur ) this._fade(cur.audio, 0, fade, () => { try { cur.audio.pause(); } catch (e) {} });
  }

  // Live master controls (slider-driven). Music ramps immediately; sfx applies on
  // the next one-shot played.
  setMusicVolume(v) {
    this.musicVolume = Math.max(0, Math.min(1, v));
    if ( this.currentMusic ) this._fade(this.currentMusic.audio, this.musicVolume, 0.08);
  }

  setSfxVolume(v) {
    this.sfxVolume = Math.max(0, Math.min(1, v));
  }

  // Ramp an <audio> element's volume to `to` over `seconds`, cancelling any ramp
  // already on it. Timer-based, so it runs independent of the game loop.
  _fade(audio, to, seconds, onDone) {
    if ( audio._fadeTimer ) { clearInterval(audio._fadeTimer); audio._fadeTimer = null; }
    to = Math.max(0, Math.min(1, to));
    var from = audio.volume;
    var steps = Math.round((seconds || 0) * 60);
    if ( steps <= 1 ) { audio.volume = to; onDone && onDone(); return; }
    var i = 0;
    audio._fadeTimer = setInterval(() => {
      i++;
      audio.volume = Math.max(0, Math.min(1, from + (to - from) * (i / steps)));
      if ( i >= steps ) { clearInterval(audio._fadeTimer); audio._fadeTimer = null; onDone && onDone(); }
    }, 1000 / 60);
  }

  stop(name) {
    this.get(name).stop();
  }

  // Pause every currently-playing sound (e.g. when the app loses focus),
  // remembering which ones were playing so resumeAll() restarts exactly those.
  // Does not reset currentTime, so music continues where it left off.
  pauseAll() {
    this._resumeList = [];
    Object.values(this.sounds).forEach(sound => sound._pausePlaying(this._resumeList));
  }

  resumeAll() {
    (this._resumeList || []).forEach(audio => audio.play());
    this._resumeList = [];
  }

  preload(sounds) {
    if ( typeof sounds === "string" ) {
      sounds = [ sounds ];
    }
    sounds.forEach(sound => {
      this._loadSound(sound);
    });
  }

  _loadSound(path) {
    if ( path.indexOf('.') === -1 ) {
      path += ".ogg";
    }
    var [name, ext] = path.split('.');
    
    var sound = new Sound(this.root + name + "." + ext);
    return this.sounds[name] = sound;
  }

}

class Sound {
  static MAX_CHANNELS = 8;   // cap polyphony per sound (was unbounded -> leak)

  constructor(path) {
    var sound = new Audio();
    sound.src = path;
    sound.setAttribute("preload", "metadata");

    this.channels = [ sound ];
    this.channelPointer = 0;
  }

  play(options = {}) {
    if ( options.loop ) {
      this.playLoop(options);
      return;
    }

    // Reuse any channel that's free; only clone a new one up to a cap, then
    // recycle the oldest. Previously every overlapping play cloned an <audio>
    // element that was NEVER freed, so the pool grew for the page's lifetime —
    // a steady framerate leak over a long session.
    var channel = this.channels.find(c => c.paused || c.ended);
    if ( !channel ) {
      if ( this.channels.length < Sound.MAX_CHANNELS ) {
        channel = this.channels[0].cloneNode();
        this.channels.push(channel);
      } else {
        channel = this.channels[this.channelPointer];
        this.channelPointer = (this.channelPointer + 1) % this.channels.length;
        channel.currentTime = 0;
      }
    }

    channel.volume = options.volume ?? 1;
    channel.play();
  }

  playLoop(options = {}) {
    if ( !this.loopAudio ) {
      this.loopAudio = this.channels[0].cloneNode();
      this.loopAudio.loop = true;
    }
    this.loopAudio.volume = options.volume ?? 1;
    this.loopAudio.play();
  }

  // The single persistent looping element for this sound, used as a music track.
  // Its volume is managed externally by AudioLibrary's fades.
  musicElement() {
    if ( !this.loopAudio ) {
      this.loopAudio = this.channels[0].cloneNode();
      this.loopAudio.loop = true;
    }
    return this.loopAudio;
  }

  stop() {
    this.channels.forEach(channel => {
      channel.pause();
      channel.currentTime = 0;
    });
    if ( this.loopAudio ) {
      this.loopAudio.pause();
      this.loopAudio.currentTime = 0;
    }
  }

  // Pause whatever is currently audible and push those elements onto resumeList
  // so the caller can restart exactly them later.
  _pausePlaying(resumeList) {
    var all = this.channels.slice();
    if ( this.loopAudio ) {
      all.push(this.loopAudio);
    }
    all.forEach(audio => {
      if ( !audio.paused ) {
        audio.pause();
        resumeList.push(audio);
      }
    });
  }
}