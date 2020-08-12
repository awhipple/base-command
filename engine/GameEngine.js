import GameWindow from './gfx/GameWindow.js';
import ImageLibrary from './gfx/ImageLibrary.js';
import { KeyNames, MouseButtonNames } from './input/Enums.js';
import { Coord } from './GameMath.js';
import Button from './objects/Button.js';
import FullscreenSplash from './objects/FullScreenSplash.js';
import AudioLibrary from './AudioLibrary.js';
import FlashText from './gfx/FlashText.js';

export default class GameEngine {
  images = new ImageLibrary();
  sounds = new AudioLibrary();
  gameObjects = {all: []};
  globals = {};
  keyDownCallbacks = [];
  eventListeners = {};
  pressedKeys = {};
  mouse = {pos: new Coord(0, 0), left: false, right: false};
  fullscreen = false;
  eventTimers = {};

  constructor(options = {}) {
    this.mobile = (typeof window.orientation !== "undefined") || (navigator.userAgent.indexOf('IEMobile') !== -1);

    this.window = new GameWindow(this, options.canvasID ?? "gameCanvas", this.gameObjects.all, options);
    this.images.preload("fullscreen");

    this.dev = window.location.href.indexOf("localhost") !== -1;

    document.addEventListener('keydown', (event) => {
      var key = KeyNames[event.keyCode] || event.keyCode;
      this.pressedKeys[key] = true;
    });
    document.addEventListener('keyup', (event) => {
      var key = KeyNames[event.keyCode] || event.keyCode;
      delete this.pressedKeys[key];
    });

    this.window.canvas.addEventListener('mousemove', event => {
      this.mouse.pos = this.getMouseCoord(event);
    });

    this.onMouseDown(event => {
      setTimeout(() => {
        if ( !this.firstInteraction ) {
          this.firstInteraction = true;
          this.trigger("firstInteraction")
        }
      }, 50);
      this.mouse[MouseButtonNames[event.button] || event.button] = true;

      this._sendMouseEvent(event, "onMouseClick");
    });

    this.onMouseWheel(event => {
      this._sendMouseEvent(event, "onMouseWheel");
    });

    this.onMouseMove(event => {
      this._sendMouseEvent(event, "onMouseMove");
    });

    this.onMouseUp(event => {
      this.mouse[MouseButtonNames[event.button] || event.button] = false;
      
      this._sendMouseEvent(event, "onMouseUp");
    });

    document.addEventListener('fullscreenchange', (event) => {
      this.fullscreen = !!document.fullscreenElement;
    });
    if ( options.showFullscreenSplash ) {
      this.window.register(new FullscreenSplash(this));
    }

    this.load().then(() => {
      if ( options.showFullscreenIcon ) {
        this.fullscreenButton = new Button(this, this.images.get("fullscreen"), this.window.width-20, this.window.height-20, 0.05);
        this.register(this.fullscreenButton);
      }

      this.flash = new FlashText(this);
      this.register(this.flash);
    });

    this.startGameLoop();
  }

  register(object, name) {
    if ( Array.isArray(object) ) {
      object.forEach(obj => this.register(obj, name));
      return;
    }

    if (object === this) {
      console.log("You cannot register the engine as a game object!");
      console.trace();
      return;
    }

    if ( object.on === undefined ) {
      object.on = true;
    }

    if ( !object.engine ) {
      object.engine = this;
    }

    if ( this.gameObjects.all.indexOf(object) === -1 ) {
      this.gameObjects.all.push(object);

      // Store in its own collection if requested
      if ( name ) {
        this.gameObjects[name] = this.gameObjects[name] || {};
        do {
          object._hash = Math.floor(Math.random()*1000000000);
        } while (this.gameObjects[name][object._hash]);
        this.gameObjects[name][object._hash] = object;
      }
    }
  }

  unregister(object) {
    if ( typeof object === "string" ) {
      for ( var key in this.gameObjects[object]) {
        var obj = this.gameObjects[object][key];
        this.unregister(obj);
      }
    } else {
      object.unregister?.();
      var objectIndex = this.gameObjects.all.indexOf(object);
      if ( objectIndex !== -1 ) {
        this.gameObjects.all.splice(objectIndex, 1);
      }

      var keys = Object.keys(this.gameObjects);
      for ( var i = 0; i < keys.length; i++) {
        if ( keys[i] !== "all" ) {
          if ( this.gameObjects[keys[i]][object._hash] ) {
            delete this.gameObjects[keys[i]][object._hash];
          }
        }
      }
    }
  }

  getObjects(name) {
    this.gameObjects[name] = this.gameObjects[name] || {}
    return this.gameObjects[name] ? Object.values(this.gameObjects[name]) : [];
  }

  onUpdate(gameLoop) {
    this.gameLoop = gameLoop;
  }

  draw(drawLoop) {
    this.window.drawLoop = drawLoop;
  }

  startGameLoop() {
    this.nextTick = (new Date).getTime() - 100 * 1000;

    var engineLoop = () => {
      requestAnimationFrame(engineLoop);

      this.loops = 0;
      while (new Date().getTime() > this.nextTick && this.loops < 10) {
        this.update();
        this.nextTick += 1000/60;
        this.loops++;
      }
      this.nextTick = Math.max(this.nextTick, new Date().getTime());
    };

    requestAnimationFrame(engineLoop);
  }

  update() {
    this.gameObjects.all.forEach(obj => {
      obj.on && obj.update?.(this);
    });
  
    var pressedKeys = Object.keys(this.pressedKeys);
    for( var i = 0; i < this.keyDownCallbacks.length; i++ ) {
      for(var k = 0; k < pressedKeys.length; k++) {
        this.keyDownCallbacks[i]({key: pressedKeys[k]});
      }
    }

    for ( var key in this.eventTimers ) {
      this.eventTimers[key] -= 1/60;
    }

    // Developer provided game loop
    this.gameLoop?.();
    

    // Game Object rectangle collision callbacks
    this.gameObjects.all.forEach(obj => {
      if ( obj.on && obj.collisionCallbacks ) {
        for ( var key in obj.collisionCallbacks ) {
          for ( var targetKey in this.gameObjects[key] ?? {} ) {
            var target = this.gameObjects[key][targetKey];
            if ( target.rect && obj.rect.overlaps(target.rect) ) {
              obj.collisionCallbacks[key](target);
              if( this.gameObjects.all.indexOf(obj) === -1 ) {
                break;
              }
            }
          };
        }
      }
    });

    if ( !this.mobile && this.cursor !== this.window.canvas.style.cursor ) {
      this.window.canvas.style.cursor = this.cursor;
    }
    this.cursor = '';
  }

  load() {
    return this.images.load();
  }

  goFullscreen() {
    this.window.canvas.requestFullscreen();
  }

  onKeyPress(callback) {
    document.addEventListener('keydown', (event) => {
      callback(this._keyEvent(event));
    });
  }

  onKeyDown(callback) {
    this.keyDownCallbacks.push(callback);
  }

  onMouseMove(callback) {
    if ( this.mobile ) {
      this.onMouseDown(callback);
      this.window.canvas.addEventListener('touchmove', event => {
        callback({pos: this.getMouseCoord(event)});
      })
    } else {
      this.window.canvas.addEventListener('mousemove', event => {
        callback({pos: this.getMouseCoord(event)});
      });
    }
  }

  onMouseDown(callback) {
    this.window.canvas.addEventListener(this.mobile ? "touchstart" : 'mousedown', event => {
      callback(this._mouseEvent(event));
    });
  }

  onMouseUp(callback) {
    this.window.canvas.addEventListener(this.mobile ? "touchend" : 'mouseup', event => {
      callback(this._mouseEvent(event));
    });
  }

  onMouseWheel(callback) {
    this.window.canvas.addEventListener('mousewheel', event => {
      callback(this._mouseEvent(event));
    });
  }

  on(eventName, callback) {
    this.eventListeners[eventName] = this.eventListeners[eventName] || [];
    this.eventListeners[eventName].push(callback);
  }

  trigger(eventName, ...args) {
    var listeners = this.eventListeners[eventName] || [];
    for ( var i = 0; i < listeners.length; i++ ) {
      listeners[i].apply(null, args);
    }
  }

  getMouseCoord(event) {
    var canvas = this.window.canvas;
    var rect = canvas.getBoundingClientRect();
    
    var { clientX, clientY } = event.touches?.[0] ?? event.changedTouches?.[0] ?? event;

    return new Coord(
      (clientX - rect.x) * canvas.width / rect.width,
      (clientY - rect.y) * canvas.height / rect.height,
    );
  }

  get prod() {
    return !this.dev;
  }

  setProd() {
    this.dev = false;
  }

  // Used for console logs to prevent them from spamming
  oncePerSecond(callback, key = "onceOnly") {
    this.eventTimers[key] = this.eventTimers[key] ?? 0;
    if ( this.eventTimers[key] <= 0) {
      this.eventTimers[key] = Math.max(this.eventTimers[key], -0.05);
      this.eventTimers[key] += 1;
      callback();
    }
  }

  // A hack to stop the engine for debugging
  stopUntilClick() {
    this.nextTick = (new Date()).getTime() + 24 * 60 * 60 * 1000;
    this.onMouseDown(() => {
      if ( this.nextTick - (new Date()).getTime() > 1000 ) {
        this.nextTick = (new Date()).getTime();
      }
    });
  }

  _keyEvent(event) {
    return {
      key: KeyNames[event.keyCode] || event.keyCode
    }
  }

  _mouseEvent(event) {
    return {
      button: event.type === "touchstart" ? "left" : (MouseButtonNames[event.button] || event.button),
      pos: this.getMouseCoord(event),
      wheelDirection: event.wheelDeltaY < 0 ? "down" : "up",
    };
  }

  _sendMouseEvent(event, methodName) {
    if ( this.mobile && methodName === "onMouseClick") {
      this._sendMouseEvent(event, "onMouseMove");
    }

    // The game window currently sorts all these objects in order of their z value
    for ( var i = this.gameObjects.all.length - 1; i >= 0; i-- ) {
      var obj = this.gameObjects.all[i];
      if ( 
        !obj.hide && 
        typeof obj[methodName] === "function" && 
        obj.screenRect?.contains(event.pos.x, event.pos.y) 
      ) {
        event.relPos = { x: event.pos.x - obj.screenRect.x, y: event.pos.y - obj.screenRect.y };
        if ( !obj[methodName](event) ) {
          return;
        }
      }
    }
  }
}