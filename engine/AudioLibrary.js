export default class AudioLibrary {
  sounds = {};

  constructor(root = "./sounds/") {
    this.root = root;
  }

  get(name) {
    return this.sounds[name] || this._loadSound(name);
  }

  alias(name, original) {
    this.sounds[name] = this.get(original);
  }

  play(name, options = {}) {
    this.get(name).play(options);
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