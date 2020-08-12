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
  constructor(path) {
    var sound = new Audio();
    sound.src = path;
    sound.setAttribute("preload", "auto");
    
    this.channels = [ sound ];
    this.channelPointer = 0;
  }

  play(options = {}) {
    if ( options.loop ) {
      this.playLoop(options);
      return;
    } 

    this.channelPointer = (this.channelPointer + 1) % this.channels.length;
    
    if ( !this.channels[this.channelPointer].paused ) {
      this._addChannel();
    }

    var channel = this.channels[this.channelPointer];
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
    this.loopAudio.pause();
    this.loopAudio.currentTime = 0;
  }

  _addChannel() {
    var newNode = this.channels[0].cloneNode();
    this.channels.splice(this.channelPointer, 0, newNode);
  }
}